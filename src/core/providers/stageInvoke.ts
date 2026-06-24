import {
  AiCallTracker,
  buildFallbackRequest,
  formatAiCallLogDetails,
  pickAutoFallbackProvider,
  type AiCallLogEntry,
  type ProviderFallbackChoice,
  type ProviderFallbackRequest,
} from "@/core/providers/costControls";
import {
  recordProviderCircuitFailure,
  recordProviderCircuitSuccess,
} from "@/core/providers/circuitBreaker";
import {
  clearProviderCooldown,
  isProviderInCooldown,
  isRetryableReliabilityStatus,
  reliabilityStatusLabel,
  shouldCountTowardCircuitBreaker,
  isRequestTooLargeError,
} from "@/core/providers/reliability";
import {
  logProviderCircuitOpen,
  logProviderError,
  logProviderFallback,
  logProviderFailed,
  logProviderPreflight,
  logProviderRequest,
  logProviderRetry,
  logProviderSelected,
  logProviderSuccess,
  truncateResponseBody,
} from "@/core/providers/providerDiagnostics";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import {
  runProviderPreflight,
  type PreflightResult,
} from "@/core/providers/preflight";
import { resolveStageTimeoutMs } from "@/core/providers/stageTimeouts";
import {
  resolveStageRouting,
  type AgentStage,
} from "@/core/providers/orchestration";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";
import {
  formatAiCallBudgetDiagnostics,
  readAiCallBudgetDiagnostics,
} from "@/core/providers/aiCallBudgetDiagnostics";
import type { AiCallGatePurpose } from "@/core/providers/costControls";
import { retryBlockedDueToBudgetReason } from "@/core/providers/greenfieldCallBudget";

export interface StageProviderResult {
  readonly ok?: boolean;
  readonly error?: string;
  readonly latencyMs?: number;
  readonly provider?: ProviderId;
  readonly model?: string;
  readonly httpStatus?: number;
  readonly responseBody?: string;
  readonly apiKeyPresent?: boolean;
  /** Greenfield IPC may attach provider text even when main-process parse failed. */
  readonly rawText?: string;
}

function isGreenfieldProviderDelivered(
  stage: AgentStage,
  result: StageProviderResult,
): boolean {
  return (
    stage === "greenfield" &&
    typeof result.rawText === "string" &&
    result.rawText.trim().length > 0
  );
}

function isStageProviderSuccess(
  stage: AgentStage,
  result: StageProviderResult,
): boolean {
  if (isGreenfieldProviderDelivered(stage, result)) return true;
  return result.ok !== false && !(result.error && result.error.trim());
}

export type ProviderReliabilityLogKind =
  | "provider_health"
  | "provider_call"
  | "provider_fallback"
  | "provider_funds_issue"
  | "provider_preflight"
  | "provider_retry";

export interface ProviderReliabilityLogEvent {
  readonly kind: ProviderReliabilityLogKind;
  readonly status: string;
  readonly message: string;
  readonly provider?: ProviderId;
  readonly details?: string;
}

const MAX_SMART_RETRIES = 2;
const RETRY_BACKOFF_MS = [500, 1500] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modelForStageProvider(
  settings: ProviderSettings,
  stage: AgentStage,
  provider: ProviderId,
): string {
  const routing = resolveStageRouting(settings, stage);
  if (routing?.provider === provider && routing.model.trim()) {
    return routing.model;
  }
  return modelForProvider(settings, provider);
}

