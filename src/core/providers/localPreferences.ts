import type { ProviderId } from "@/core/providers/types";

const STORAGE_KEY = "bryantlabs-studio-provider-prefs";

export interface ProviderLocalPreferences {
  provider?: ProviderId;
  geminiModel?: string;
  ollamaModel?: string;
  anthropicModel?: string;
  groqModel?: string;
  openrouterModel?: string;
}

export function readProviderLocalPreferences(): ProviderLocalPreferences {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProviderLocalPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeProviderLocalPreferences(
  prefs: ProviderLocalPreferences,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const prev = readProviderLocalPreferences();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...prev, ...prefs }),
    );
  } catch {
    // Quota / private mode — non-fatal.
  }
}

export function rememberProviderSelection(
  provider: ProviderId,
  model: string,
): void {
  const patch: ProviderLocalPreferences = { provider };
  if (provider === "gemini") patch.geminiModel = model;
  else if (provider === "ollama") patch.ollamaModel = model;
  else if (provider === "anthropic") patch.anthropicModel = model;
  else if (provider === "groq") patch.groqModel = model;
  else if (provider === "openrouter") patch.openrouterModel = model;
  writeProviderLocalPreferences(patch);
}
