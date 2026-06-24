import type { ProviderId, ProviderInfo } from "./types";
import { curatedModelIdsForProvider } from "./providerModels.ts";

/**
 * Pluggable provider registry. Adding a new provider means appending an entry
 * here (and an implementation in the main process) — the UI is driven entirely
 * by this list, so nothing is hard-coded to a single provider.
 */
export const PROVIDERS: ReadonlyArray<ProviderInfo> = [
  {
    id: "gemini",
    label: "Gemini",
    needsApiKey: true,
    needsBaseUrl: false,
    suggestedModels: curatedModelIdsForProvider("gemini"),
  },
  {
    id: "ollama",
    label: "Ollama",
    needsApiKey: false,
    needsBaseUrl: true,
    /** Populated dynamically from `GET /api/tags` after health check. */
    suggestedModels: [],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    needsApiKey: true,
    needsBaseUrl: false,
    /** Populated dynamically from the Anthropic models API after health check. */
    suggestedModels: [],
  },
  {
    id: "groq",
    label: "Groq",
    needsApiKey: true,
    needsBaseUrl: false,
    suggestedModels: curatedModelIdsForProvider("groq"),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    needsApiKey: true,
    needsBaseUrl: false,
    suggestedModels: curatedModelIdsForProvider("openrouter"),
  },
];

export function getProviderInfo(id: ProviderId): ProviderInfo {
  const info = PROVIDERS.find((p) => p.id === id);
  if (!info) throw new Error(`Unknown provider: ${id}`);
  return info;
}
