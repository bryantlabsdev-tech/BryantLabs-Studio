import { getProviderInfo } from "@/core/providers/registry";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";
import type { AgentStage } from "@/core/providers/orchestration";

/** Phase 24 — unified provider reliability status. */
export type ProviderReliabilityStatus =
  | "online"
  | "offline"
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "insufficient_credits"
  | "model_missing"
  | "timeout"
  | "safety_blocked"
  | "request_too_large"
  | "unknown_error";

export type ProviderFallbackChoice = ProviderId | "retry" | "cancel";

export interface ProviderFailure {
  readonly provider: ProviderId;
  readonly model: string;
  readonly status: ProviderReliabilityStatus;
  readonly errorCode: string;
  readonly userMessage: string;
  readonly technicalMessage: string;
  readonly retryable: boolean;
  readonly suggestedFallbacks: readonly ProviderId[];
}

export interface ProviderFallbackOption {
  readonly provider: ProviderId;
  readonly label: string;
  readonly model: string;
}

export interface ProviderFallbackRequestV2 {
  readonly stage: AgentStage;
  readonly failedProvider: ProviderId;
  readonly failedModel: string;
  readonly failure: ProviderFailure;
  readonly options: readonly ProviderFallbackOption[];
  readonly allowRetry: boolean;
}

const RATE_LIMIT_RE =
  /rate.?limit|429|too many requests|quota exceeded|resource exhausted/i;
const CREDITS_RE =
  /insufficient.?credit|billing|payment required|402|out of credits|balance|payment/i;
const OFFLINE_RE =
  /offline|unreachable|econnrefused|enotfound|network|fetch failed|connection refused|cannot reach/i;
const MISSING_KEY_RE =
  /no .* api key|missing api key|api key.*not stored|add one in settings/i;
const INVALID_KEY_RE =
  /invalid api key|invalid.?key|401|403|unauthorized|authentication|permission denied/i;
const MODEL_MISSING_RE =
  /not installed|model_missing|not found|ollama pull|selected model/i;
const TIMEOUT_RE = /timed out|timeout|abort/i;
const NO_JSON_RE =
  /no json returned|no json|parse.*json|invalid json|json syntax|schema validation|not valid json/i;
const HIGH_DEMAND_RE =
  /high demand|overloaded|503|service unavailable|capacity|temporarily unavailable/i;
const SAFETY_RE =
  /safety|blocked|blockreason|content filtered|prompt was blocked|harmful/i;
const MODEL_UNAVAILABLE_RE =
  /model.*not found|not available|invalid model|404|models\/.*not found/i;
const REQUEST_TOO_LARGE_RE =
  /prompt tokens limit|tokens limit exceeded|context length|too many tokens|request too large|token limit|maximum context/i;
const INVALID_REQUEST_RE =
  /invalid request|bad request|malformed request|422/i;

/** Preferred fallback order when a provider fails. */
export const FALLBACK_PROVIDER_ORDER: readonly ProviderId[] = [
  "gemini",
  "anthropic",
  "openrouter",
  "groq",
  "ollama",
];

const DEFAULT_COOLDOWN_MS = 60_000;
const cooldownUntil = new Map<ProviderId, number>();

export function reliabilityStatusLabel(status: ProviderReliabilityStatus): string {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "missing_key":
      return "Missing key";
    case "invalid_key":
      return "Invalid key";
    case "rate_limited":
      return "Rate limited";
    case "insufficient_credits":
      return "Insufficient credits";
    case "model_missing":
      return "Model missing";
    case "timeout":
      return "Timeout";
    case "safety_blocked":
      return "Safety block";
    case "request_too_large":
      return "Request too large";
    default:
      return "Unknown error";
  }
}

export function isRequestTooLargeError(error: string | undefined | null): boolean {
  return REQUEST_TOO_LARGE_RE.test((error ?? "").trim());
}

/** Request-size and config failures must not degrade provider health. */
export function shouldCountTowardCircuitBreaker(
  status: ProviderReliabilityStatus | null | undefined,
  error?: string | null,
): boolean {
  if (status === "request_too_large") return false;
  if (status === "missing_key" || status === "invalid_key") return false;
  if (status === "model_missing") return false;
  if (error && INVALID_REQUEST_RE.test(error)) return false;
  if (error && isRequestTooLargeError(error)) return false;
  return true;
}

