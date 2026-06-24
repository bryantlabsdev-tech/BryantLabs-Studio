/** Default models (mirrors src/core/providers/providerModels.ts). */
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Curated Gemini models shown in the settings dropdown. */
export const GEMINI_CURATED_MODEL_IDS: readonly string[] = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
