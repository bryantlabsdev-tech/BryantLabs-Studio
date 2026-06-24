import {
  buildProviderFailure,
  redactProviderSecrets,
  reliabilityStatusLabel,
  type ProviderFailure,
  type ProviderReliabilityStatus,
} from "@/core/providers/reliability";
import {
  resolveStageRouting,
  type AgentStage,
} from "@/core/providers/orchestration";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";

export interface ProviderErrorContext {
  readonly stage: AgentStage;
  readonly provider: ProviderId;
  readonly model: string;
  readonly httpStatus?: number;
  readonly responseBody?: string;
  readonly sdkMessage?: string;
  readonly apiKeyPresent?: boolean;
  readonly durationMs?: number;
  readonly settings: ProviderSettings;
}

export function providerApiKeyPresent(
  settings: ProviderSettings,
  provider: ProviderId,
): boolean {
  switch (provider) {
    case "gemini":
      return settings.hasGeminiKey;
    case "anthropic":
      return settings.hasAnthropicKey;
    case "groq":
      return settings.hasGroqKey;
    case "openrouter":
      return settings.hasOpenRouterKey;
    case "ollama":
      return settings.ollamaBaseUrl.trim().length > 0;
    default:
      return false;
  }
}

export function truncateResponseBody(body: string | null | undefined, max = 600): string {
  if (!body?.trim()) return "";
  const redacted = redactProviderSecrets(body.trim());
  return redacted.length <= max ? redacted : `${redacted.slice(0, max)}…`;
}

export function buildProviderErrorContext(
  opts: Omit<ProviderErrorContext, "apiKeyPresent"> & { apiKeyPresent?: boolean },
): ProviderErrorContext {
  return {
    ...opts,
    apiKeyPresent:
      opts.apiKeyPresent ?? providerApiKeyPresent(opts.settings, opts.provider),
  };
}

