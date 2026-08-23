import { app } from "electron";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { writeJsonAtomic } from "../safeFs.cjs";
import { formatMaskedApiKeyPreview } from "./apiKeyFormat.cjs";
import {
  coercePlannerMaxOutputTokens,
  DEFAULT_PLANNER_MAX_OUTPUT_TOKENS,
} from "./plannerTokenBudget.cjs";
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "./providerModels.cjs";

/**
 * Local provider settings store (Phase 7).
 *
 * Settings — including API keys — are persisted to a JSON file under
 * the OS user-data directory. The raw keys NEVER leave the main process: the
 * renderer only ever receives a sanitized view (`has*Key` flags).
 */

export type ProviderId =
  | "gemini"
  | "ollama"
  | "anthropic"
  | "groq"
  | "openrouter";

export const ALL_PROVIDER_IDS: readonly ProviderId[] = [
  "gemini",
  "anthropic",
  "openrouter",
  "groq",
  "ollama",
];

export type AutoFixMode = "off" | "ask" | "automatic";

export type AgentMode = "single" | "pipeline";

export type CostMode = "standard" | "economy";

/** Greenfield / agent file writes: empty folders only vs overwrite in workspace. */
export type FileWriteMode = "safe" | "workspace";

/** Shown in the UI as a password placeholder — must never be persisted. */
export const STORED_KEY_PLACEHOLDER = "Stored — type to replace";
export const GEMINI_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;
export const ANTHROPIC_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;
export const GROQ_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;
export const OPENROUTER_KEY_PLACEHOLDER = STORED_KEY_PLACEHOLDER;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export interface RawProviderSettings {
  provider: ProviderId;
  geminiModel: string;
  geminiApiKey: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
  anthropicModel: string;
  anthropicApiKey: string;
  groqModel: string;
  groqApiKey: string;
  openrouterModel: string;
  openrouterApiKey: string;
  autoFixMode: AutoFixMode;
  agentMode: AgentMode;
  backupProvider: ProviderId | null;
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
  fileWriteMode: FileWriteMode;
  plannerMaxOutputTokens: number;
  providerEnabled: Partial<Record<ProviderId, boolean>>;
  costMode: CostMode;
}

export interface ProviderSettingsView {
  provider: ProviderId;
  geminiModel: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
  anthropicModel: string;
  groqModel: string;
  openrouterModel: string;
  hasGeminiKey: boolean;
  hasAnthropicKey: boolean;
  hasGroqKey: boolean;
  hasOpenRouterKey: boolean;
  geminiKeyPreview: string | null;
  anthropicKeyPreview: string | null;
  groqKeyPreview: string | null;
  openrouterKeyPreview: string | null;
  autoFixMode: AutoFixMode;
  agentMode: AgentMode;
  backupProvider: ProviderId | null;
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
  fileWriteMode: FileWriteMode;
  plannerMaxOutputTokens: number;
  providerEnabled: Partial<Record<ProviderId, boolean>>;
  costMode: CostMode;
}

export interface ProviderSettingsInput {
  provider?: ProviderId;
  geminiModel?: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  anthropicModel?: string;
  groqModel?: string;
  openrouterModel?: string;
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
  providerEnabled?: Partial<Record<ProviderId, boolean>>;
  costMode?: CostMode;
}

function normalizeProviderEnabled(
  partial?: Partial<Record<ProviderId, boolean>>,
): Record<ProviderId, boolean> {
  return {
    gemini: partial?.gemini !== false,
    anthropic: partial?.anthropic !== false,
    openrouter: partial?.openrouter !== false,
    groq: partial?.groq !== false,
    ollama: partial?.ollama !== false,
  };
}

