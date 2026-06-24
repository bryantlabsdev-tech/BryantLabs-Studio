/**
 * Provider system shared types (Phase 7).
 *
 * These describe the *shape* of provider communication only. There is no
 * generation, editing, or project context here — providers exist solely to
 * answer a single test prompt and report health. The actual network calls and
 * any secrets live in the Electron main process; the renderer only ever sees
 * the sanitized shapes below.
 */

export type ProviderId =
  | "gemini"
  | "ollama"
  | "anthropic"
  | "groq"
  | "openrouter";

export type ProviderConnectionStatus =
  | "connected"
  | "invalid_key"
  | "rate_limited"
  | "offline"
  | "unknown";

export type AutoFixMode = "off" | "ask" | "automatic";

export type AgentMode = "single" | "pipeline";

/** Safe = empty folders only; Workspace = overwrite existing project files. */
export type FileWriteMode = "safe" | "workspace";

/** Sanitized settings sent to the renderer — never contains a raw API key. */
export interface ProviderSettings {
  /** The provider the user has selected (the "requested" provider). */
  provider: ProviderId;
  geminiModel: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
  anthropicModel: string;
  groqModel: string;
  openrouterModel: string;
  /** Whether a Gemini API key is stored locally (the key itself is never sent). */
  hasGeminiKey: boolean;
  /** Whether an Anthropic API key is stored locally (the key itself is never sent). */
  hasAnthropicKey: boolean;
  /** Whether a Groq API key is stored locally. */
  hasGroqKey: boolean;
  /** Whether an OpenRouter API key is stored locally. */
  hasOpenRouterKey: boolean;
  /** Masked Gemini key for display only (e.g. sk-••••abcd). */
  geminiKeyPreview?: string | null;
  /** Masked Anthropic key for display only (e.g. sk-ant-••••abcd). */
  anthropicKeyPreview?: string | null;
  /** Masked Groq key for display only. */
  groqKeyPreview?: string | null;
  /** Masked OpenRouter key for display only. */
  openrouterKeyPreview?: string | null;
  /** Phase 13 — autonomous repair after Apply Plan verification failures. */
  autoFixMode: AutoFixMode;
  /** Phase 22.5 — single global provider vs per-stage pipeline routing. */
  agentMode: AgentMode;
  /** Preferred fallback when the primary provider fails (tried once before others). */
  backupProvider?: ProviderId | null;
  plannerProvider: ProviderId;
  plannerModel: string;
  coderProvider: ProviderId;
  coderModel: string;
  repairProvider: ProviderId;
  repairModel: string;
  maxAiCalls: number;
  maxRepairAttempts: number;
  stopOnProviderLimit: boolean;
  askBeforeFallback: boolean;
  /** Defaults to workspace when unset (see normalizeProviderSettings). */
  fileWriteMode?: FileWriteMode;
  /** Max output tokens for planner generate/retry (Gemini thinking models need headroom). */
  plannerMaxOutputTokens?: number;
}

/** Partial update from the renderer. A provided `geminiApiKey` is stored as-is. */
export interface ProviderSettingsInput {
  provider?: ProviderId;
  geminiModel?: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  anthropicModel?: string;
  groqModel?: string;
  openrouterModel?: string;
  /** undefined = leave unchanged; "" = clear; non-empty = set. */
  geminiApiKey?: string;
  anthropicApiKey?: string;
  groqApiKey?: string;
  openrouterApiKey?: string;
  autoFixMode?: AutoFixMode;
  agentMode?: AgentMode;
  backupProvider?: ProviderId | null;
  plannerProvider?: ProviderId;
  plannerModel?: string;
  coderProvider?: ProviderId;
  coderModel?: string;
  repairProvider?: ProviderId;
  repairModel?: string;
  maxAiCalls?: number;
  maxRepairAttempts?: number;
  stopOnProviderLimit?: boolean;
  askBeforeFallback?: boolean;
  fileWriteMode?: FileWriteMode;
  plannerMaxOutputTokens?: number;
}

export interface HealthCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface HealthResult {
  ok: boolean;
  /** The provider that was checked (echoed back — never silently swapped). */
  provider: ProviderId;
  model: string;
  checks: HealthCheck[];
  /** Models discovered during the check (e.g. Ollama tags), if any. */
  models?: string[];
  /** Connectivity summary for the Providers panel. */
  connectionStatus?: ProviderConnectionStatus;
  error?: string;
}

/** Common response shape returned by every provider. */
export interface ProviderResponse {
  ok: boolean;
  /** The provider that actually handled the request (no silent fallback). */
  provider: ProviderId;
  /** The model that actually handled the request. */
  model: string;
  /** Extracted plain text from the provider response (best-effort). */
  text: string;
  /** The raw provider payload, for transparency. */
  raw: unknown;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
  responseBody?: string;
  apiKeyPresent?: boolean;
}

/** Native or text-fallback agent tool-selection response. */
export interface AgentStepResponse {
  ok: boolean;
  provider: ProviderId;
  model: string;
  text: string;
  nativeArgs?: Record<string, unknown>;
  nativeToolCall: boolean;
  latencyMs: number;
  error?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Whether this provider requires a stored API key. */
  needsApiKey: boolean;
  /** Whether this provider talks to a configurable base URL. */
  needsBaseUrl: boolean;
  /** Suggested models (the user may type a custom one). */
  suggestedModels: string[];
}
