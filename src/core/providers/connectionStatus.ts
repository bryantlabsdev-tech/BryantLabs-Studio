import type { ProviderConnectionStatus } from "@/core/providers/types";

export type { ProviderConnectionStatus };

export const PROVIDER_CONNECTION_LABELS: Record<
  ProviderConnectionStatus,
  string
> = {
  connected: "Connected",
  invalid_key: "Invalid Key",
  rate_limited: "Rate Limited",
  offline: "Offline",
  unknown: "Unknown",
};

export function classifyHttpConnectionStatus(
  httpStatus: number | null,
  err: unknown,
): ProviderConnectionStatus {
  if (httpStatus === 401 || httpStatus === 403) return "invalid_key";
  if (httpStatus === 429) return "rate_limited";
  if (err && isOfflineError(err)) return "offline";
  if (httpStatus !== null && httpStatus >= 400) return "unknown";
  return "unknown";
}

function isOfflineError(err: unknown): boolean {
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

/** Parse Anthropic `GET /v1/models` payload (no hardcoded model ids). */
export function parseAnthropicModelIds(json: unknown): string[] {
  const data = json as {
    data?: Array<{ id?: string; type?: string }>;
  };
  const ids = (data?.data ?? [])
    .filter((m) => (m.type ?? "model") === "model")
    .map((m) => m.id?.trim() ?? "")
    .filter((id) => id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function extractAnthropicApiError(json: unknown): string | null {
  const data = json as { error?: { message?: string; type?: string } };
  const msg = data?.error?.message?.trim();
  return msg && msg.length > 0 ? msg : null;
}
