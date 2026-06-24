import {
  classifyHttpStatus,
  isOfflineError,
} from "./reliability.cjs";
import { fetchJson } from "./types.cjs";

export type OpenAiConnectionStatus =
  | "connected"
  | "invalid_key"
  | "rate_limited"
  | "offline"
  | "unknown";

export interface OpenAiChatConfig {
  readonly apiBase: string;
  readonly apiKey: string;
  readonly extraHeaders?: Record<string, string>;
}

export function openAiHeaders(
  apiKey: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

export function parseOpenAiModelIds(json: unknown): string[] {
  const data = json as { data?: Array<{ id?: string }> };
  const ids = (data?.data ?? [])
    .map((m) => m.id?.trim() ?? "")
    .filter((id) => id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function extractOpenAiApiError(json: unknown): string | null {
  const data = json as {
    error?: { message?: string; code?: string; type?: string };
  };
  const msg = data?.error?.message?.trim();
  return msg && msg.length > 0 ? msg : null;
}

export function extractOpenAiChatText(json: unknown): string {
  const data = json as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

export async function listOpenAiModels(
  config: OpenAiChatConfig,
  timeoutMs: number,
): Promise<{ models: string[]; httpStatus: number | null; error: string | null }> {
  try {
    const res = await fetchJson(
      `${config.apiBase}/models`,
      { method: "GET", headers: openAiHeaders(config.apiKey, config.extraHeaders) },
      timeoutMs,
    );
    const apiError = extractOpenAiApiError(res.json);
    if (!res.ok) {
      return {
        models: [],
        httpStatus: res.status,
        error: apiError ?? `List models failed (HTTP ${res.status}).`,
      };
    }
    return {
      models: parseOpenAiModelIds(res.json),
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

export async function createOpenAiChatCompletion(
  config: OpenAiChatConfig,
  model: string,
  prompt: string,
  maxTokens: number,
  timeoutMs: number,
  temperature?: number,
): Promise<{
  ok: boolean;
  text: string;
  raw: unknown;
  httpStatus: number;
  error: string | null;
}> {
  const body: {
    model: string;
    max_tokens: number;
    messages: Array<{ role: "user"; content: string }>;
    temperature?: number;
  } = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (temperature !== undefined) body.temperature = temperature;

  const res = await fetchJson(
    `${config.apiBase}/chat/completions`,
    {
      method: "POST",
      headers: openAiHeaders(config.apiKey, config.extraHeaders),
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  const apiError = extractOpenAiApiError(res.json);
  const text = res.ok ? extractOpenAiChatText(res.json) : "";
  const ok = res.ok && !apiError && text.length >= 0;
  return {
    ok: res.ok && !apiError,
    text,
    raw: res.json,
    httpStatus: res.status,
    error: ok ? null : (apiError ?? `Request failed (HTTP ${res.status}).`),
  };
}

export function classifyOpenAiConnectionStatus(
  httpStatus: number | null,
  err: unknown,
  errorMessage?: string,
): OpenAiConnectionStatus {
  return classifyHttpStatus(httpStatus, err, errorMessage);
}

export function isOpenAiOfflineError(err: unknown): boolean {
  return isOfflineError(err);
}
