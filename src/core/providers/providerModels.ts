import type { ProviderId } from "./types";

/** Select value when the user picks a model outside the curated list. */
export const CUSTOM_MODEL_VALUE = "__custom__";

export interface CuratedModelEntry {
  id: string;
  recommended?: boolean;
}

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const GEMINI_CURATED_MODELS: readonly CuratedModelEntry[] = [
  { id: "gemini-2.5-pro" },
  { id: "gemini-2.5-flash", recommended: true },
  { id: "gemini-2.5-flash-lite" },
  { id: "gemini-2.0-flash" },
  { id: "gemini-2.0-flash-lite" },
];

export const GROQ_CURATED_MODELS: readonly CuratedModelEntry[] = [
  { id: "llama-3.3-70b-versatile", recommended: true },
  { id: "llama-3.1-8b-instant" },
  { id: "qwen/qwen3-32b" },
  { id: "openai/gpt-oss-120b" },
];

export const OPENROUTER_CURATED_MODELS: readonly CuratedModelEntry[] = [
  { id: "openai/gpt-4.1-mini" },
  { id: "openai/gpt-4.1" },
  { id: "anthropic/claude-3.5-sonnet" },
  { id: "anthropic/claude-sonnet-4", recommended: true },
  { id: "google/gemini-2.5-flash" },
  { id: "google/gemini-2.5-pro" },
  { id: "meta-llama/llama-3.3-70b-instruct" },
  { id: "qwen/qwen3-32b" },
];

export function providerUsesCuratedModels(provider: ProviderId): boolean {
  return provider === "gemini" || provider === "groq" || provider === "openrouter";
}

export function curatedModelsForProvider(
  provider: ProviderId,
): readonly CuratedModelEntry[] {
  switch (provider) {
    case "gemini":
      return GEMINI_CURATED_MODELS;
    case "groq":
      return GROQ_CURATED_MODELS;
    case "openrouter":
      return OPENROUTER_CURATED_MODELS;
    default:
      return [];
  }
}

export function curatedModelIdsForProvider(provider: ProviderId): string[] {
  return curatedModelsForProvider(provider).map((entry) => entry.id);
}

export function defaultModelForProvider(provider: ProviderId): string | null {
  switch (provider) {
    case "gemini":
      return DEFAULT_GEMINI_MODEL;
    case "groq":
      return DEFAULT_GROQ_MODEL;
    case "openrouter":
      return DEFAULT_OPENROUTER_MODEL;
    default:
      return null;
  }
}

export function isCuratedModel(model: string, provider: ProviderId): boolean {
  const trimmed = model.trim();
  if (!trimmed) return false;
  return curatedModelsForProvider(provider).some((entry) => entry.id === trimmed);
}

export function curatedModelSelectValue(model: string, provider: ProviderId): string {
  const trimmed = model.trim();
  if (isCuratedModel(trimmed, provider)) return trimmed;
  if (trimmed) return CUSTOM_MODEL_VALUE;
  return defaultModelForProvider(provider) ?? "";
}

export function formatCuratedModelOptionLabel(
  entry: CuratedModelEntry,
  opts?: { unavailable?: boolean },
): string {
  if (opts?.unavailable) return `${entry.id} — Model unavailable`;
  return entry.recommended ? `${entry.id} (Recommended)` : entry.id;
}

export function isGeminiCuratedModel(model: string): boolean {
  return isCuratedModel(model.trim(), "gemini");
}
