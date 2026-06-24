import type { RawProviderSettings } from "./settings.cjs";
import {
  DEFAULT_GENERATE_TIMEOUT_MS,
  formatProviderTimeoutError,
  isFetchTimeoutError,
  resolveGenerateTimeout,
  type ProviderGenerateOptions,
} from "./timeouts.cjs";
import {
  fetchJson,
  type HealthResult,
  type ProviderResponse,
} from "./types.cjs";
import {
  classifyReliabilityFromError,
  isOfflineError,
  reliabilityToConnectionStatus,
} from "./reliability.cjs";
import { GEMINI_CURATED_MODEL_IDS } from "./providerModels.cjs";
import { extractProviderResponseMeta } from "./responseMeta.cjs";
import {
  detectGeminiEmptyResponse,
  GEMINI_EMPTY_RESPONSE_CODE,
} from "./geminiEmptyResponse.cjs";
import { buildGeminiTransportDiagnostics } from "./geminiDiagnostics.cjs";

/**
 * Gemini provider (Google Generative Language API). Uses non-streaming
 * `models/{model}:generateContent` (not streamGenerateContent).
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const GENERATE_METHOD = "generateContent" as const;
/** Health check and short test calls only — not used for plan/patch/greenfield. */
const HEALTH_TIMEOUT_MS = 20_000;

function endpoint(model: string, key: string): string {
  return `${BASE}/models/${encodeURIComponent(model)}:${GENERATE_METHOD}?key=${encodeURIComponent(key)}`;
}

function extractText(json: unknown): string {
  const data = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

function responseBodySnippet(json: unknown, max = 600): string {
  try {
    const text = JSON.stringify(json);
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  } catch {
    return "";
  }
}

function extractError(json: unknown, httpStatus?: number): string | null {
  const data = json as {
    error?: { message?: string; status?: string; code?: number };
    candidates?: Array<{ finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };
  if (data?.promptFeedback?.blockReason) {
    return `Safety block: ${data.promptFeedback.blockReason}`;
  }
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason === "SAFETY" || finishReason === "RECITATION") {
    return `Safety block: ${finishReason}`;
  }
  if (data?.error?.message) return data.error.message;
  if (httpStatus === 404) return "Model not found or not available for this API key.";
  return null;
}

function buildGenerateContentBody(
  prompt: string,
  maxOutputTokens: number,
  temperature?: number,
): { body: Record<string, unknown>; payloadBytes: number } {
  const generationConfig: { maxOutputTokens: number; temperature?: number } = {
    maxOutputTokens,
  };
  if (temperature !== undefined) generationConfig.temperature = temperature;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };
  const serialized = JSON.stringify(body);
  return { body, payloadBytes: Buffer.byteLength(serialized, "utf8") };
}

