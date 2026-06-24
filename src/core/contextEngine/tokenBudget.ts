import type { AgentStage } from "@/core/providers/orchestration";
import { STAGE_TOKEN_BUDGET, estimateTokens } from "@/core/providers/requestSize";
import type { ProviderId } from "@/core/providers/types";

/** Reserve tokens for model completion output. */
export const RESPONSE_TOKEN_RESERVE = 2000;

/** Provider input limits (conservative headroom under API caps). */
export const PROVIDER_INPUT_TOKEN_LIMIT: Partial<Record<ProviderId, number>> = {
  groq: 8000,
  ollama: 32_000,
  gemini: 100_000,
  anthropic: 100_000,
  openrouter: 100_000,
};

export function getProviderInputTokenLimit(
  provider: ProviderId,
  stage: AgentStage,
): number {
  const providerCap = PROVIDER_INPUT_TOKEN_LIMIT[provider] ?? 80_000;
  const stageCap = STAGE_TOKEN_BUDGET[stage] ?? 80_000;
  return Math.max(
    1000,
    Math.min(providerCap, stageCap) - RESPONSE_TOKEN_RESERVE,
  );
}

export function isWithinTokenLimit(
  estimatedTokens: number,
  provider: ProviderId,
  stage: AgentStage,
): boolean {
  return estimatedTokens <= getProviderInputTokenLimit(provider, stage);
}

export { estimateTokens };
