import { readFileSync } from "node:fs";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

const ENV_KEYS = [
  "BRYANTLABS_GEMINI_API_KEY",
  "BRYANTLABS_E2E_GEMINI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readGeminiKeyFromProviderSettings(): string | null {
  const home = process.env.HOME;
  if (!home) return null;
  const settingsPath = `${home}/Library/Application Support/bryantlabs-studio/provider-settings.json`;
  try {
    const text = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(text) as { geminiApiKey?: unknown };
    if (typeof parsed.geminiApiKey !== "string") return null;
    const trimmed = parsed.geminiApiKey.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function readGeminiModelFromProviderSettings(): string | null {
  const home = process.env.HOME;
  if (!home) return null;
  const settingsPath = `${home}/Library/Application Support/bryantlabs-studio/provider-settings.json`;
  try {
    const text = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(text) as { geminiModel?: unknown };
    if (typeof parsed.geminiModel !== "string") return null;
    const trimmed = parsed.geminiModel.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function resolveGeminiApiKeyForStress(): string | null {
  for (const key of ENV_KEYS) {
    const value = readEnv(key);
    if (value) return value;
  }
  return readGeminiKeyFromProviderSettings();
}

export function resolveGeminiModelForStress(): string {
  return (
    readEnv("BRYANTLABS_GEMINI_MODEL") ??
    readEnv("GEMINI_MODEL") ??
    readGeminiModelFromProviderSettings() ??
    DEFAULT_MODEL
  );
}

function sanitizeProviderPrompt(prompt: string): string {
  return prompt.replace(/\0/g, "").replace(/[\uD800-\uDFFF]/g, "");
}

function extractGeminiText(json: unknown): string {
  const data = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

function extractGeminiError(json: unknown, httpStatus?: number): string | null {
  const data = json as {
    error?: { message?: string };
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

export interface GeminiGenerateResult {
  readonly ok: boolean;
  readonly text: string;
  readonly raw: unknown;
  readonly latencyMs: number;
  readonly error?: string;
}

export async function geminiGenerateContent(input: {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly maxOutputTokens: number;
  readonly timeoutMs?: number;
}): Promise<GeminiGenerateResult> {
  const started = Date.now();
  const prompt = sanitizeProviderPrompt(input.prompt);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: input.maxOutputTokens },
  };
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 120_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = (await res.json()) as unknown;
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        text: "",
        raw,
        latencyMs,
        error: extractGeminiError(raw, res.status) ?? `HTTP ${res.status}`,
      };
    }
    const text = extractGeminiText(raw);
    if (!text) {
      return {
        ok: false,
        text: "",
        raw,
        latencyMs,
        error: "Empty Gemini response.",
      };
    }
    return { ok: true, text, raw, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Gemini request timed out after ${timeoutMs}ms.`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, text: "", raw: null, latencyMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}