async function handlePreflightFailure(
  opts: Parameters<typeof invokeStageProvider>[0],
  preflight: PreflightResult,
  provider: ProviderId,
): Promise<ProviderId | "retry" | null> {
  logProviderPreflight({
    stage: opts.stage,
    provider: preflight.provider,
    model: preflight.model,
    ok: false,
    ...(preflight.reason ? { reason: preflight.reason } : {}),
  });
  opts.onReliabilityLog?.({
    kind: "provider_preflight",
    status: preflight.reason ?? "blocked",
    message: preflight.message ?? "Preflight failed",
    provider,
    ...(preflight.message ? { details: preflight.message } : {}),
  });

  if (preflight.blocked) {
    opts.onBudgetExceeded(preflight.message ?? "Provider preflight blocked this call.");
    return null;
  }

  const fallbackReq = buildFallbackRequest({
    settings: opts.settings,
    stage: opts.stage,
    failedProvider: provider,
    failedModel: preflight.model,
    error: preflight.message ?? preflight.reason ?? "Preflight failed",
  });
  if (!fallbackReq) {
    opts.onBudgetExceeded(preflight.message ?? "No fallback available.");
    return null;
  }
  return resolveFallbackChoice(opts, fallbackReq, provider);
}

function isPlannerParseFailure(
  stage: AgentStage,
  result: StageProviderResult,
): boolean {
  if (stage !== "planner") return false;
  const plan = result as StageProviderResult & {
    parseFailReason?: string;
  };
  if (
    plan.parseFailReason === "no_json" ||
    plan.parseFailReason === "empty_response" ||
    plan.parseFailReason === "schema_validation" ||
    plan.parseFailReason === "json_syntax" ||
    plan.parseFailReason === "truncated"
  ) {
    return true;
  }
  const error = result.error?.trim() ?? "";
  if (!error) return false;
  return /no json returned|empty provider response|gemini returned an empty response|schema validation failed|invalid json|response truncated/i.test(
    error,
  );
}

