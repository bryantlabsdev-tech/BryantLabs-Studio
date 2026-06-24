import {
  isGameplayOrLogicPrompt,
  isFunctionalFeaturePrompt,
  isUiLayoutPrompt,
} from "@/core/planner/fallback";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import {
  promptRequiresAuthentication,
  promptRequiresCloudSave,
  promptRequiresPayments,
} from "./authDependency";
import type { ComplexityRoutingDecision, FeatureInventorySnapshot } from "./types";

export interface ComplexityRoutingInput {
  readonly prompt: string;
  readonly fileCount: number;
  readonly featureInventory: FeatureInventorySnapshot | null;
  readonly settings: ProviderSettings;
}

function promptLower(prompt: string): string {
  return prompt.toLowerCase();
}

export function scoreComplexity(input: ComplexityRoutingInput): number {
  let score = 0;
  const p = promptLower(input.prompt);

  score += Math.min(input.fileCount * 0.8, 12);
  score += Math.min(input.prompt.length / 40, 8);

  const presentCount =
    input.featureInventory?.features.filter((f) => f.present).length ?? 0;
  score += Math.min(presentCount * 0.15, 4);

  if (
    promptRequiresAuthentication(p) ||
    promptRequiresCloudSave(p) ||
    promptRequiresPayments(p) ||
    /\bdatabase\b|multiplayer|architecture|refactor/i.test(p)
  ) {
    score += 12;
  }
  if (/premium|styling|spacing|color|margin|padding|ui polish/i.test(p)) {
    score += 3;
  }
  // Pipeline "rebuild / re-preview" in UI repair prompts is not a full-app rewrite.
  const fullRewrite =
    /from scratch|rewrite entire|entire app/i.test(p) ||
    (/\brebuild\b/i.test(p) && !isUiLayoutPrompt(p));
  if (fullRewrite) {
    score += 18;
  }

  if (
    promptRequiresAuthentication(p) ||
    promptRequiresCloudSave(p) ||
    promptRequiresPayments(p) ||
    /\bdatabase\b/i.test(p)
  ) {
    score += 10;
  }
  if (input.fileCount >= 6) score += 6;
  if (presentCount >= 8) score += 4;

  return Math.round(Math.min(100, score) * 10) / 10;
}

function tierFromScore(
  score: number,
  prompt: string,
): ComplexityRoutingDecision["tier"] {
  const p = promptLower(prompt);
  if (isGameplayOrLogicPrompt(p) || isFunctionalFeaturePrompt(p)) {
    return "feature_addition";
  }
  if (isUiLayoutPrompt(p)) {
    return "small_ui";
  }
  if (/architecture|refactor|rewrite entire|from scratch/i.test(p) || score >= 55) {
    return "architecture";
  }
  if (
    promptRequiresAuthentication(p) ||
    promptRequiresCloudSave(p) ||
    promptRequiresPayments(p) ||
    /\bdatabase\b/i.test(p) ||
    score >= 40
  ) {
    return "auth_database";
  }
  if (score >= 22) return "feature_addition";
  if (/premium|styling|spacing|ui polish|margin|padding/i.test(p) || score < 12) {
    return "small_ui";
  }
  if (score >= 35) return "large_app";
  return "feature_addition";
}

/** Advisory tier label — never overrides the model saved in Settings. */
function advisoryProviderForTier(
  tier: ComplexityRoutingDecision["tier"],
  settings: ProviderSettings,
): { provider: ProviderId; reason: string } {
  switch (tier) {
    case "small_ui":
    case "feature_addition":
      if (settings.hasGeminiKey) {
        return {
          provider: "gemini",
          reason: "Using your selected Gemini model from Settings",
        };
      }
      break;
    case "auth_database":
      if (settings.hasAnthropicKey) {
        return {
          provider: "anthropic",
          reason: "Auth/database complexity — using your selected Anthropic model",
        };
      }
      break;
    case "architecture":
    case "large_app":
      if (settings.hasOpenRouterKey) {
        return {
          provider: "openrouter",
          reason: "Large change — using your selected OpenRouter model",
        };
      }
      if (settings.hasAnthropicKey) {
        return {
          provider: "anthropic",
          reason: "Large change — using your selected Anthropic model",
        };
      }
      break;
  }

  return {
    provider: settings.provider,
    reason: "Using current provider settings",
  };
}

export function resolveComplexityRouting(
  input: ComplexityRoutingInput,
): ComplexityRoutingDecision {
  const score = scoreComplexity(input);
  const tier = tierFromScore(score, input.prompt);
  const pick = advisoryProviderForTier(tier, input.settings);
  const model = modelForProvider(input.settings, pick.provider);
  return {
    score,
    tier,
    provider: pick.provider,
    model,
    reason: pick.reason,
  };
}

/** @deprecated Complexity routing is advisory only — Settings is the source of truth. */
export function complexitySettingsPatch(
  _decision: ComplexityRoutingDecision,
): import("@/core/providers/types").ProviderSettingsInput {
  return {};
}
