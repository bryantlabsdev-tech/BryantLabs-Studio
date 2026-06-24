import { modelForProvider } from "@/core/providers/AnthropicProvider";
import {
  getProviderDegradedUntil,
  isProviderDegraded,
} from "@/core/providers/circuitBreaker";
import {
  resolveStageRouting,
  type AgentStage,
} from "@/core/providers/orchestration";
import {
  providerApiKeyPresent,
} from "@/core/providers/providerDiagnostics";
import {
  checkRequestSize,
  estimateTokens,
} from "@/core/providers/requestSize";
import { getProviderInputTokenLimit } from "@/core/contextEngine/tokenBudget";
import {
  buildProviderFailure,
  isProviderInCooldown,
  type ProviderReliabilityStatus,
} from "@/core/providers/reliability";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";
import { isRendererE2eMockMode } from "@/core/providers/e2eMockMode";

export type PreflightBlockReason =
  | "missing_key"
  | "invalid_key"
  | "model_mismatch"
  | "model_missing"
  | "provider_degraded"
  | "provider_cooldown"
  | "provider_offline"
  | "request_too_large";

export interface PreflightResult {
  readonly ok: boolean;
  readonly provider: ProviderId;
  readonly model: string;
  readonly estimatedTokens: number;
  readonly blocked: boolean;
  readonly reason?: PreflightBlockReason;
  readonly message?: string;
  readonly status?: ProviderReliabilityStatus;
}

const GEMINI_MODEL_RE = /^gemini/i;
const ANTHROPIC_MODEL_RE = /^claude/i;
const GROQ_MODEL_RE = /^(llama|qwen|openai\/gpt|mixtral|gemma|meta-llama)/i;

/** Detect obvious provider/model mismatches (e.g. Gemini model on Anthropic stage). */
export function detectModelProviderMismatch(
  provider: ProviderId,
  model: string,
): boolean {
  const m = model.trim();
  if (!m) return false;
  switch (provider) {
    case "gemini":
      return !GEMINI_MODEL_RE.test(m);
    case "anthropic":
      return !ANTHROPIC_MODEL_RE.test(m);
    case "groq":
      return (
        GEMINI_MODEL_RE.test(m) ||
        ANTHROPIC_MODEL_RE.test(m) ||
        (!GROQ_MODEL_RE.test(m) && m.includes("/"))
      );
    case "openrouter":
      return GEMINI_MODEL_RE.test(m) && !m.includes("/");
    case "ollama":
      return GEMINI_MODEL_RE.test(m) || ANTHROPIC_MODEL_RE.test(m);
    default:
      return false;
  }
}

export function resolveStageModel(
  settings: ProviderSettings,
  stage: AgentStage,
  provider: ProviderId,
): string {
  const routing = resolveStageRouting(settings, stage);
  if (routing && routing.provider === provider && routing.model.trim()) {
    return routing.model.trim();
  }
  return modelForProvider(settings, provider).trim();
}

function healthIndicatesOffline(
  health: HealthResult | null | undefined,
): boolean {
  if (!health) return false;
  if (health.ok) return false;
  return health.connectionStatus === "offline";
}

export function runProviderPreflight(opts: {
  settings: ProviderSettings;
  stage: AgentStage;
  provider: ProviderId;
  model?: string;
  estimatedTokens?: number;
  promptPayload?: string;
  health?: HealthResult | null;
  skipHealthCheck?: boolean;
}): PreflightResult {
  const provider = opts.provider;
  const model = (opts.model ?? resolveStageModel(opts.settings, opts.stage, provider)).trim();
  const estimatedTokens =
    opts.estimatedTokens ??
    (opts.promptPayload ? estimateTokens(opts.promptPayload) : 0);

  const fail = (
    reason: PreflightBlockReason,
    message: string,
    status: ProviderReliabilityStatus,
    blocked = true,
  ): PreflightResult => ({
    ok: false,
    provider,
    model,
    estimatedTokens,
    blocked,
    reason,
    message,
    status,
  });

  const cloudProviders: ProviderId[] = [
    "gemini",
    "anthropic",
    "groq",
    "openrouter",
  ];
  const skipKeyCheck = isRendererE2eMockMode();
  if (
    !skipKeyCheck &&
    cloudProviders.includes(provider) &&
    !providerApiKeyPresent(opts.settings, provider)
  ) {
    return fail(
      "missing_key",
      `No ${provider} API key is stored. Add one in Settings.`,
      "missing_key",
    );
  }

  if (provider === "ollama") {
    if (!opts.settings.ollamaBaseUrl.trim()) {
      return fail("provider_offline", "Ollama server URL is not configured.", "offline");
    }
    if (!model) {
      return fail("model_missing", "No Ollama model selected.", "model_missing");
    }
  }

  if (!model) {
    return fail("model_missing", `No model configured for ${provider}.`, "model_missing");
  }

  if (detectModelProviderMismatch(provider, model)) {
    return fail(
      "model_mismatch",
      `Model "${model}" does not match provider ${provider}. Check stage routing in Settings.`,
      "model_missing",
    );
  }

  if (isProviderDegraded(provider)) {
    const until = getProviderDegradedUntil(provider);
    return fail(
      "provider_degraded",
      `${provider} is temporarily degraded${until ? ` until ${new Date(until).toLocaleTimeString()}` : ""}. Using backup if available.`,
      "offline",
      false,
    );
  }

  if (isProviderInCooldown(provider)) {
    return fail(
      "provider_cooldown",
      `${provider} is in rate-limit cooldown.`,
      "rate_limited",
      false,
    );
  }

  if (!opts.skipHealthCheck && healthIndicatesOffline(opts.health)) {
    return fail(
      "provider_offline",
      opts.health?.error ?? `${provider} appears offline.`,
      "offline",
      false,
    );
  }

  if (opts.promptPayload) {
    const sizeCheck = checkRequestSize(
      opts.stage,
      opts.promptPayload,
      opts.provider,
    );
    if (!sizeCheck.ok) {
      return fail(
        "request_too_large",
        `Request too large (~${sizeCheck.estimatedTokens} tokens, budget ${sizeCheck.budget}). Trim context or reduce file scope.`,
        "request_too_large",
      );
    }
  } else if (estimatedTokens > 0) {
    const budget = getProviderInputTokenLimit(opts.provider, opts.stage);
    if (estimatedTokens > budget) {
      return fail(
        "request_too_large",
        `Estimated request ~${estimatedTokens} tokens exceeds budget ${budget}.`,
        "request_too_large",
      );
    }
  }

  return { ok: true, provider, model, estimatedTokens, blocked: false };
}

export function preflightToFailure(
  preflight: PreflightResult,
  settings: ProviderSettings,
) {
  return buildProviderFailure({
    provider: preflight.provider,
    model: preflight.model,
    error: preflight.message ?? "Preflight check failed",
    settings,
  });
}