export function isAllowedOllamaBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function defaults(): RawProviderSettings {
  return {
    provider: "ollama",
    geminiModel: DEFAULT_GEMINI_MODEL,
    geminiApiKey: "",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "",
    anthropicApiKey: "",
    groqModel: DEFAULT_GROQ_MODEL,
    groqApiKey: "",
    openrouterModel: DEFAULT_OPENROUTER_MODEL,
    openrouterApiKey: "",
    autoFixMode: "ask",
    agentMode: "single",
    backupProvider: null,
    plannerProvider: "ollama",
    plannerModel: "",
    coderProvider: "ollama",
    coderModel: "",
    repairProvider: "ollama",
    repairModel: "",
    maxAiCalls: 3,
    maxRepairAttempts: 3,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    fileWriteMode: "workspace",
    plannerMaxOutputTokens: DEFAULT_PLANNER_MAX_OUTPUT_TOKENS,
    providerEnabled: normalizeProviderEnabled(),
    costMode: "standard",
  };
}

function coerceFileWriteMode(value: unknown): FileWriteMode {
  if (value === "safe" || value === "workspace") return value;
  return "workspace";
}

function coerceAutoFixMode(value: unknown): AutoFixMode {
  if (value === "off" || value === "ask" || value === "automatic") return value;
  return "ask";
}

function coerceAgentMode(value: unknown): AgentMode {
  if (value === "single" || value === "pipeline") return value;
  return "single";
}

function coerceCostMode(value: unknown): CostMode {
  if (value === "economy") return "economy";
  return "standard";
}

function coercePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return n >= 0 ? n : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

const ENABLEMENT_ORDER: readonly ProviderId[] = [
  "gemini",
  "anthropic",
  "openrouter",
  "groq",
  "ollama",
];

function providerHasCredential(raw: RawProviderSettings, id: ProviderId): boolean {
  switch (id) {
    case "anthropic":
      return raw.anthropicApiKey.trim().length > 0;
    case "gemini":
      return raw.geminiApiKey.trim().length > 0;
    case "groq":
      return raw.groqApiKey.trim().length > 0;
    case "openrouter":
      return raw.openrouterApiKey.trim().length > 0;
    default:
      return true;
  }
}

function stageModelCompatible(model: string, provider: ProviderId): boolean {
  const value = model.trim();
  if (!value) return true;
  if (value.includes("/")) return provider === "openrouter";
  if (/^claude/i.test(value)) return provider === "anthropic";
  if (/^gemini/i.test(value)) return provider === "gemini";
  if (value.includes(":") && !/^claude/i.test(value)) {
    return provider === "ollama" || provider === "groq";
  }
  return true;
}

/** Remap disabled active/stage providers so generate() cannot stay on OpenRouter. */
export function coerceRawToEnabledProviders(
  raw: RawProviderSettings,
): RawProviderSettings {
  const enabled = normalizeProviderEnabled(raw.providerEnabled);
  const pick = (current: ProviderId): ProviderId => {
    if (enabled[current]) return current;
    for (const id of ENABLEMENT_ORDER) {
      if (enabled[id] && providerHasCredential(raw, id)) return id;
    }
    for (const id of ENABLEMENT_ORDER) {
      if (enabled[id]) return id;
    }
    return current;
  };
  const provider = pick(raw.provider);
  const plannerProvider = pick(raw.plannerProvider);
  const coderProvider = pick(raw.coderProvider);
  const repairProvider = pick(raw.repairProvider);
  const backupProvider =
    raw.backupProvider && enabled[raw.backupProvider] ? raw.backupProvider : null;
  return {
    ...raw,
    provider,
    plannerProvider,
    coderProvider,
    repairProvider,
    backupProvider,
    plannerModel: stageModelCompatible(raw.plannerModel, plannerProvider)
      ? raw.plannerModel
      : "",
    coderModel: stageModelCompatible(raw.coderModel, coderProvider) ? raw.coderModel : "",
    repairModel: stageModelCompatible(raw.repairModel, repairProvider)
      ? raw.repairModel
      : "",
  };
}

function coerceApiKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

/** Masked API key for renderer display (never includes full secret). */
function formatStoredApiKeyPreview(rawKey: string): string | null {
  return formatMaskedApiKeyPreview(rawKey);
}