async function call(
  model: string,
  key: string,
  prompt: string,
  maxOutputTokens: number,
  timeoutMs: number,
  temperature?: number,
) {
  const { body, payloadBytes } = buildGenerateContentBody(
    prompt,
    maxOutputTokens,
    temperature,
  );
  const res = await fetchJson(
    endpoint(model, key),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  return { ...res, payloadBytes };
}

function parseGeminiModelIds(json: unknown): string[] {
  const data = json as {
    models?: Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  return (data.models ?? [])
    .filter((entry) =>
      (entry.supportedGenerationMethods ?? []).includes(GENERATE_METHOD),
    )
    .map((entry) => (entry.name ?? "").replace(/^models\//, ""))
    .filter((id) => id.length > 0);
}

async function listModels(
  key: string,
  timeoutMs: number,
): Promise<{ models: string[]; httpStatus: number | null; error: string | null }> {
  try {
    const res = await fetchJson(
      `${BASE}/models?key=${encodeURIComponent(key)}`,
      { method: "GET" },
      timeoutMs,
    );
    const apiError = extractError(res.json, res.status);
    if (!res.ok) {
      return {
        models: [],
        httpStatus: res.status,
        error: apiError ?? `List models failed (HTTP ${res.status}).`,
      };
    }
    const discovered = parseGeminiModelIds(res.json);
    const curatedAvailable = GEMINI_CURATED_MODEL_IDS.filter((id) =>
      discovered.includes(id),
    );
    return {
      models: curatedAvailable.length > 0 ? curatedAvailable : discovered,
      httpStatus: res.status,
      error: apiError,
    };
  } catch (err) {
    return {
      models: [],
      httpStatus: null,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }
}

function mapGenerateError(
  err: unknown,
  operation: ProviderGenerateOptions["operation"],
  timeoutMs: number,
): string {
  if (isFetchTimeoutError(err)) {
    return formatProviderTimeoutError(operation, timeoutMs);
  }
  return err instanceof Error ? err.message : "Network error.";
}

export async function health(raw: RawProviderSettings): Promise<HealthResult> {
  const model = raw.geminiModel;
  const hasKey = raw.geminiApiKey.trim().length > 0;
  const result: HealthResult = {
    ok: false,
    provider: "gemini",
    model,
    checks: [{ label: "API key present", ok: hasKey }],
  };
  if (!hasKey) {
    result.error = "No Gemini API key is stored. Add one in settings.";
    result.connectionStatus = "invalid_key";
    return result;
  }

  const listed = await listModels(raw.geminiApiKey, HEALTH_TIMEOUT_MS);
  if (listed.models.length > 0) {
    result.models = listed.models;
    result.checks.push({
      label: "Models available",
      ok: true,
      detail: `${listed.models.length} curated model(s)`,
    });
  } else if (listed.error) {
    result.checks.push({
      label: "Models available",
      ok: false,
      detail: listed.error,
    });
  }

  try {
    const res = await call(model, raw.geminiApiKey, "Hello", 8, HEALTH_TIMEOUT_MS);
    const apiError = extractError(res.json, res.status);
    const ok = res.ok && !apiError;
    const reliability = classifyReliabilityFromError(
      apiError ?? undefined,
      res.status,
    );
    result.connectionStatus = ok
      ? "connected"
      : reliabilityToConnectionStatus(reliability);
    result.checks.push({
      label: "Test request succeeds",
      ok,
      detail: ok ? `HTTP ${res.status}` : (apiError ?? `HTTP ${res.status}`),
    });
    result.ok = ok;
    if (!ok) result.error = apiError ?? `Request failed (HTTP ${res.status}).`;
  } catch (err) {
    const reliability = isOfflineError(err)
      ? classifyReliabilityFromError(err instanceof Error ? err.message : "offline")
      : "unknown_error";
    result.connectionStatus = reliabilityToConnectionStatus(reliability);
    result.checks.push({
      label: "Test request succeeds",
      ok: false,
      detail: isOfflineError(err) ? "Network error" : "Request failed",
    });
    result.error = err instanceof Error ? err.message : "Network error.";
  }
  return result;
}

export async function generate(
  raw: RawProviderSettings,
  prompt: string,
  maxOutputTokens = 256,
  options?: ProviderGenerateOptions,
): Promise<ProviderResponse> {
  const model = raw.geminiModel;
  const start = Date.now();
  const { timeoutMs, operation } = resolveGenerateTimeout(options);
  const temperature = options?.temperature;
  const hasKey = raw.geminiApiKey.trim().length > 0;
  if (!hasKey) {
    return {
      ok: false,
      provider: "gemini",
      model,
      text: "",
      raw: null,
      latencyMs: 0,
      error: "No Gemini API key is stored. Add one in settings.",
      apiKeyPresent: false,
    };
  }
  try {
    const res = await call(
      model,
      raw.geminiApiKey,
      prompt,
      maxOutputTokens,
      timeoutMs,
      temperature,
    );
    const latencyMs = Date.now() - start;
    const geminiTransport = buildGeminiTransportDiagnostics({
      model,
      httpStatus: res.status,
      latencyMs,
      headers: res.headers,
      json: res.json,
      requestPayloadBytes: res.payloadBytes,
      maxOutputTokens,
      generateMethod: GENERATE_METHOD,
    });
    const apiError = extractError(res.json, res.status);
    const text = res.ok && !apiError ? extractText(res.json) : "";
    const emptyError =
      res.ok && !apiError ? detectGeminiEmptyResponse(res.json, text) : null;
    const ok = res.ok && !apiError && !emptyError;
    const errorMessage = ok
      ? undefined
      : (emptyError ?? apiError ?? `Request failed (HTTP ${res.status}).`);
    const meta = extractProviderResponseMeta("gemini", res.json, text, geminiTransport);
    return {
      ok,
      provider: "gemini",
      model,
      text: ok ? text : "",
      raw: res.json,
      latencyMs,
      timeoutMs,
      httpStatus: res.status,
      responseBody: responseBodySnippet(res.json),
      apiKeyPresent: true,
      meta,
      ...(emptyError ? { errorCode: GEMINI_EMPTY_RESPONSE_CODE } : {}),
      error: errorMessage,
    };
  } catch (err) {
    const message = mapGenerateError(err, operation, timeoutMs);
    return {
      ok: false,
      provider: "gemini",
      model,
      text: "",
      raw: null,
      latencyMs: Date.now() - start,
      timeoutMs,
      apiKeyPresent: true,
      error: message,
    };
  }
}

export async function test(
  raw: RawProviderSettings,
  prompt: string,
): Promise<ProviderResponse> {
  return generate(raw, prompt, 256, {
    timeoutMs: DEFAULT_GENERATE_TIMEOUT_MS,
    operation: "test",
  });
}
