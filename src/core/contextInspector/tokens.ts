import type { ProviderId } from "@/core/providers/types";

/** Rough token estimate (local heuristic, not provider tokenizer). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

export function estimateJsonTokens(value: unknown): number {
  try {
    return estimateTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}

const DEFAULT_CONTEXT_WINDOW = 128_000;

const MODEL_WINDOWS: Record<string, number> = {
  "claude-sonnet-4-20250514": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-5-haiku-20241022": 200_000,
  "gemini-2.0-flash": 1_000_000,
  "gemini-1.5-pro": 1_000_000,
  "gemini-1.5-flash": 1_000_000,
};

const PROVIDER_DEFAULT_WINDOWS: Record<ProviderId, number> = {
  anthropic: 200_000,
  gemini: 1_000_000,
  groq: 128_000,
  openrouter: 128_000,
  ollama: 32_768,
};

export function resolveContextWindow(
  provider: ProviderId,
  model: string,
): number {
  const key = model.trim().toLowerCase();
  for (const [pattern, window] of Object.entries(MODEL_WINDOWS)) {
    if (key.includes(pattern.toLowerCase())) return window;
  }
  return PROVIDER_DEFAULT_WINDOWS[provider] ?? DEFAULT_CONTEXT_WINDOW;
}

export function buildTokenMetrics(opts: {
  originalPrompt: string;
  requestPreview: string;
  finalPayload: unknown;
  provider: ProviderId;
  model: string;
  estimatedOutputTokens?: number;
}): import("@/core/contextInspector/types").ContextTokenMetrics {
  const promptTokens = estimateTokens(opts.originalPrompt);
  const contextTokens = Math.max(
    estimateTokens(opts.requestPreview) - promptTokens,
    estimateJsonTokens(opts.finalPayload),
  );
  const estimatedOutputTokens = opts.estimatedOutputTokens ?? 1024;
  const estimatedTotalTokens =
    promptTokens + contextTokens + estimatedOutputTokens;
  const contextWindowTokens = resolveContextWindow(
    opts.provider,
    opts.model,
  );
  const contextWindowUsagePercent = Math.min(
    100,
    Math.round((estimatedTotalTokens / contextWindowTokens) * 1000) / 10,
  );
  return {
    promptTokens,
    contextTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    contextWindowTokens,
    contextWindowUsagePercent,
  };
}
