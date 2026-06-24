import type { RawProviderSettings } from "./settings.cjs";

export const MIN_PLANNER_MAX_OUTPUT_TOKENS = 1024;
export const DEFAULT_PLANNER_MAX_OUTPUT_TOKENS = 8192;
export const MAX_PLANNER_MAX_OUTPUT_TOKENS = 16384;
export const LEGACY_PLANNER_MAX_OUTPUT_TOKENS = 1024;

export const PLANNER_TOKEN_BUDGET_INCREASE_HINT =
  "Gemini may have exhausted output tokens during reasoning. Consider increasing planner max output tokens.";

export interface GeminiUsageMetadata {
  readonly promptTokenCount?: number;
  readonly candidatesTokenCount?: number;
  readonly totalTokenCount?: number;
  readonly thoughtsTokenCount?: number;
}

export type PlannerTokenBudgetRisk = "high" | "moderate" | "low";

export interface PlannerTokenBudgetAnalysis {
  readonly maxOutputTokens: number;
  readonly recommendedMaxOutputTokens: number;
  readonly thoughtsTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly totalTokenCount: number | null;
  readonly tokenStarvationLikely: boolean;
  readonly tokenBudgetRisk: PlannerTokenBudgetRisk;
  readonly tokenBudgetHint: string | null;
}

export function coercePlannerMaxOutputTokens(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PLANNER_MAX_OUTPUT_TOKENS;
  }
  const n = Math.floor(value);
  if (n < MIN_PLANNER_MAX_OUTPUT_TOKENS) return MIN_PLANNER_MAX_OUTPUT_TOKENS;
  if (n > MAX_PLANNER_MAX_OUTPUT_TOKENS) return MAX_PLANNER_MAX_OUTPUT_TOKENS;
  return n;
}

export function resolvePlannerMaxOutputTokens(
  settings: Pick<RawProviderSettings, "plannerMaxOutputTokens">,
): number {
  return coercePlannerMaxOutputTokens(settings.plannerMaxOutputTokens);
}

export function resolvePlannerRetryMaxOutputTokens(plannerMax: number): number {
  const doubled = Math.max(plannerMax, plannerMax * 2);
  return Math.min(doubled, MAX_PLANNER_MAX_OUTPUT_TOKENS);
}

export function parseGeminiUsageMetadata(json: unknown): GeminiUsageMetadata | null {
  const usage = (json as { usageMetadata?: GeminiUsageMetadata } | null)?.usageMetadata;
  if (!usage || typeof usage !== "object") return null;
  return usage;
}

export function classifyPlannerTokenBudgetRisk(
  maxOutputTokens: number,
  thoughtsTokenCount: number | null,
): PlannerTokenBudgetRisk {
  if (thoughtsTokenCount == null || maxOutputTokens <= 0) return "low";
  const ratio = thoughtsTokenCount / maxOutputTokens;
  if (ratio >= 0.9) return "high";
  if (ratio >= 0.5) return "moderate";
  return "low";
}

/** Compare configured budget against observed thinking-token usage. */
export function analyzePlannerTokenBudget(input: {
  readonly maxOutputTokens: number;
  readonly usage: GeminiUsageMetadata | null;
  readonly responseEmpty: boolean;
  readonly finishReason?: string | null;
  readonly model?: string | null;
}): PlannerTokenBudgetAnalysis {
  const thoughts = input.usage?.thoughtsTokenCount ?? null;
  const candidates = input.usage?.candidatesTokenCount ?? null;
  const total = input.usage?.totalTokenCount ?? null;
  const risk = classifyPlannerTokenBudgetRisk(input.maxOutputTokens, thoughts);
  const thinkingModel = (input.model ?? "").includes("2.5-pro");
  const thoughtsNearBudget =
    thoughts != null && thoughts >= Math.floor(input.maxOutputTokens * 0.85);
  const thoughtsConsumedBudget =
    thoughts != null && thoughts >= input.maxOutputTokens;
  const maxTokensFinish = input.finishReason === "MAX_TOKENS";

  const tokenStarvationLikely =
    input.responseEmpty &&
    (thoughtsNearBudget ||
      thoughtsConsumedBudget ||
      maxTokensFinish ||
      (thinkingModel &&
        input.maxOutputTokens <= LEGACY_PLANNER_MAX_OUTPUT_TOKENS &&
        (thoughts ?? 0) > 0));

  let tokenBudgetHint: string | null = null;
  if (tokenStarvationLikely) {
    tokenBudgetHint = `${PLANNER_TOKEN_BUDGET_INCREASE_HINT} (configured maxOutputTokens=${input.maxOutputTokens}, recommended>=${DEFAULT_PLANNER_MAX_OUTPUT_TOKENS})`;
    if (thoughts != null) {
      tokenBudgetHint += ` thoughtsTokenCount=${thoughts}`;
    }
    if (candidates != null) {
      tokenBudgetHint += ` candidatesTokenCount=${candidates}`;
    }
  } else if (
    input.responseEmpty &&
    input.maxOutputTokens < DEFAULT_PLANNER_MAX_OUTPUT_TOKENS
  ) {
    tokenBudgetHint = `${PLANNER_TOKEN_BUDGET_INCREASE_HINT} Current planner maxOutputTokens=${input.maxOutputTokens}; try ${DEFAULT_PLANNER_MAX_OUTPUT_TOKENS} or higher for Gemini 2.5 Pro.`;
  }

  return {
    maxOutputTokens: input.maxOutputTokens,
    recommendedMaxOutputTokens: DEFAULT_PLANNER_MAX_OUTPUT_TOKENS,
    thoughtsTokenCount: thoughts,
    candidatesTokenCount: candidates,
    totalTokenCount: total,
    tokenStarvationLikely,
    tokenBudgetRisk: risk,
    tokenBudgetHint,
  };
}

export interface PlannerTokenBudgetScenario {
  readonly maxOutputTokens: number;
  readonly thoughtsTokenCount: number;
  readonly responseEmpty: boolean;
  readonly tokenStarvationLikely: boolean;
  readonly tokenBudgetRisk: PlannerTokenBudgetRisk;
}

/** Document relative starvation risk across common planner output budgets. */
export function comparePlannerTokenBudgetScenarios(
  thoughtsTokenCount: number,
): readonly PlannerTokenBudgetScenario[] {
  const budgets = [1024, 4096, 8192, 16384] as const;
  return budgets.map((maxOutputTokens) => {
    const analysis = analyzePlannerTokenBudget({
      maxOutputTokens,
      usage: { thoughtsTokenCount, candidatesTokenCount: 0, totalTokenCount: thoughtsTokenCount },
      responseEmpty: true,
      finishReason: thoughtsTokenCount >= maxOutputTokens ? "MAX_TOKENS" : null,
      model: "gemini-2.5-pro",
    });
    return {
      maxOutputTokens,
      thoughtsTokenCount,
      responseEmpty: true,
      tokenStarvationLikely: analysis.tokenStarvationLikely,
      tokenBudgetRisk: analysis.tokenBudgetRisk,
    };
  });
}
