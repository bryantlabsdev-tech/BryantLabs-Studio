/**
 * Shared provider helpers (renderer-safe).
 * Network calls live in `electron/providers/*.cts`.
 */
export {
  classifyHttpConnectionStatus,
  extractAnthropicApiError,
  parseAnthropicModelIds,
  PROVIDER_CONNECTION_LABELS,
  type ProviderConnectionStatus,
} from "@/core/providers/connectionStatus";

import { getProviderInfo } from "@/core/providers/registry";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";

export function anthropicModelFromSettings(
  settings: ProviderSettings,
): string {
  return settings.anthropicModel.trim();
}

export function isAnthropicReady(settings: ProviderSettings): boolean {
  return (
    settings.provider === "anthropic" &&
    settings.hasAnthropicKey &&
    settings.anthropicModel.trim().length > 0
  );
}

export function modelForProvider(
  settings: ProviderSettings,
  provider: ProviderId = settings.provider,
): string {
  switch (provider) {
    case "gemini":
      return settings.geminiModel;
    case "ollama":
      return settings.ollamaModel;
    case "anthropic":
      return settings.anthropicModel;
    case "groq":
      return settings.groqModel;
    case "openrouter":
      return settings.openrouterModel;
    default:
      return "";
  }
}

export function hasStoredApiKey(
  settings: ProviderSettings,
  provider: ProviderId,
): boolean {
  switch (provider) {
    case "gemini":
      return settings.hasGeminiKey;
    case "anthropic":
      return settings.hasAnthropicKey;
    case "groq":
      return settings.hasGroqKey;
    case "openrouter":
      return settings.hasOpenRouterKey;
    default:
      return false;
  }
}

export function patchModelForProvider(
  provider: ProviderId,
  model: string,
): Partial<ProviderSettings> {
  switch (provider) {
    case "gemini":
      return { geminiModel: model };
    case "ollama":
      return { ollamaModel: model };
    case "anthropic":
      return { anthropicModel: model };
    case "groq":
      return { groqModel: model };
    case "openrouter":
      return { openrouterModel: model };
    default:
      return {};
  }
}

export function isProviderReady(settings: ProviderSettings): boolean {
  return isProviderConfigured(settings, settings.provider);
}

export function isProviderConfigured(
  settings: ProviderSettings,
  provider: ProviderId,
): boolean {
  switch (provider) {
    case "gemini":
      return Boolean(
        settings.hasGeminiKey && settings.geminiModel.trim().length > 0,
      );
    case "anthropic":
      return Boolean(
        settings.hasAnthropicKey && settings.anthropicModel.trim().length > 0,
      );
    case "groq":
      return Boolean(settings.hasGroqKey && settings.groqModel.trim().length > 0);
    case "openrouter":
      return Boolean(
        settings.hasOpenRouterKey && settings.openrouterModel.trim().length > 0,
      );
    case "ollama":
      return Boolean(
        settings.ollamaModel.trim().length > 0 &&
          settings.ollamaBaseUrl.trim().length > 0,
      );
    default:
      return false;
  }
}

export function providerLabel(provider: ProviderId): string {
  return getProviderInfo(provider).label;
}
