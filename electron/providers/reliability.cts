import type { ProviderConnectionStatus } from "./types.cjs";

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
  | "unknown_error";

const RATE_LIMIT_RE =
  /rate.?limit|429|too many requests|quota exceeded|resource exhausted/i;
const CREDITS_RE =
  /insufficient.?credit|billing|payment required|402|out of credits|balance/i;
const OFFLINE_RE =
  /offline|unreachable|econnrefused|enotfound|network|fetch failed|connection refused|cannot reach/i;
const MISSING_KEY_RE =
  /no .* api key|missing api key|api key.*not stored|add one in settings/i;
const INVALID_KEY_RE =
  /invalid api key|invalid.?key|401|403|unauthorized|authentication/i;
const MODEL_MISSING_RE =
  /not installed|model_missing|not found|ollama pull|selected model/i;
const TIMEOUT_RE = /timed out|timeout|abort/i;
const SAFETY_RE =
  /safety|blocked|blockreason|content filtered|prompt was blocked|harmful/i;
const MODEL_UNAVAILABLE_RE =
  /model.*not found|not available|invalid model|404|models\/.*not found/i;

export function classifyReliabilityFromError(
  error: string | undefined | null,
  httpStatus?: number | null,
): ProviderReliabilityStatus {
  const msg = (error ?? "").trim();
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 402) return "insufficient_credits";
  if (httpStatus === 404) return "model_missing";
  if (httpStatus === 401 || httpStatus === 403) {
    return MISSING_KEY_RE.test(msg) ? "missing_key" : "invalid_key";
  }
  if (SAFETY_RE.test(msg)) return "safety_blocked";
  if (RATE_LIMIT_RE.test(msg)) return "rate_limited";
  if (CREDITS_RE.test(msg)) return "insufficient_credits";
  if (MODEL_UNAVAILABLE_RE.test(msg) || MODEL_MISSING_RE.test(msg)) {
    return "model_missing";
  }
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (MISSING_KEY_RE.test(msg)) return "missing_key";
  if (INVALID_KEY_RE.test(msg)) return "invalid_key";
  if (OFFLINE_RE.test(msg)) return "offline";
  if (!msg) return "unknown_error";
  return "unknown_error";
}

export function reliabilityToConnectionStatus(
  status: ProviderReliabilityStatus,
): ProviderConnectionStatus {
  switch (status) {
    case "online":
      return "connected";
    case "invalid_key":
    case "missing_key":
      return "invalid_key";
    case "rate_limited":
      return "rate_limited";
    case "offline":
    case "model_missing":
      return "offline";
    default:
      return "unknown";
  }
}

export function isOfflineError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === "AbortError" ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("timeout")
  );
}

export function classifyHttpStatus(
  httpStatus: number | null,
  err: unknown,
  errorMessage?: string,
): ProviderConnectionStatus {
  const reliability = classifyReliabilityFromError(errorMessage, httpStatus);
  if (reliability !== "unknown_error") {
    return reliabilityToConnectionStatus(reliability);
  }
  if (httpStatus === 401 || httpStatus === 403) return "invalid_key";
  if (httpStatus === 429) return "rate_limited";
  if (err && isOfflineError(err)) return "offline";
  return "unknown";
}
