import type { ProviderId, ProviderSettings, ProviderSettingsInput } from "@/core/providers/types";
import { getProviderInfo } from "@/core/providers/registry";
import { formatMaskedApiKeyPreview, isMaskedApiKeyPreview } from "@/core/providers/apiKeyFormat";

/** UI placeholder — must never be written to disk. */
export const STORED_KEY_PLACEHOLDER = "Stored — type to replace";

/** Legacy alias used by Gemini settings. */
export const GEMINI_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;

/** Legacy alias used by Anthropic settings. */
export const ANTHROPIC_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;

export const GROQ_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;
export const OPENROUTER_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;

const API_KEY_INPUT_FIELD: Partial<
  Record<ProviderId, keyof ProviderSettingsInput>
> = {
  gemini: "geminiApiKey",
  anthropic: "anthropicApiKey",
  groq: "groqApiKey",
  openrouter: "openrouterApiKey",
};

/** Masked display for a stored API key (never includes full secret). */
export function formatStoredApiKeyPreview(rawKey: string): string | null {
  return formatMaskedApiKeyPreview(rawKey);
}

export function isStoredKeyPlaceholder(draft: string): boolean {
  const t = draft.trim();
  return t === STORED_KEY_PLACEHOLDER;
}

/** True when the draft is a new secret to persist (not masked preview / placeholder). */
export function shouldPersistApiKeyDraft(
  draft: string,
  maskedPreview: string | null | undefined,
): boolean {
  const trimmed = draft.trim();
  if (!trimmed) return false;
  if (isStoredKeyPlaceholder(trimmed)) return false;
  if (maskedPreview && trimmed === maskedPreview) return false;
  if (isMaskedApiKeyPreview(trimmed)) return false;
  if (/^sk-ant-•+/.test(trimmed) || /^sk-•+/.test(trimmed) || /^•+/.test(trimmed)) {
    return false;
  }
  return true;
}

export function apiKeyPreviewForProvider(
  settings: ProviderSettings,
  provider: ProviderId,
): string | null {
  switch (provider) {
    case "gemini":
      return settings.geminiKeyPreview ?? null;
    case "anthropic":
      return settings.anthropicKeyPreview ?? null;
    case "groq":
      return settings.groqKeyPreview ?? null;
    case "openrouter":
      return settings.openrouterKeyPreview ?? null;
    default:
      return null;
  }
}

export function apiKeyClearPayload(provider: ProviderId): ProviderSettingsInput {
  const field = API_KEY_INPUT_FIELD[provider];
  if (!field) return {};
  return { [field]: "" } as ProviderSettingsInput;
}

export function apiKeySavedNote(provider: ProviderId): string {
  return `${getProviderInfo(provider).label} API key saved`;
}

export function apiKeyClearedNote(provider: ProviderId): string {
  return `${getProviderInfo(provider).label} API key cleared`;
}

export function buildProviderSettingsSavePayload(
  settings: ProviderSettings,
  apiKeyDraft: string,
): ProviderSettingsInput {
  const payload: ProviderSettingsInput = {
    provider: settings.provider,
    geminiModel: settings.geminiModel,
    ollamaModel: settings.ollamaModel,
    ollamaBaseUrl: settings.ollamaBaseUrl,
    anthropicModel: settings.anthropicModel,
    groqModel: settings.groqModel,
    openrouterModel: settings.openrouterModel,
    autoFixMode: settings.autoFixMode,
    agentMode: settings.agentMode,
    plannerProvider: settings.plannerProvider,
    plannerModel: settings.plannerModel,
    coderProvider: settings.coderProvider,
    coderModel: settings.coderModel,
    repairProvider: settings.repairProvider,
    repairModel: settings.repairModel,
    maxAiCalls: settings.maxAiCalls,
    maxRepairAttempts: settings.maxRepairAttempts,
    stopOnProviderLimit: settings.stopOnProviderLimit,
    askBeforeFallback: settings.askBeforeFallback,
  };

  const provider = settings.provider;
  const draft = apiKeyDraft.trim();
  if (
    provider === "gemini" &&
    shouldPersistApiKeyDraft(draft, settings.geminiKeyPreview)
  ) {
    payload.geminiApiKey = draft;
  }
  if (
    provider === "anthropic" &&
    shouldPersistApiKeyDraft(draft, settings.anthropicKeyPreview)
  ) {
    payload.anthropicApiKey = draft;
  }
  if (
    provider === "groq" &&
    shouldPersistApiKeyDraft(draft, settings.groqKeyPreview)
  ) {
    payload.groqApiKey = draft;
  }
  if (
    provider === "openrouter" &&
    shouldPersistApiKeyDraft(draft, settings.openrouterKeyPreview)
  ) {
    payload.openrouterApiKey = draft;
  }

  return payload;
}