export function formatProviderErrorLog(ctx: ProviderErrorContext): string {
  const message =
    ctx.sdkMessage?.trim() ||
    ctx.responseBody?.trim() ||
    "Provider request failed";
  const failure = buildProviderFailure({
    provider: ctx.provider,
    model: ctx.model,
    error: message,
    settings: ctx.settings,
    ...(ctx.httpStatus != null ? { httpStatus: ctx.httpStatus } : {}),
  });
  const body = truncateResponseBody(ctx.responseBody);
  return [
    `[provider:error] status=${ctx.httpStatus ?? "—"}`,
    `reason=${failure.status}`,
    `message=${redactProviderSecrets(message)}`,
    body ? `body=${body}` : null,
    `provider=${ctx.provider}`,
    `model=${ctx.model}`,
    `stage=${ctx.stage}`,
    `apiKeyPresent=${ctx.apiKeyPresent}`,
    ctx.durationMs != null ? `durationMs=${ctx.durationMs}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function logProviderSelected(
  settings: ProviderSettings,
  stage: AgentStage,
  source: "settings" | "fallback" = "settings",
): void {
  const routing = resolveStageRouting(settings, stage);
  if (!routing || routing.stage === "verifier") return;
  console.log(
    `[provider:selected] provider=${routing.provider} model=${routing.model} source=${source} stage=${stage}`,
  );
}

export function logProviderRequest(
  stage: AgentStage,
  provider: ProviderId,
  model: string,
  extras?: { attempt?: number; timeoutMs?: number; tokens?: number },
): void {
  const parts = [
    `[provider:request]`,
    `stage=${stage}`,
    `provider=${provider}`,
    `model=${model}`,
  ];
  if (extras?.attempt != null) parts.push(`attempt=${extras.attempt}`);
  if (extras?.timeoutMs != null) parts.push(`timeoutMs=${extras.timeoutMs}`);
  if (extras?.tokens != null) parts.push(`tokens=${extras.tokens}`);
  console.log(parts.join(" "));
}

export function logProviderPreflight(opts: {
  stage: AgentStage;
  provider: ProviderId;
  model: string;
  ok: boolean;
  reason?: string;
}): void {
  console.log(
    `[provider:preflight] stage=${opts.stage} provider=${opts.provider} model=${opts.model} ok=${opts.ok}` +
      (opts.reason ? ` reason=${opts.reason}` : ""),
  );
}

export function logProviderRetry(opts: {
  stage: AgentStage;
  provider: ProviderId;
  model: string;
  attempt: number;
  reason: string;
  backoffMs: number;
}): void {
  console.log(
    `[provider:retry] stage=${opts.stage} provider=${opts.provider} model=${opts.model} attempt=${opts.attempt} reason=${opts.reason} backoffMs=${opts.backoffMs}`,
  );
}

export function logProviderJsonRepair(opts: {
  provider: ProviderId;
  method: string;
  ok: boolean;
}): void {
  console.log(
    `[provider:json_repair] provider=${opts.provider} method=${opts.method} ok=${opts.ok}`,
  );
}

export function logProviderCircuitOpen(provider: ProviderId, failures: number): void {
  console.warn(
    `[provider:circuit_open] provider=${provider} failures=${failures} window=5m`,
  );
}

export function logProviderSuccess(opts: {
  stage: AgentStage;
  provider: ProviderId;
  model: string;
  durationMs: number;
  attempt?: number;
}): void {
  console.log(
    `[provider:success] stage=${opts.stage} provider=${opts.provider} model=${opts.model} durationMs=${opts.durationMs}` +
      (opts.attempt != null ? ` attempt=${opts.attempt}` : ""),
  );
}

export function logProviderFailed(opts: {
  stage: AgentStage;
  provider: ProviderId;
  model: string;
  reason: string;
  durationMs?: number;
}): void {
  console.error(
    `[provider:failed] stage=${opts.stage} provider=${opts.provider} model=${opts.model} reason=${opts.reason}` +
      (opts.durationMs != null ? ` durationMs=${opts.durationMs}` : ""),
  );
}

export function logProviderFallback(opts: {
  from: string;
  to: string;
  reason: string;
  stage?: AgentStage;
}): void {
  const stageSuffix = opts.stage ? ` stage=${opts.stage}` : "";
  console.log(
    `[provider:fallback] from=${opts.from} to=${opts.to} reason=${opts.reason}${stageSuffix}`,
  );
}

export function logProviderError(ctx: ProviderErrorContext): ProviderFailure {
  const line = formatProviderErrorLog(ctx);
  console.error(line);
  const message =
    ctx.sdkMessage?.trim() ||
    ctx.responseBody?.trim() ||
    "Provider request failed";
  return buildProviderFailure({
    provider: ctx.provider,
    model: ctx.model,
    error: message,
    settings: ctx.settings,
    ...(ctx.httpStatus != null ? { httpStatus: ctx.httpStatus } : {}),
  });
}

export function formatConnectionFailureMessage(
  status: ProviderReliabilityStatus,
  provider: ProviderId,
  technical?: string,
): string {
  const label = reliabilityStatusLabel(status);
  const detail = technical?.trim();
  return detail ? `${label} (${provider}): ${detail}` : `${label} (${provider})`;
}

export function globalProviderSelectionPatch(
  provider: ProviderId,
  model?: string,
): import("@/core/providers/types").ProviderSettingsInput {
  const patch: import("@/core/providers/types").ProviderSettingsInput = {
    provider,
    plannerProvider: provider,
    coderProvider: provider,
    repairProvider: provider,
  };
  if (model?.trim()) {
    switch (provider) {
      case "gemini":
        patch.geminiModel = model.trim();
        patch.plannerModel = model.trim();
        patch.coderModel = model.trim();
        patch.repairModel = model.trim();
        break;
      case "anthropic":
        patch.anthropicModel = model.trim();
        patch.plannerModel = model.trim();
        patch.coderModel = model.trim();
        patch.repairModel = model.trim();
        break;
      case "groq":
        patch.groqModel = model.trim();
        patch.plannerModel = model.trim();
        patch.coderModel = model.trim();
        patch.repairModel = model.trim();
        break;
      case "openrouter":
        patch.openrouterModel = model.trim();
        patch.plannerModel = model.trim();
        patch.coderModel = model.trim();
        patch.repairModel = model.trim();
        break;
      case "ollama":
        patch.ollamaModel = model.trim();
        patch.plannerModel = model.trim();
        patch.coderModel = model.trim();
        patch.repairModel = model.trim();
        break;
    }
  }
  return patch;
}
