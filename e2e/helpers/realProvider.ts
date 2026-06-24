import type { ProviderId } from "../../src/core/providers/types";

const PROVIDER_ENV_KEYS: Readonly<Record<ProviderId, readonly string[]>> = {
  groq: ["BRYANTLABS_E2E_GROQ_API_KEY", "GROQ_API_KEY"],
  anthropic: ["BRYANTLABS_E2E_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  gemini: ["BRYANTLABS_E2E_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openrouter: ["BRYANTLABS_E2E_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"],
  ollama: [],
};

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isProviderId(value: string): value is ProviderId {
  return (
    value === "gemini" ||
    value === "ollama" ||
    value === "anthropic" ||
    value === "groq" ||
    value === "openrouter"
  );
}

/** True when real-provider smoke is requested and credentials are present. */
export function realProviderSmokeReady(): boolean {
  if (process.env.BRYANTLABS_E2E_REAL_PROVIDER !== "1") return false;
  return resolveRealProviderEnv()?.hasCredentials === true;
}

export function resolveRealProviderEnv(): {
  provider: ProviderId;
  hasCredentials: boolean;
  model: string | null;
} | null {
  if (process.env.BRYANTLABS_E2E_REAL_PROVIDER !== "1") return null;

  const explicitProvider = readEnv("BRYANTLABS_E2E_PROVIDER");
  const explicitKey = readEnv("BRYANTLABS_E2E_API_KEY");
  const explicitModel = readEnv("BRYANTLABS_E2E_MODEL");

  if (explicitProvider && isProviderId(explicitProvider)) {
    const hasCredentials =
      explicitProvider === "ollama"
        ? process.env.BRYANTLABS_E2E_INCLUDE_OLLAMA === "1"
        : Boolean(explicitKey ?? PROVIDER_ENV_KEYS[explicitProvider].some((k) => readEnv(k)));
    return {
      provider: explicitProvider,
      hasCredentials,
      model: explicitModel,
    };
  }

  const priority: readonly ProviderId[] = [
    "groq",
    "anthropic",
    "gemini",
    "openrouter",
  ];
  for (const provider of priority) {
    if (PROVIDER_ENV_KEYS[provider].some((key) => readEnv(key))) {
      return { provider, hasCredentials: true, model: explicitModel };
    }
  }

  if (process.env.BRYANTLABS_E2E_INCLUDE_OLLAMA === "1") {
    return { provider: "ollama", hasCredentials: true, model: explicitModel };
  }

  return null;
}

export function realProviderSkipReason(): string {
  if (process.env.BRYANTLABS_E2E_REAL_PROVIDER !== "1") {
    return "Set BRYANTLABS_E2E_REAL_PROVIDER=1 to run real-provider smoke.";
  }
  return (
    "Set a provider API key (e.g. GROQ_API_KEY or ANTHROPIC_API_KEY) " +
    "or BRYANTLABS_E2E_PROVIDER + BRYANTLABS_E2E_API_KEY."
  );
}