function isMaskedKeyDraft(trimmed: string): boolean {
  return (
    trimmed === STORED_KEY_PLACEHOLDER ||
    trimmed === GEMINI_KEY_PLACEHOLDER ||
    trimmed === ANTHROPIC_KEY_PLACEHOLDER ||
    trimmed === GROQ_KEY_PLACEHOLDER ||
    trimmed === OPENROUTER_KEY_PLACEHOLDER ||
    /^sk-ant-•+/.test(trimmed) ||
    /^sk-•+/.test(trimmed) ||
    /^•+/.test(trimmed) ||
    /\*{4,}/.test(trimmed)
  );
}

function resolveApiKeyField(
  input: ProviderSettingsInput,
  field: "geminiApiKey" | "anthropicApiKey" | "groqApiKey" | "openrouterApiKey",
  current: string,
): string {
  if (!(field in input)) return current;
  const raw = input[field];
  if (raw === undefined || raw === null) return current;
  const trimmed = String(raw).trim();
  if (isMaskedKeyDraft(trimmed)) return current;
  return trimmed;
}

function coerceProviderId(value: unknown): ProviderId {
  if (
    value === "gemini" ||
    value === "ollama" ||
    value === "anthropic" ||
    value === "groq" ||
    value === "openrouter"
  ) {
    return value;
  }
  return defaults().provider;
}

function normalizeLoaded(raw: RawProviderSettings): RawProviderSettings {
  const geminiApiKey = coerceApiKey(raw.geminiApiKey);
  const anthropicApiKey = coerceApiKey(raw.anthropicApiKey);
  const groqApiKey = coerceApiKey(raw.groqApiKey);
  const openrouterApiKey = coerceApiKey(raw.openrouterApiKey);
  const geminiModel =
    typeof raw.geminiModel === "string" ? raw.geminiModel : defaults().geminiModel;
  const provider = coerceProviderId(raw.provider);
  const base = defaults();
  const normalized: RawProviderSettings = {
    provider,
    geminiModel,
    geminiApiKey,
    ollamaModel: typeof raw.ollamaModel === "string" ? raw.ollamaModel : base.ollamaModel,
    ollamaBaseUrl:
      typeof raw.ollamaBaseUrl === "string" && isAllowedOllamaBaseUrl(raw.ollamaBaseUrl)
        ? raw.ollamaBaseUrl
        : base.ollamaBaseUrl,
    anthropicModel:
      typeof raw.anthropicModel === "string" ? raw.anthropicModel : base.anthropicModel,
    anthropicApiKey,
    groqModel: typeof raw.groqModel === "string" ? raw.groqModel : base.groqModel,
    groqApiKey,
    openrouterModel:
      typeof raw.openrouterModel === "string" ? raw.openrouterModel : base.openrouterModel,
    openrouterApiKey,
    autoFixMode: coerceAutoFixMode(raw.autoFixMode),
    agentMode: coerceAgentMode(raw.agentMode),
    backupProvider:
      raw.backupProvider === null
        ? null
        : isProviderId(raw.backupProvider)
          ? raw.backupProvider
          : null,
    plannerProvider: coerceProviderId(raw.plannerProvider ?? provider),
    plannerModel: typeof raw.plannerModel === "string" ? raw.plannerModel : "",
    coderProvider: coerceProviderId(raw.coderProvider ?? provider),
    coderModel: typeof raw.coderModel === "string" ? raw.coderModel : "",
    repairProvider: coerceProviderId(raw.repairProvider ?? provider),
    repairModel: typeof raw.repairModel === "string" ? raw.repairModel : "",
    maxAiCalls: coercePositiveInt(raw.maxAiCalls, base.maxAiCalls),
    maxRepairAttempts: coercePositiveInt(raw.maxRepairAttempts, base.maxRepairAttempts),
    stopOnProviderLimit: coerceBoolean(raw.stopOnProviderLimit, base.stopOnProviderLimit),
    askBeforeFallback: coerceBoolean(raw.askBeforeFallback, base.askBeforeFallback),
    fileWriteMode: coerceFileWriteMode(raw.fileWriteMode),
    plannerMaxOutputTokens: coercePlannerMaxOutputTokens(
      raw.plannerMaxOutputTokens ?? DEFAULT_PLANNER_MAX_OUTPUT_TOKENS,
    ),
    providerEnabled: normalizeProviderEnabled(raw.providerEnabled),
    costMode: coerceCostMode(raw.costMode),
  };
  return coerceRawToEnabledProviders(normalized);
}

