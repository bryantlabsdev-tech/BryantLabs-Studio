import type { ProviderId } from "./settings.cjs";
import { requestHttpJson } from "./httpJson.cjs";

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

function parseJsonResponse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { rawText: text };
  }
}

/** HTTP JSON client with abort-based timeout. POST bodies use Node HTTPS (fetch truncates in Electron). */
export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  opts?: {
    attempt?: number;
    requestId?: string;
    structure?: import("./transportDiagnostics.cjs").RequestStructureDiagnostics | null;
  },
): Promise<{
  status: number;
  ok: boolean;
  json: unknown;
  headers: Record<string, string>;
  transport?: import("./httpJson.cjs").RequestBodyTransportMetrics;
}> {
  const method = (init.method ?? "GET").toUpperCase();
  const hasBody = init.body != null && method !== "GET" && method !== "HEAD";

  if (hasBody) {
    const res = await requestHttpJson(url, init, timeoutMs, opts);
    const text = res.text;
    let responseParsed = true;
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      responseParsed = false;
      json = { rawText: text };
    }
    const transport = res.transport
      ? {
          ...res.transport,
          ...(responseParsed
            ? {}
            : {
                truncationSource: "inbound_response_json_truncated" as const,
                parserStage: "fetchJson_parseJsonResponse",
              }),
        }
      : undefined;
    return {
      status: res.status,
      ok: res.ok,
      json,
      headers: res.headers,
      ...(transport ? { transport } : {}),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const text = await res.text();
    return {
      status: res.status,
      ok: res.ok,
      json: parseJsonResponse(text),
      headers,
    };
  } finally {
    clearTimeout(timer);
  }
}
