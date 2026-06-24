import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { splitEstimatedTokens } from "@/core/analytics/costEstimates";
import { estimateTokenCostUsd } from "@/core/analytics/providerPricing";
import type { ProviderId } from "@/core/providers/types";

export interface RunCostEstimate {
  readonly estimatedInputTokens: number | null;
  readonly estimatedOutputTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly isEstimated: boolean;
}

export interface CostScopeSummary {
  readonly sessionCostUsd: number | null;
  readonly projectCostUsd: number | null;
  readonly dailyCostUsd: number | null;
}

function asProviderId(value: string | null | undefined): ProviderId | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    normalized === "gemini" ||
    normalized === "anthropic" ||
    normalized === "groq" ||
    normalized === "openrouter" ||
    normalized === "ollama"
  ) {
    return normalized;
  }
  return null;
}

function readTokenSplit(artifact: AgentRunArtifact): {
  inputTokens: number | null;
  outputTokens: number | null;
  isEstimated: boolean;
} {
  const metrics = artifact.generationMetrics;
  if (!metrics) {
    return { inputTokens: null, outputTokens: null, isEstimated: true };
  }
  return {
    inputTokens: metrics.estimatedPromptTokens,
    outputTokens: metrics.estimatedResponseTokens,
    isEstimated: true,
  };
}

export function estimateRunCostFromArtifact(
  artifact: AgentRunArtifact,
): RunCostEstimate | null {
  const split = readTokenSplit(artifact);
  let inputTokens = split.inputTokens;
  let outputTokens = split.outputTokens;

  if (inputTokens == null && outputTokens == null) {
    const inspectorTokens =
      artifact.generationMetrics == null
        ? null
        : artifact.generationMetrics.estimatedPromptTokens +
          artifact.generationMetrics.estimatedResponseTokens;
    if (inspectorTokens != null && inspectorTokens > 0) {
      const derived = splitEstimatedTokens(inspectorTokens);
      inputTokens = derived.promptTokens;
      outputTokens = derived.outputTokens;
    } else {
      return null;
    }
  }

  const provider = asProviderId(artifact.provider);
  const cost = estimateTokenCostUsd({
    provider,
    model: artifact.model,
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
  });

  if (cost == null && (inputTokens ?? 0) <= 0 && (outputTokens ?? 0) <= 0) {
    return null;
  }

  return {
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: cost,
    isEstimated: split.isEstimated,
  };
}

export function estimateRunCostFromInspectorMetrics(input: {
  readonly tokensEstimated: number | null;
  readonly promptTokens: number | null;
  readonly responseTokens: number | null;
  readonly provider: string | null;
  readonly model: string | null;
}): RunCostEstimate | null {
  let inputTokens = input.promptTokens;
  let outputTokens = input.responseTokens;
  const isEstimated = true;

  if (inputTokens == null && outputTokens == null) {
    if (input.tokensEstimated == null || input.tokensEstimated <= 0) return null;
    const split = splitEstimatedTokens(input.tokensEstimated);
    inputTokens = split.promptTokens;
    outputTokens = split.outputTokens;
  }

  const cost = estimateTokenCostUsd({
    provider: asProviderId(input.provider),
    model: input.model,
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
  });

  if (cost == null) return null;

  return {
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: cost,
    isEstimated,
  };
}

export function sumRunCosts(
  artifacts: readonly AgentRunArtifact[],
): number | null {
  let total = 0;
  let any = false;
  for (const artifact of artifacts) {
    const estimate = estimateRunCostFromArtifact(artifact);
    if (estimate?.estimatedCostUsd != null) {
      total += estimate.estimatedCostUsd;
      any = true;
    }
  }
  return any ? Math.round(total * 10000) / 10000 : null;
}

export function computeCostScopeSummary(input: {
  readonly projectArtifacts: readonly AgentRunArtifact[];
  readonly sessionArtifacts: readonly AgentRunArtifact[];
  readonly now?: number;
}): CostScopeSummary {
  const now = input.now ?? Date.now();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const dailyArtifacts = input.projectArtifacts.filter(
    (artifact) => artifact.endedAt >= dayStart.getTime(),
  );

  return {
    sessionCostUsd: sumRunCosts(input.sessionArtifacts),
    projectCostUsd: sumRunCosts(input.projectArtifacts),
    dailyCostUsd: sumRunCosts(dailyArtifacts),
  };
}

export function formatCostDisplay(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return "< $0.01";
  return `$${amount.toFixed(2)}`;
}