function settingsFile(): string {
  return path.join(app.getPath("userData"), "provider-settings.json");
}

export async function loadRawSettings(): Promise<RawProviderSettings> {
  try {
    const text = await fs.readFile(settingsFile(), "utf8");
    const parsed = JSON.parse(text) as Partial<RawProviderSettings>;
    return normalizeLoaded({ ...defaults(), ...parsed });
  } catch {
    return defaults();
  }
}

function sanitize(raw: RawProviderSettings): ProviderSettingsView {
  const geminiKey = coerceApiKey(raw.geminiApiKey);
  const anthropicKey = coerceApiKey(raw.anthropicApiKey);
  const groqKey = coerceApiKey(raw.groqApiKey);
  const openrouterKey = coerceApiKey(raw.openrouterApiKey);
  return {
    provider: raw.provider,
    geminiModel: raw.geminiModel,
    ollamaModel: raw.ollamaModel,
    ollamaBaseUrl: raw.ollamaBaseUrl,
    anthropicModel: raw.anthropicModel,
    groqModel: raw.groqModel,
    openrouterModel: raw.openrouterModel,
    hasGeminiKey: geminiKey.trim().length > 0,
    hasAnthropicKey: anthropicKey.trim().length > 0,
    hasGroqKey: groqKey.trim().length > 0,
    hasOpenRouterKey: openrouterKey.trim().length > 0,
    geminiKeyPreview: formatStoredApiKeyPreview(geminiKey),
    anthropicKeyPreview: formatStoredApiKeyPreview(anthropicKey),
    groqKeyPreview: formatStoredApiKeyPreview(groqKey),
    openrouterKeyPreview: formatStoredApiKeyPreview(openrouterKey),
    autoFixMode: raw.autoFixMode,
    agentMode: raw.agentMode,
    backupProvider: raw.backupProvider,
    plannerProvider: raw.plannerProvider,
    plannerModel: raw.plannerModel,
    coderProvider: raw.coderProvider,
    coderModel: raw.coderModel,
    repairProvider: raw.repairProvider,
    repairModel: raw.repairModel,
    maxAiCalls: raw.maxAiCalls,
    maxRepairAttempts: raw.maxRepairAttempts,
    stopOnProviderLimit: raw.stopOnProviderLimit,
    askBeforeFallback: raw.askBeforeFallback,
    fileWriteMode: raw.fileWriteMode,
    plannerMaxOutputTokens: raw.plannerMaxOutputTokens,
    providerEnabled: normalizeProviderEnabled(raw.providerEnabled),
    costMode: raw.costMode,
  };
}

export async function getSettingsView(): Promise<ProviderSettingsView> {
  return sanitize(await loadRawSettings());
}

function isProviderId(value: unknown): value is ProviderId {
  return (
    value === "gemini" ||
    value === "ollama" ||
    value === "anthropic" ||
    value === "groq" ||
    value === "openrouter"
  );
}

