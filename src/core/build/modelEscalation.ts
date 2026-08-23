import { hasStoredApiKey } from "@/core/providers/AnthropicProvider";
import { isProviderEnabled } from "@/core/providers/providerEnablement";
import type { ProviderId, ProviderSettings, ProviderSettingsInput } from "@/core/providers/types";

export interface StrongerModelStep {
  readonly provider: ProviderId;
  readonly model: string;
  readonly label: string;
}

function isFlashGemini(model: string): boolean {
  return /flash/i.test(model);
}

function canEscalateTo(
  settings: ProviderSettings,
  provider: ProviderId,
): boolean {
  return isProviderEnabled(settings, provider) && hasStoredApiKey(settings, provider);
}

/**
 * Same-provider model upgrades only. Cross-provider fallback is explicit
 * (Settings + Ask before fallback) so a failed Anthropic edit cannot silently
 * switch the workspace onto OpenRouter/Gemini/Groq.
 */
export function suggestStrongerModelStep(
  currentProvider: ProviderId,
  currentModel: string,
  settings: ProviderSettings,
): StrongerModelStep | null {
  const model = currentModel.trim();

  if (currentProvider === "gemini" && canEscalateTo(settings, "gemini")) {
    if (isFlashGemini(model)) {
      return {
        provider: "gemini",
        model: "gemini-2.5-pro",
        label: "Use Gemini Pro",
      };
    }
  }

  return null;
}

export function strongerModelSettingsPatch(step: StrongerModelStep): ProviderSettingsInput {
  switch (step.provider) {
    case "gemini":
      return { provider: "gemini", geminiModel: step.model };
    case "anthropic":
      return { provider: "anthropic", anthropicModel: step.model };
    case "openrouter":
      return { provider: "openrouter", openrouterModel: step.model };
    case "groq":
      return { provider: "groq", groqModel: step.model };
    default:
      return { provider: step.provider };
  }
}

export function shouldOfferStrongerModel(error: string): boolean {
  if (/ai plan failed|no json returned|planner.*failed/i.test(error)) {
    return false;
  }
  return (
    /zero valid patch proposals/i.test(error) ||
    /Could not find repaired file|invalid format|PATCH_FORMAT/i.test(error) ||
    /timed out|timeout/i.test(error) ||
    /rate limit|429|high demand|resource exhausted/i.test(error) ||
    /retry count|max ai calls|budget exceeded/i.test(error) ||
    /provider request failed/i.test(error)
  );
}