export async function invokeStageProvider<T extends StageProviderResult>(opts: {
  settings: ProviderSettings;
  stage: AgentStage;
  tracker: AiCallTracker;
  estimatedTokens: number;
  call: (provider: ProviderId) => Promise<T>;
  onLog: (entry: AiCallLogEntry, details: string) => void;
  onBudgetExceeded: (reason: string) => void;
  onReliabilityLog?: (event: ProviderReliabilityLogEvent) => void;
  onFallback: (request: ProviderFallbackRequest) => Promise<ProviderFallbackChoice>;
  healthByProvider?: Partial<Record<ProviderId, HealthResult>>;
  promptPayload?: string;
  patchSize?: "small" | "large";
  /** When true, do not smart-retry — caller will compress and retry once. */
  skipSmartRetry?: boolean;
  /** Budget bucket for this invoke (default primary; greenfield follow-ups use retry). */
  recordPurpose?: AiCallGatePurpose;
  /** Stage used for AI call budget gates (defaults to {@link stage}). */
  budgetStage?: AgentStage;
}): Promise<T | null> {
  const routing = resolveStageRouting(opts.settings, opts.stage);
  if (!routing || routing.stage === "verifier") {
    opts.onBudgetExceeded(
      `No provider routing configured for ${opts.stage} stage. Check Settings → Providers.`,
    );
    return null;
  }

  const budgetStage = opts.budgetStage ?? opts.stage;
  logProviderSelected(opts.settings, opts.stage);
  let provider = routing.provider;
  const timeoutMs = resolveStageTimeoutMs(opts.stage, {
    ...(opts.patchSize ? { patchSize: opts.patchSize } : {}),
  });
  const baseRecordPurpose: AiCallGatePurpose = opts.recordPurpose ?? "primary";

  while (true) {
    const model = modelForStageProvider(opts.settings, opts.stage, provider);
    const health = opts.healthByProvider?.[provider] ?? null;

    const preflight = runProviderPreflight({
      settings: opts.settings,
      stage: opts.stage,
      provider,
      model,
      estimatedTokens: opts.estimatedTokens,
      ...(opts.promptPayload ? { promptPayload: opts.promptPayload } : {}),
      health,
    });

    if (!preflight.ok) {
      if (preflight.reason === "provider_degraded") {
        logProviderCircuitOpen(provider, 3);
      }
      const resolved = await handlePreflightFailure(opts, preflight, provider);
      if (resolved === null) return null;
      if (resolved === "retry") {
        clearProviderCooldown(provider);
        continue;
      }
      provider = resolved;
      logProviderSelected(opts.settings, opts.stage, "fallback");
      continue;
    }

    logProviderPreflight({
      stage: opts.stage,
      provider,
      model: preflight.model,
      ok: true,
    });

    if (isProviderInCooldown(provider)) {
      const fallbackReq = buildFallbackRequest({
        settings: opts.settings,
        stage: opts.stage,
        failedProvider: provider,
        failedModel: model,
        error: `${provider} is in rate-limit cooldown`,
      });
      if (!fallbackReq) {
        opts.onBudgetExceeded(
          `${provider} is rate limited. Wait for cooldown or change provider in Settings.`,
        );
        return null;
      }
      const resolved = await resolveFallbackChoice(opts, fallbackReq, provider);
      if (resolved === null) return null;
      if (resolved === "retry") {
        clearProviderCooldown(provider);
        continue;
      }
      provider = resolved;
      continue;
    }

    const budget = opts.tracker.canMakeCall(opts.settings, {
      purpose: baseRecordPurpose,
      stage: budgetStage,
    });
    if (!budget.ok) {
      opts.onBudgetExceeded(budget.reason);
      return null;
    }

    let lastResult: T | null = null;
    let smartAttempt = 0;

    while (smartAttempt <= MAX_SMART_RETRIES) {
      const recordPurpose: AiCallGatePurpose =
        smartAttempt > 0 && baseRecordPurpose !== "repair" ? "retry" : baseRecordPurpose;

      if (smartAttempt > 0) {
        const retryBudget = opts.tracker.canMakeCall(opts.settings, {
          purpose: "retry",
          stage: budgetStage,
        });
        if (!retryBudget.ok) {
          opts.onReliabilityLog?.({
            kind: "provider_retry",
            status: "blocked",
            message: `${opts.stage} · ${provider} · retry blocked`,
            provider,
            details: retryBudget.reason,
          });
          break;
        }
        const backoffMs = RETRY_BACKOFF_MS[smartAttempt - 1] ?? 1500;
        logProviderRetry({
          stage: opts.stage,
          provider,
          model,
          attempt: smartAttempt,
          reason: lastResult?.error ?? "transient_failure",
          backoffMs,
        });
        opts.onReliabilityLog?.({
          kind: "provider_retry",
          status: "retrying",
          message: `${opts.stage} · ${provider} · attempt ${smartAttempt}`,
          provider,
          ...(lastResult?.error ? { details: lastResult.error } : {}),
        });
        await sleep(backoffMs);
      }

      const preCallBudget = opts.tracker.canMakeCall(opts.settings, {
        purpose: recordPurpose,
        stage: budgetStage,
      });
      if (!preCallBudget.ok) {
        opts.onBudgetExceeded(preCallBudget.reason);
        return null;
      }

      logProviderRequest(opts.stage, provider, model, {
        attempt: smartAttempt,
        timeoutMs,
        tokens: opts.estimatedTokens,
      });
      opts.onReliabilityLog?.({
        kind: "provider_call",
        status: "started",
        message: `${opts.stage} · ${provider} · ${model}`,
        provider,
      });

      const started = Date.now();
      const result = await opts.call(provider);
      lastResult = result;
      const durationMs = result.latencyMs ?? Date.now() - started;
      const ok = isStageProviderSuccess(opts.stage, result);
      const usedModel = result.model ?? model;
      const usedProvider = result.provider ?? provider;

      const recorded = opts.tracker.tryRecordCall(opts.settings, {
        purpose: recordPurpose,
        stage: budgetStage,
      });
      if (!recorded.ok) {
        opts.onBudgetExceeded(recorded.reason);
        return null;
      }

      const failure = ok
        ? null
        : logProviderError({
            stage: opts.stage,
            provider: usedProvider,
            model: usedModel,
            sdkMessage: result.error ?? "Provider call failed",
            ...(result.httpStatus != null ? { httpStatus: result.httpStatus } : {}),
            ...(result.responseBody ? { responseBody: result.responseBody } : {}),
            ...(result.apiKeyPresent != null
              ? { apiKeyPresent: result.apiKeyPresent }
              : {}),
            durationMs,
            settings: opts.settings,
          });

      const entry: AiCallLogEntry = {
        stage: opts.stage,
        provider: usedProvider,
        model: usedModel,
        estimatedTokens: opts.estimatedTokens,
        durationMs,
        ok,
        ...(result.error ? { error: result.error } : {}),
        ...(failure ? { failureStatus: failure.status } : {}),
      };
      opts.onLog(entry, `${formatAiCallLogDetails(entry)}\n${formatAiCallBudgetDiagnostics(
        readAiCallBudgetDiagnostics(opts.tracker, opts.settings, 1, {
          afterSuccessfulCall: ok,
        }),
      )}`);

      if (ok) {
        recordProviderCircuitSuccess(usedProvider);
        logProviderSuccess({
          stage: opts.stage,
          provider: usedProvider,
          model: usedModel,
          durationMs,
          attempt: smartAttempt,
        });
        opts.onReliabilityLog?.({
          kind: "provider_call",
          status: "success",
          message: `${opts.stage} · ${usedProvider} · ${usedModel}`,
          provider: usedProvider,
          details: formatAiCallLogDetails(entry),
        });
        return result;
      }

      if (shouldCountTowardCircuitBreaker(failure?.status, result.error)) {
        recordProviderCircuitFailure(usedProvider);
      }
      logProviderFailed({
        stage: opts.stage,
        provider: usedProvider,
        model: usedModel,
        reason: failure?.status ?? "unknown_error",
        durationMs,
      });

      const errorDetails = failure
        ? [
            `provider=${usedProvider}`,
            `model=${usedModel}`,
            `stage=${opts.stage}`,
            `status=${failure.status}`,
            result.httpStatus != null ? `http=${result.httpStatus}` : null,
            result.apiKeyPresent != null ? `apiKeyPresent=${result.apiKeyPresent}` : null,
            `durationMs=${durationMs}`,
            `message=${failure.technicalMessage}`,
            result.responseBody
              ? `body=${truncateResponseBody(result.responseBody)}`
              : null,
          ]
            .filter(Boolean)
            .join(" ")
        : undefined;
      opts.onReliabilityLog?.({
        kind: "provider_call",
        status: failure?.status ?? "unknown_error",
        message: `${opts.stage} · ${usedProvider} · ${usedModel}`,
        provider: usedProvider,
        ...(errorDetails ? { details: errorDetails } : {}),
      });

      if (failure?.status === "insufficient_credits") {
        opts.onReliabilityLog?.({
          kind: "provider_funds_issue",
          status: "insufficient_credits",
          message: `${usedProvider} · ${usedModel}`,
          provider: usedProvider,
          details: failure.technicalMessage,
        });
      }

      const canRetry =
        failure &&
        baseRecordPurpose !== "repair" &&
        !isPlannerParseFailure(opts.stage, result) &&
        !opts.skipSmartRetry &&
        failure.status !== "request_too_large" &&
        !isRequestTooLargeError(result.error) &&
        isRetryableReliabilityStatus(failure.status, result.error) &&
        smartAttempt < MAX_SMART_RETRIES;

      if (canRetry) {
        const retryBudget = opts.tracker.canMakeCall(opts.settings, {
          purpose: "retry",
          stage: budgetStage,
        });
        if (!retryBudget.ok) {
          opts.onReliabilityLog?.({
            kind: "provider_retry",
            status: "blocked",
            message: `${opts.stage} · ${usedProvider} · retry blocked`,
            provider: usedProvider,
            details:
              opts.stage === "greenfield"
                ? retryBlockedDueToBudgetReason(
                    opts.tracker.budget(opts.settings).maxCalls,
                    opts.tracker.budget(opts.settings).repairReserve,
                  )
                : retryBudget.reason,
          });
          break;
        }
        smartAttempt += 1;
        continue;
      }

      break;
    }

    const finalResult = lastResult!;

    const fallbackReq = buildFallbackRequest({
      settings: opts.settings,
      stage: opts.stage,
      failedProvider: finalResult.provider ?? provider,
      failedModel: finalResult.model ?? model,
      error: finalResult.error ?? "Provider call failed",
      ...(finalResult.httpStatus != null ? { httpStatus: finalResult.httpStatus } : {}),
    });
    if (!fallbackReq) return finalResult;

    const resolved = await resolveFallbackChoice(
      opts,
      fallbackReq,
      finalResult.provider ?? provider,
    );
    if (resolved === null) return null;
    if (resolved === "retry") {
      clearProviderCooldown(finalResult.provider ?? provider);
      provider = finalResult.provider ?? provider;
      continue;
    }
    provider = resolved;
    logProviderSelected(opts.settings, opts.stage, "fallback");
  }
}