/** Strip unknown fields and normalize API key updates from IPC. */
export function sanitizeProviderSettingsInput(
  input: unknown,
): ProviderSettingsInput {
  if (!input || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const out: ProviderSettingsInput = {};
  if (isProviderId(o.provider)) out.provider = o.provider;
  if (typeof o.geminiModel === "string") out.geminiModel = o.geminiModel;
  if (typeof o.ollamaModel === "string") out.ollamaModel = o.ollamaModel;
  if (typeof o.ollamaBaseUrl === "string") {
    const trimmed = o.ollamaBaseUrl.trim();
    if (isAllowedOllamaBaseUrl(trimmed)) out.ollamaBaseUrl = trimmed;
  }
  if (typeof o.anthropicModel === "string") out.anthropicModel = o.anthropicModel;
  if (typeof o.groqModel === "string") out.groqModel = o.groqModel;
  if (typeof o.openrouterModel === "string") out.openrouterModel = o.openrouterModel;
  if ("geminiApiKey" in o && typeof o.geminiApiKey === "string") {
    out.geminiApiKey = o.geminiApiKey;
  }
  if ("anthropicApiKey" in o && typeof o.anthropicApiKey === "string") {
    out.anthropicApiKey = o.anthropicApiKey;
  }
  if ("groqApiKey" in o && typeof o.groqApiKey === "string") {
    out.groqApiKey = o.groqApiKey;
  }
  if ("openrouterApiKey" in o && typeof o.openrouterApiKey === "string") {
    out.openrouterApiKey = o.openrouterApiKey;
  }
  if (o.autoFixMode === "off" || o.autoFixMode === "ask" || o.autoFixMode === "automatic") {
    out.autoFixMode = o.autoFixMode;
  }
  if (o.agentMode === "single" || o.agentMode === "pipeline") {
    out.agentMode = o.agentMode;
  }
  if (o.backupProvider === null) out.backupProvider = null;
  else if (isProviderId(o.backupProvider)) out.backupProvider = o.backupProvider;
  if (isProviderId(o.plannerProvider)) out.plannerProvider = o.plannerProvider;
  if (typeof o.plannerModel === "string") out.plannerModel = o.plannerModel;
  if (isProviderId(o.coderProvider)) out.coderProvider = o.coderProvider;
  if (typeof o.coderModel === "string") out.coderModel = o.coderModel;
  if (isProviderId(o.repairProvider)) out.repairProvider = o.repairProvider;
  if (typeof o.repairModel === "string") out.repairModel = o.repairModel;
  if (typeof o.maxAiCalls === "number") out.maxAiCalls = o.maxAiCalls;
  if (typeof o.maxRepairAttempts === "number") out.maxRepairAttempts = o.maxRepairAttempts;
  if (typeof o.stopOnProviderLimit === "boolean") {
    out.stopOnProviderLimit = o.stopOnProviderLimit;
  }
  if (typeof o.askBeforeFallback === "boolean") {
    out.askBeforeFallback = o.askBeforeFallback;
  }
  if (o.fileWriteMode === "safe" || o.fileWriteMode === "workspace") {
    out.fileWriteMode = o.fileWriteMode;
  }
  if (o.plannerMaxOutputTokens !== undefined) {
    out.plannerMaxOutputTokens = coercePlannerMaxOutputTokens(o.plannerMaxOutputTokens);
  }
  if (o.providerEnabled && typeof o.providerEnabled === "object") {
    const enabled = o.providerEnabled as Record<string, unknown>;
    const patch: Partial<Record<ProviderId, boolean>> = {};
    for (const id of ALL_PROVIDER_IDS) {
      if (typeof enabled[id] === "boolean") patch[id] = enabled[id];
    }
    if (Object.keys(patch).length > 0) out.providerEnabled = patch;
  }
  if (o.costMode === "standard" || o.costMode === "economy") {
    out.costMode = o.costMode;
  }
  return out;
}

export async function saveSettings(
  input: ProviderSettingsInput,
): Promise<ProviderSettingsView> {
  const current = await loadRawSettings();
  const nextProvider = input.provider ?? current.provider;
  const providerChanged =
    input.provider !== undefined && input.provider !== current.provider;
  const explicitStageOverride =
    input.plannerProvider !== undefined ||
    input.coderProvider !== undefined ||
    input.repairProvider !== undefined;
  const syncStagesFromGlobal =
    providerChanged && !explicitStageOverride;
  const next: RawProviderSettings = {
    provider: nextProvider,
    geminiModel: input.geminiModel ?? current.geminiModel,
    ollamaModel: input.ollamaModel ?? current.ollamaModel,
    ollamaBaseUrl: input.ollamaBaseUrl ?? current.ollamaBaseUrl,
    anthropicModel: input.anthropicModel ?? current.anthropicModel,
    groqModel: input.groqModel ?? current.groqModel,
    openrouterModel: input.openrouterModel ?? current.openrouterModel,
    geminiApiKey: resolveApiKeyField(input, "geminiApiKey", current.geminiApiKey),
    anthropicApiKey: resolveApiKeyField(input, "anthropicApiKey", current.anthropicApiKey),
    groqApiKey: resolveApiKeyField(input, "groqApiKey", current.groqApiKey),
    openrouterApiKey: resolveApiKeyField(
      input,
      "openrouterApiKey",
      current.openrouterApiKey,
    ),
    autoFixMode: input.autoFixMode ?? current.autoFixMode,
    agentMode: input.agentMode ?? current.agentMode,
    backupProvider:
      input.backupProvider !== undefined
        ? input.backupProvider
        : current.backupProvider,
    plannerProvider:
      input.plannerProvider ??
      (syncStagesFromGlobal ? nextProvider : current.plannerProvider),
    plannerModel: input.plannerModel ?? current.plannerModel,
    coderProvider:
      input.coderProvider ??
      (syncStagesFromGlobal ? nextProvider : current.coderProvider),
    coderModel: input.coderModel ?? current.coderModel,
    repairProvider:
      input.repairProvider ??
      (syncStagesFromGlobal ? nextProvider : current.repairProvider),
    repairModel: input.repairModel ?? current.repairModel,
    maxAiCalls:
      input.maxAiCalls !== undefined
        ? coercePositiveInt(input.maxAiCalls, current.maxAiCalls)
        : current.maxAiCalls,
    maxRepairAttempts:
      input.maxRepairAttempts !== undefined
        ? coercePositiveInt(input.maxRepairAttempts, current.maxRepairAttempts)
        : current.maxRepairAttempts,
    stopOnProviderLimit:
      input.stopOnProviderLimit ?? current.stopOnProviderLimit,
    askBeforeFallback: input.askBeforeFallback ?? current.askBeforeFallback,
    fileWriteMode: input.fileWriteMode ?? current.fileWriteMode,
    plannerMaxOutputTokens:
      input.plannerMaxOutputTokens !== undefined
        ? coercePlannerMaxOutputTokens(input.plannerMaxOutputTokens)
        : current.plannerMaxOutputTokens,
    providerEnabled:
      input.providerEnabled !== undefined
        ? {
            ...normalizeProviderEnabled(current.providerEnabled),
            ...normalizeProviderEnabled(input.providerEnabled),
          }
        : current.providerEnabled,
    costMode:
      input.costMode !== undefined
        ? coerceCostMode(input.costMode)
        : current.costMode,
  };
  const coerced = coerceRawToEnabledProviders(next);
  const saved = await writeJsonAtomic(settingsFile(), coerced, "filesystem");
  if (!saved.ok) {
    throw new Error(saved.reason ?? "Could not save provider settings.");
  }
  return sanitize(coerced);
}

function readApiKeyFromRaw(raw: RawProviderSettings, provider: ProviderId): string {
  switch (provider) {
    case "gemini":
      return coerceApiKey(raw.geminiApiKey).trim();
    case "anthropic":
      return coerceApiKey(raw.anthropicApiKey).trim();
    case "groq":
      return coerceApiKey(raw.groqApiKey).trim();
    case "openrouter":
      return coerceApiKey(raw.openrouterApiKey).trim();
    default:
      return "";
  }
}

export async function revealApiKey(
  provider: ProviderId,
): Promise<{ ok: boolean; key?: string; error?: string }> {
  if (
    provider !== "gemini" &&
    provider !== "anthropic" &&
    provider !== "groq" &&
    provider !== "openrouter"
  ) {
    return { ok: false, error: "This provider does not use an API key." };
  }
  const raw = await loadRawSettings();
  const key = readApiKeyFromRaw(raw, provider);
  if (!key) {
    return { ok: false, error: "No API key stored." };
  }
  return { ok: true, key };
}
