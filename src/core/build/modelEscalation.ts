import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "@/core/providers/providerModels";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import { hasStoredApiKey } from "@/core/providers/AnthropicProvider";
import type { ProviderId, ProviderSettings, ProviderSettingsInput } from "@/core/providers/types";

export interface StrongerModelStep {
  readonly provider: ProviderId;
  readonly model: string;
  readonly label: string;
}

function isFlashGemini(model: string): boolean {
  return /flash/i.test(model);
}

function isProGemini(model: string): boolean {
  return /pro/i.test(model) && !/flash/i.test(model);
}

/** Next stronger provider/model for complex follow-ups. */
export function suggestStrongerModelStep(
  currentProvider: ProviderId,
  currentModel: string,
  settings: ProviderSettings,
): StrongerModelStep | null {
  const model = currentModel.trim();

  if (currentProvider === "gemini" && settings.hasGeminiKey) {
    if (isFlashGemini(model)) {
      return {
        provider: "gemini",
        model: "gemini-2.5-pro",
        label: "Use Gemini Pro",
      };
    }
    if (isProGemini(model) && settings.hasAnthropicKey) {
      return {
        provider: "anthropic",
        model: settings.anthropicModel || "claude-sonnet-4-20250514",
        label: "Use Claude Sonnet",
      };
    }
  }

  if (currentProvider === "anthropic" && settings.hasOpenRouterKey) {
    return {
      provider: "openrouter",
      model: settings.openrouterModel || DEFAULT_OPENROUTER_MODEL,
      label: "Use OpenRouter (GPT-4.1 / Claude)",
    };
  }

  if (currentProvider === "openrouter" && settings.hasGroqKey) {
    return {
      provider: "groq",
      model: settings.groqModel || "llama-3.3-70b-versatile",
      label: "Use Groq (Llama 70B)",
    };
  }

  if (currentProvider === "groq" && settings.hasAnthropicKey) {
    return {
      provider: "anthropic",
      model: settings.anthropicModel || "claude-sonnet-4-20250514",
      label: "Use Claude Sonnet",
    };
  }

  if (currentProvider === "ollama" && settings.hasGeminiKey) {
    return {
      provider: "gemini",
      model: settings.geminiModel || DEFAULT_GEMINI_MODEL,
      label: "Use Gemini",
    };
  }

  for (const provider of ["anthropic", "gemini", "openrouter", "groq"] as const) {
    if (provider === currentProvider) continue;
    if (!hasStoredApiKey(settings, provider)) continue;
    const stepModel =
      provider === "gemini"
        ? settings.geminiModel || DEFAULT_GEMINI_MODEL
        : provider === "anthropic"
          ? settings.anthropicModel
          : provider === "openrouter"
            ? settings.openrouterModel || DEFAULT_OPENROUTER_MODEL
            : settings.groqModel;
    return {
      provider,
      model: stepModel,
      label: `Use ${PROVIDER_DISPLAY_LABELS[provider]}`,
    };
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