export function classifyReliabilityFromError(
  error: string | undefined | null,
  httpStatus?: number | null,
): ProviderReliabilityStatus | null {
  const msg = (error ?? "").trim();
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 402) return "insufficient_credits";
  if (httpStatus === 404) return "model_missing";
  if (httpStatus === 401 || httpStatus === 403) {
    return MISSING_KEY_RE.test(msg) ? "missing_key" : "invalid_key";
  }
  if (!msg) return null;
  if (isRequestTooLargeError(msg)) return "request_too_large";
  if (INVALID_REQUEST_RE.test(msg)) return "unknown_error";
  if (SAFETY_RE.test(msg)) return "safety_blocked";
  if (NO_JSON_RE.test(msg)) return "unknown_error";
  if (HIGH_DEMAND_RE.test(msg)) return "timeout";
  if (RATE_LIMIT_RE.test(msg)) return "rate_limited";
  if (CREDITS_RE.test(msg)) return "insufficient_credits";
  if (MODEL_UNAVAILABLE_RE.test(msg) || MODEL_MISSING_RE.test(msg)) {
    return "model_missing";
  }
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (MISSING_KEY_RE.test(msg)) return "missing_key";
  if (INVALID_KEY_RE.test(msg)) return "invalid_key";
  if (OFFLINE_RE.test(msg)) return "offline";
  return "unknown_error";
}

export function isRecoverableReliabilityStatus(
  status: ProviderReliabilityStatus,
): boolean {
  return (
    status === "rate_limited" ||
    status === "insufficient_credits" ||
    status === "offline" ||
    status === "missing_key" ||
    status === "invalid_key" ||
    status === "model_missing" ||
    status === "timeout" ||
    status === "safety_blocked"
  );
}

export function isRetryableReliabilityStatus(
  status: ProviderReliabilityStatus,
  error?: string,
): boolean {
  if (status === "request_too_large") return false;
  if (
    status === "rate_limited" ||
    status === "offline" ||
    status === "timeout" ||
    status === "unknown_error"
  ) {
    return true;
  }
  if (error && NO_JSON_RE.test(error)) return true;
  if (error && HIGH_DEMAND_RE.test(error)) return true;
  return false;
}

export function setProviderCooldown(
  provider: ProviderId,
  untilMs = Date.now() + DEFAULT_COOLDOWN_MS,
): void {
  cooldownUntil.set(provider, untilMs);
}

export function clearProviderCooldown(provider: ProviderId): void {
  cooldownUntil.delete(provider);
}

export function getProviderCooldownUntil(provider: ProviderId): number | null {
  const until = cooldownUntil.get(provider);
  if (until == null) return null;
  if (until <= Date.now()) {
    cooldownUntil.delete(provider);
    return null;
  }
  return until;
}

export function isProviderInCooldown(provider: ProviderId): boolean {
  return getProviderCooldownUntil(provider) != null;
}

export function getActiveCooldowns(): Readonly<Record<ProviderId, number>> {
  const out: Partial<Record<ProviderId, number>> = {};
  for (const id of FALLBACK_PROVIDER_ORDER) {
    const until = getProviderCooldownUntil(id);
    if (until != null) out[id] = until;
  }
  return out as Record<ProviderId, number>;
}

