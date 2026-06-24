import {
  ALL_PROVIDER_IDS,
  saveSettings,
  type ProviderId,
  type ProviderSettingsInput,
} from "./settings.cjs";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "./providerModels.cjs";

export interface E2eRealProviderConfig {
  readonly provider: ProviderId;
  readonly apiKey: string;
  readonly model: string | null;
}

const PROVIDER_ENV_KEYS: Readonly<Record<ProviderId, readonly string[]>> = {
  groq: ["BRYANTLABS_E2E_GROQ_API_KEY", "GROQ_API_KEY"],
  anthropic: ["BRYANTLABS_E2E_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  gemini: ["BRYANTLABS_E2E_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openrouter: ["BRYANTLABS_E2E_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"],
  ollama: [],
};

function ollamaBaseUrlFromEnv(): string {
  return (
    readEnv("BRYANTLABS_E2E_OLLAMA_BASE_URL") ??
    readEnv("OLLAMA_BASE_URL") ??
    "http://localhost:11434"
  );
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isProviderId(value: string): value is ProviderId {
  return (ALL_PROVIDER_IDS as readonly string[]).includes(value);
}

function apiKeyForProvider(provider: ProviderId): string | null {
  for (const key of PROVIDER_ENV_KEYS[provider]) {
    const value = readEnv(key);
    if (value) return value;
  }
  return null;
}

function defaultModelForProvider(provider: ProviderId): string {
  switch (provider) {
    case "groq":
      return DEFAULT_GROQ_MODEL;
    case "openrouter":
      return DEFAULT_OPENROUTER_MODEL;
    case "gemini":
      return DEFAULT_GEMINI_MODEL;
    case "anthropic":
      return readEnv("BRYANTLABS_E2E_ANTHROPIC_MODEL") ??
        readEnv("ANTHROPIC_MODEL") ??
        "claude-sonnet-4-20250514";
    case "ollama":
      return readEnv("BRYANTLABS_E2E_OLLAMA_MODEL") ??
        readEnv("OLLAMA_MODEL") ??
        "llama3.2";
    default:
      return "";
  }
}

/** Resolve real-provider credentials from env (Playwright smoke only). */
export function resolveE2eRealProviderConfig(): E2eRealProviderConfig | null {
  if (process.env.BRYANTLABS_E2E_REAL_PROVIDER !== "1") return null;

  const explicitProvider = readEnv("BRYANTLABS_E2E_PROVIDER");
  const explicitKey = readEnv("BRYANTLABS_E2E_API_KEY");
  const explicitModel = readEnv("BRYANTLABS_E2E_MODEL");

  if (explicitProvider && isProviderId(explicitProvider)) {
    const apiKey = explicitKey ?? apiKeyForProvider(explicitProvider);
    if (!apiKey && explicitProvider !== "ollama") return null;
    return {
      provider: explicitProvider,
      apiKey: apiKey ?? "",
      model: explicitModel ?? defaultModelForProvider(explicitProvider),
    };
  }

  const priority: readonly ProviderId[] = [
    "groq",
    "anthropic",
    "gemini",
    "openrouter",
    "ollama",
  ];
  for (const provider of priority) {
    if (provider === "ollama") {
      if (process.env.BRYANTLABS_E2E_INCLUDE_OLLAMA !== "1") continue;
      return {
        provider,
        apiKey: "",
        model: explicitModel ?? defaultModelForProvider(provider),
      };
    }
    const apiKey = apiKeyForProvider(provider);
    if (apiKey) {
      return {
        provider,
        apiKey,
        model: explicitModel ?? defaultModelForProvider(provider),
      };
    }
  }

  return null;
}

function settingsPatchForConfig(config: E2eRealProviderConfig): ProviderSettingsInput {
  const model = config.model?.trim() ?? "";
  const patch: ProviderSettingsInput = {
    provider: config.provider,
    plannerProvider: config.provider,
    coderProvider: config.provider,
    repairProvider: config.provider,
    plannerModel: model,
    coderModel: model,
    repairModel: model,
    maxAiCalls: 2,
    maxRepairAttempts: 0,
    stopOnProviderLimit: true,
    askBeforeFallback: false,
    agentMode: "single",
    autoFixMode: "off",
  };

  switch (config.provider) {
    case "groq":
      patch.groqApiKey = config.apiKey;
      if (model) patch.groqModel = model;
      break;
    case "anthropic":
      patch.anthropicApiKey = config.apiKey;
      if (model) patch.anthropicModel = model;
      break;
    case "gemini":
      patch.geminiApiKey = config.apiKey;
      if (model) patch.geminiModel = model;
      break;
    case "openrouter":
      patch.openrouterApiKey = config.apiKey;
      if (model) patch.openrouterModel = model;
      break;
    case "ollama":
      patch.ollamaBaseUrl = ollamaBaseUrlFromEnv();
      if (model) patch.ollamaModel = model;
      break;
    default:
      break;
  }

  return patch;
}

/** Seed provider-settings.json when running gated real-provider E2E smoke. */
export async function applyE2eRealProviderSettings(): Promise<E2eRealProviderConfig | null> {
  const config = resolveE2eRealProviderConfig();
  if (!config) return null;
  await saveSettings(settingsPatchForConfig(config));
  return config;
}
