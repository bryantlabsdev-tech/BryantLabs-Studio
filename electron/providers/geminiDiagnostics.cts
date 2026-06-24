import type { GeminiGenerateMethod } from "./geminiEmptyResponse.cjs";

const RAW_RESPONSE_MAX = 12_000;

export interface GeminiTransportDiagnostics {
  readonly providerHttpStatus: number;
  readonly providerRequestId: string | null;
  readonly providerLatency: number;
  readonly providerModel: string;
  readonly providerEndpoint: string;
  readonly generateMethod: GeminiGenerateMethod;
  readonly requestPayloadBytes: number;
  readonly maxOutputTokens: number;
  readonly usageMetadata: string | null;
  readonly responseHeaders: string | null;
  readonly rawGeminiResponse: string | null;
}

export function redactGeminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=***`;
}

export function pickGeminiRequestId(headers: Readonly<Record<string, string>>): string | null {
  return (
    headers["x-goog-request-id"] ??
    headers["x-request-id"] ??
    headers["x-goog-api-client"] ??
    null
  );
}

function compactJson(value: unknown, max: number): string | null {
  try {
    const text = JSON.stringify(value);
    if (!text || text === "null") return null;
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  } catch {
    return null;
  }
}

export function summarizeResponseHeaders(
  headers: Readonly<Record<string, string>>,
  max = 1200,
): string | null {
  const interesting = [
    "x-goog-request-id",
    "x-request-id",
    "content-type",
    "date",
    "server",
    "alt-svc",
    "vary",
    "x-goog-api-client",
  ];
  const picked: Record<string, string> = {};
  for (const key of interesting) {
    const value = headers[key];
    if (value) picked[key] = value;
  }
  return compactJson(picked, max);
}

export function buildGeminiTransportDiagnostics(input: {
  readonly model: string;
  readonly httpStatus: number;
  readonly latencyMs: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
  readonly requestPayloadBytes: number;
  readonly maxOutputTokens: number;
  readonly generateMethod?: GeminiGenerateMethod;
}): GeminiTransportDiagnostics {
  const data = input.json as { usageMetadata?: unknown };
  return {
    providerHttpStatus: input.httpStatus,
    providerRequestId: pickGeminiRequestId(input.headers),
    providerLatency: input.latencyMs,
    providerModel: input.model,
    providerEndpoint: redactGeminiEndpoint(input.model),
    generateMethod: input.generateMethod ?? "generateContent",
    requestPayloadBytes: input.requestPayloadBytes,
    maxOutputTokens: input.maxOutputTokens,
    usageMetadata: compactJson(data?.usageMetadata ?? null, 600),
    responseHeaders: summarizeResponseHeaders(input.headers),
    rawGeminiResponse: compactJson(input.json, RAW_RESPONSE_MAX),
  };
}