function providerHasApiKey(settings: ProviderSettings, id: ProviderId): boolean {
  switch (id) {
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

function isProviderUsable(id: ProviderId, settings: ProviderSettings): boolean {
  if (isProviderInCooldown(id)) return false;
  if (id === "ollama") {
    return (
      settings.ollamaBaseUrl.trim().length > 0 &&
      settings.ollamaModel.trim().length > 0
    );
  }
  return providerHasApiKey(settings, id);
}

export function buildSuggestedFallbacks(
  failedProvider: ProviderId,
  settings: ProviderSettings,
): ProviderId[] {
  const backup = settings.backupProvider;
  const ordered: ProviderId[] = [];
  if (
    backup &&
    backup !== failedProvider &&
    isProviderUsable(backup, settings)
  ) {
    ordered.push(backup);
  }
  for (const id of FALLBACK_PROVIDER_ORDER) {
    if (id === failedProvider || ordered.includes(id)) continue;
    if (isProviderUsable(id, settings)) ordered.push(id);
  }
  return ordered;
}

export function buildFallbackOptions(
  failedProvider: ProviderId,
  settings: ProviderSettings,
): ProviderFallbackOption[] {
  return buildSuggestedFallbacks(failedProvider, settings).map((provider) => ({
    provider,
    label: getProviderInfo(provider).label,
    model: modelForProvider(settings, provider) || "—",
  }));
}

export function buildProviderFailure(opts: {
  provider: ProviderId;
  model: string;
  error: string;
  httpStatus?: number | null;
  settings: ProviderSettings;
}): ProviderFailure {
  const status =
    classifyReliabilityFromError(opts.error, opts.httpStatus) ?? "unknown_error";
  const userMessage = reliabilityUserMessage(status, opts.error);
  return {
    provider: opts.provider,
    model: opts.model,
    status,
    errorCode: status,
    userMessage,
    technicalMessage: opts.error,
    retryable: isRetryableReliabilityStatus(status, opts.error),
    suggestedFallbacks: buildSuggestedFallbacks(opts.provider, opts.settings),
  };
}

export function reliabilityUserMessage(
  status: ProviderReliabilityStatus,
  technical?: string,
): string {
  switch (status) {
    case "rate_limited":
      return "This provider is rate limited. Try again later or choose a fallback.";
    case "insufficient_credits":
      return "This provider reported insufficient credits or billing issues.";
    case "offline":
      return "The provider appears offline or unreachable.";
    case "missing_key":
      return "No API key is stored for this provider.";
    case "invalid_key":
      return "The API key appears invalid or unauthorized.";
    case "model_missing":
      return "The selected model is not available on this provider.";
    case "timeout":
      return "The provider request timed out.";
    case "safety_blocked":
      return "The provider blocked the request for safety reasons.";
    case "request_too_large":
      return "The request exceeds the provider token limit. Context was trimmed automatically.";
    default:
      return technical?.trim() || "The provider returned an error.";
  }
}

export function buildFallbackRequestV2(opts: {
  settings: ProviderSettings;
  stage: AgentStage;
  failedProvider: ProviderId;
  failedModel: string;
  error: string;
  httpStatus?: number | null;
}): ProviderFallbackRequestV2 | null {
  const failure = buildProviderFailure({
    provider: opts.failedProvider,
    model: opts.failedModel,
    error: opts.error,
    settings: opts.settings,
    ...(opts.httpStatus != null ? { httpStatus: opts.httpStatus } : {}),
  });
  if (!isRecoverableReliabilityStatus(failure.status)) return null;
  if (opts.settings.stopOnProviderLimit === false) return null;

  if (failure.status === "rate_limited") {
    setProviderCooldown(opts.failedProvider);
  }

  return {
    stage: opts.stage,
    failedProvider: opts.failedProvider,
    failedModel: opts.failedModel,
    failure,
    options: buildFallbackOptions(opts.failedProvider, opts.settings),
    allowRetry: failure.retryable,
  };
}

export function pickAutoFallbackProvider(
  failedProvider: ProviderId,
  settings: ProviderSettings,
): ProviderId | null {
  const options = buildSuggestedFallbacks(failedProvider, settings);
  return options[0] ?? null;
}

export function healthToReliabilityStatus(
  health: HealthResult | null,
  settings: ProviderSettings,
  provider: ProviderId,
): ProviderReliabilityStatus {
  if (provider === "gemini" && !settings.hasGeminiKey) return "missing_key";
  if (provider === "anthropic" && !settings.hasAnthropicKey) return "missing_key";
  if (provider === "groq" && !settings.hasGroqKey) return "missing_key";
  if (provider === "openrouter" && !settings.hasOpenRouterKey) return "missing_key";
  if (provider === "ollama") {
    if (!settings.ollamaBaseUrl.trim()) return "offline";
    if (!settings.ollamaModel.trim()) return "model_missing";
  }
  if (!health) return "unknown_error";
  if (health.ok) return "online";

  const fromError = classifyReliabilityFromError(health.error);
  if (fromError) return fromError;

  switch (health.connectionStatus) {
    case "connected":
      return health.ok ? "online" : "unknown_error";
    case "invalid_key":
      return "invalid_key";
    case "rate_limited":
      return "rate_limited";
    case "offline":
      return "offline";
    default:
      return "unknown_error";
  }
}

export function redactProviderSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-••••")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-••••")
    .replace(/key=[^&\s]+/gi, "key=••••")
    .replace(/x-api-key:\s*\S+/gi, "x-api-key: ••••");
}

/** Prefer a recent successful health result over a stale timeout/offline blip. */
export function mergeProviderHealthResults(
  previous: HealthResult | null,
  incoming: HealthResult | null,
): HealthResult | null {
  if (!incoming) return previous;
  if (!previous) return incoming;
  if (previous.ok && !incoming.ok) {
    const stale = classifyReliabilityFromError(incoming.error);
    if (stale === "timeout" || stale === "offline") {
      return previous;
    }
  }
  return incoming;
}
