import type { ProviderId } from "./settings.cjs";

export type { ProviderId };

export type ProviderConnectionStatus =
  | "connected"
  | "invalid_key"
  | "rate_limited"
  | "offline"
  | "unknown";

export interface HealthCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface HealthResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  checks: HealthCheck[];
  models?: string[];
  connectionStatus?: ProviderConnectionStatus;
  error?: string;
}

export interface ProviderResponse {
  ok: boolean;
  provider: ProviderId;
  model: string;
  text: string;
  raw: unknown;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
  responseBody?: string;
  apiKeyPresent?: boolean;
  /** HTTP timeout configured for this request (diagnostics). */
  timeoutMs?: number;
  /** Provider-specific response metadata for planner diagnostics. */
  meta?: import("./responseMeta.cjs").ProviderResponseMeta;
  /** Machine-readable provider failure (e.g. gemini_empty_response). */
  errorCode?: string;
}

/** fetch with an abort-based timeout. Returns the parsed JSON or throws. */
export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; ok: boolean; json: unknown; headers: Record<string, string> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    let json: unknown = null;
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { rawText: text };
    }
    return { status: res.status, ok: res.ok, json, headers };
  } finally {
    clearTimeout(timer);
  }
}