async function resolveFallbackChoice(
  opts: {
    settings: ProviderSettings;
    onFallback: (request: ProviderFallbackRequest) => Promise<ProviderFallbackChoice>;
    onReliabilityLog?: (event: ProviderReliabilityLogEvent) => void;
    onBudgetExceeded: (reason: string) => void;
  },
  fallbackReq: ProviderFallbackRequest,
  failedProvider: ProviderId,
): Promise<ProviderId | "retry" | null> {
  opts.onReliabilityLog?.({
    kind: "provider_fallback",
    status: "offered",
    message: `${fallbackReq.failedProvider} · ${reliabilityStatusLabel(fallbackReq.failure.status)}`,
    provider: fallbackReq.failedProvider,
    details: fallbackReq.failure.userMessage,
  });

  if (opts.settings.askBeforeFallback === false) {
    const auto = pickAutoFallbackProvider(failedProvider, opts.settings);
    if (!auto) {
      opts.onBudgetExceeded(fallbackReq.failure.userMessage);
      return null;
    }
    const toModel = modelForProvider(opts.settings, auto);
    logProviderFallback({
      from: `${fallbackReq.failedProvider}:${fallbackReq.failedModel}`,
      to: `${auto}:${toModel}`,
      reason: fallbackReq.failure.status,
      stage: fallbackReq.stage,
    });
    opts.onReliabilityLog?.({
      kind: "provider_fallback",
      status: "selected",
      message: auto,
      provider: auto,
      details: "Automatic fallback (Ask before fallback = off)",
    });
    return auto;
  }

  const choice = await opts.onFallback(fallbackReq);
  if (choice === "cancel") {
    opts.onReliabilityLog?.({
      kind: "provider_fallback",
      status: "cancelled",
      message: failedProvider,
      provider: failedProvider,
    });
    opts.onBudgetExceeded("Greenfield generation cancelled — provider fallback declined.");
    return null;
  }
  if (choice === "retry") {
    opts.onReliabilityLog?.({
      kind: "provider_fallback",
      status: "selected",
      message: `${failedProvider} (retry)`,
      provider: failedProvider,
    });
    return "retry";
  }

  const toModel = modelForProvider(opts.settings, choice);
  logProviderFallback({
    from: `${fallbackReq.failedProvider}:${fallbackReq.failedModel}`,
    to: `${choice}:${toModel}`,
    reason: fallbackReq.failure.status,
    stage: fallbackReq.stage,
  });
  opts.onReliabilityLog?.({
    kind: "provider_fallback",
    status: "selected",
    message: choice,
    provider: choice,
  });
  return choice;
}
