import type { ProviderId } from "@/core/providers/types";

export interface ModelPricing {
  readonly label: string;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
}

/** Easy-to-update per-model pricing (USD per 1M tokens). Estimates only. */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  "gemini-2.5-flash": {
    label: "Gemini Flash",
    inputUsdPerMillion: 0.075,
    outputUsdPerMillion: 0.3,
  },
  "gemini-2.5-pro": {
    label: "Gemini Pro",
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 5.0,
  },
  "claude-sonnet-4-6": {
    label: "Anthropic Sonnet (placeholder)",
    inputUsdPerMillion: 3.0,
    outputUsdPerMillion: 15.0,
  },
  "anthropic/claude-sonnet-4": {
    label: "OpenRouter Claude (placeholder)",
    inputUsdPerMillion: 3.0,
    outputUsdPerMillion: 15.0,
  },
};

const PROVIDER_FALLBACK_PRICING: Readonly<Record<ProviderId, ModelPricing>> = {
  gemini: MODEL_PRICING["gemini-2.5-flash"]!,
  anthropic: MODEL_PRICING["claude-sonnet-4-6"]!,
  openrouter: MODEL_PRICING["anthropic/claude-sonnet-4"]!,
  groq: {
    label: "Groq (placeholder)",
    inputUsdPerMillion: 0.05,
    outputUsdPerMillion: 0.08,
  },
  ollama: {
    label: "Ollama (local)",
    inputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
  },
};

export function resolveModelPricing(
  provider: ProviderId | null | undefined,
  model: string | null | undefined,
): ModelPricing | null {
  if (!provider) return null;
  const normalized = model?.trim().toLowerCase() ?? "";
  if (normalized) {
    const exact = MODEL_PRICING[normalized];
    if (exact) return exact;
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      if (normalized.includes(key) || key.includes(normalized)) return pricing;
    }
  }
  return PROVIDER_FALLBACK_PRICING[provider] ?? null;
}

export function estimateTokenCostUsd(input: {
  readonly provider: ProviderId | null;
  readonly model: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}): number | null {
  const pricing = resolveModelPricing(input.provider, input.model);
  if (!pricing) return null;
  if (input.inputTokens <= 0 && input.outputTokens <= 0) return null;
  const cost =
    (input.inputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (input.outputTokens / 1_000_000) * pricing.outputUsdPerMillion;
  return Math.round(cost * 10000) / 10000;
}
