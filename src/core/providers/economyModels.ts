import { modelForProvider } from "@/core/providers/AnthropicProvider";
import { isPipelineMode } from "@/core/providers/orchestration";
import type { AgentStage } from "@/core/providers/orchestration";
import { canUseDeterministicPlanWithoutProviderCall } from "@/core/planner/plannerPreflight";
import type { Plan } from "@/core/planner/types";
import type { ComplexityRoutingDecision } from "@/core/intelligence/types";
import type { CostMode, ProviderId, ProviderSettings } from "@/core/providers/types";

/** Cheaper Anthropic model for patch/repair stages (≈10× lower $/token vs Opus). */
export const ECONOMY_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
export const ECONOMY_GEMINI_MODEL = "gemini-2.5-flash-lite";
export const ECONOMY_GROQ_MODEL = "llama-3.1-8b-instant";
export const ECONOMY_OPENROUTER_MODEL = "openai/gpt-4.1-mini";

export const COST_MODE_DEFAULT: CostMode = "standard";

export function isEconomyMode(settings: Pick<ProviderSettings, "costMode">): boolean {
  return settings.costMode === "economy";
}

export function economyModelForProvider(
  provider: ProviderId,
  settings: ProviderSettings,
): string {
  switch (provider) {
    case "anthropic":
      return ECONOMY_ANTHROPIC_MODEL;
    case "gemini":
      return ECONOMY_GEMINI_MODEL;
    case "groq":
      return ECONOMY_GROQ_MODEL;
    case "openrouter":
      return ECONOMY_OPENROUTER_MODEL;
    case "ollama":
      return modelForProvider(settings, provider);
    default:
      return modelForProvider(settings, provider);
  }
}

/** Economy patch/repair model unless the user set an explicit pipeline stage override. */
export function economyModelForStage(
  settings: ProviderSettings,
  stage: AgentStage,
  provider: ProviderId,
): string | null {
  if (!isEconomyMode(settings)) return null;
  if (stage !== "coder" && stage !== "repair") return null;
  if (isPipelineMode(settings)) {
    const override =
      stage === "coder" ? settings.coderModel?.trim() : settings.repairModel?.trim();
    if (override) return null;
  }
  return economyModelForProvider(provider, settings);
}

export function formatEconomyRoutingHint(settings: ProviderSettings): string | null {
  if (!isEconomyMode(settings)) return null;
  const provider = settings.provider;
  const plannerModel = modelForProvider(settings, provider);
  const coderModel = economyModelForProvider(provider, settings);
  return `Economy · Planner ${plannerModel} · Coder/Repair ${coderModel}`;
}

/** Skip the paid planner when a local deterministic plan already targets the right files. */
export function canSkipAiPlannerCall(input: {
  readonly settings: ProviderSettings;
  readonly userPrompt: string;
  readonly plan: Plan;
  readonly route?: string | null;
  readonly complexityTier?: ComplexityRoutingDecision["tier"];
}): boolean {
  const { settings, userPrompt, plan, route, complexityTier } = input;
  if (canUseDeterministicPlanWithoutProviderCall(userPrompt, plan, route)) {
    return true;
  }
  if (!isEconomyMode(settings)) return false;
  if (route && route !== "edit_follow_up") return false;
  if (plan.files.length === 0 || plan.files.length > 4) return false;
  if (complexityTier !== "small_ui" && complexityTier !== "feature_addition") {
    return false;
  }
  return true;
}
