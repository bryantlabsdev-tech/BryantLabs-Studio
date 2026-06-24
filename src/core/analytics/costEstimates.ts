import type { ProviderId } from "@/core/providers/types";

/** Rough USD per 1M tokens — estimates only, no billing APIs. */
const INPUT_USD_PER_MILLION: Record<ProviderId, number> = {
  gemini: 0.075,
  anthropic: 3.0,
  groq: 0.05,
  openrouter: 0.5,
  ollama: 0,
};

const OUTPUT_USD_PER_MILLION: Record<ProviderId, number> = {
  gemini: 0.3,
  anthropic: 15.0,
  groq: 0.08,
  openrouter: 2.0,
  ollama: 0,
};

export function splitEstimatedTokens(totalTokens: number): {
  promptTokens: number;
  outputTokens: number;
} {
  const safe = Math.max(0, Math.round(totalTokens));
  const promptTokens = Math.round(safe * 0.7);
  return { promptTokens, outputTokens: safe - promptTokens };
}

export function estimateRunCostUsd(
  provider: ProviderId | null,
  promptTokens: number,
  outputTokens: number,
): number {
  if (!provider) return 0;
  const inputRate = INPUT_USD_PER_MILLION[provider] ?? 1;
  const outputRate = OUTPUT_USD_PER_MILLION[provider] ?? 3;
  const cost =
    (promptTokens / 1_000_000) * inputRate +
    (outputTokens / 1_000_000) * outputRate;
  return Math.round(cost * 10000) / 10000;
}

export function formatCostUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return "< $0.01";
  return `$${amount.toFixed(2)}`;
}

export function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
