import { getProviderInfo } from "@/core/providers/registry";
import {
  COST_MODE_DEFAULT,
  economyModelForStage,
  formatEconomyRoutingHint,
  isEconomyMode,
} from "@/core/providers/economyModels";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import {
  effectiveProviderId,
  formatProviderEnablementRoutingLog,
  normalizeProviderEnabled,
  coerceSettingsToEnabledProviders,
} from "@/core/providers/providerEnablement";
import type {
  AgentMode,
  FileWriteMode,
  ProviderId,
  ProviderSettings,
} from "@/core/providers/types";
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "@/core/providers/providerModels";

export type AgentStage = "planner" | "coder" | "repair" | "verifier" | "greenfield";

export interface StageRouting {
  readonly stage: AgentStage;
  readonly provider: ProviderId;
  readonly model: string;
}

export const AGENT_MODE_DEFAULT: AgentMode = "single";
export const MAX_AI_CALLS_DEFAULT = 8;
export const MAX_REPAIR_ATTEMPTS_DEFAULT = 3;
export const MIN_PLANNER_MAX_OUTPUT_TOKENS = 1024;
export const DEFAULT_PLANNER_MAX_OUTPUT_TOKENS = 8192;
export const MAX_PLANNER_MAX_OUTPUT_TOKENS = 16384;

export function coercePlannerMaxOutputTokens(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PLANNER_MAX_OUTPUT_TOKENS;
  }
  const n = Math.floor(value);
  if (n < MIN_PLANNER_MAX_OUTPUT_TOKENS) return MIN_PLANNER_MAX_OUTPUT_TOKENS;
  if (n > MAX_PLANNER_MAX_OUTPUT_TOKENS) return MAX_PLANNER_MAX_OUTPUT_TOKENS;
  return n;
}

export function isPipelineMode(settings: ProviderSettings): boolean {
  return settings.agentMode === "pipeline";
}

function stageProvider(settings: ProviderSettings, stage: AgentStage): ProviderId {
  if (stage === "verifier") return effectiveProviderId(settings, settings.provider);
  if (stage === "greenfield") return effectiveProviderId(settings, settings.provider);
  switch (stage) {
    case "planner":
      return effectiveProviderId(
        settings,
        settings.plannerProvider ?? settings.provider,
      );
    case "coder":
      return effectiveProviderId(settings, settings.coderProvider ?? settings.provider);
    case "repair":
      return effectiveProviderId(settings, settings.repairProvider ?? settings.provider);
    default:
      return effectiveProviderId(settings, settings.provider);
  }
}

function stageModel(settings: ProviderSettings, stage: AgentStage): string {
  if (stage === "verifier") return "local";
  if (stage === "greenfield") {
    return modelForProvider(settings, settings.provider);
  }
  let override = "";
  switch (stage) {
    case "planner":
      override = settings.plannerModel ?? "";
      break;
    case "coder":
      override = settings.coderModel ?? "";
      break;
    case "repair":
      override = settings.repairModel ?? "";
      break;
  }
  if (override.trim()) return override.trim();
  return modelForProvider(settings, stageProvider(settings, stage));
}

/** Resolve provider + model for an agent stage. Verifier is always local (no AI). */
export function resolveStageRouting(
  settings: ProviderSettings,
  stage: AgentStage,
): StageRouting | null {
  if (stage === "verifier") {
    return { stage, provider: effectiveProviderId(settings, settings.provider), model: "local" };
  }
  if (stage === "greenfield") {
    const provider = effectiveProviderId(settings, settings.provider);
    return {
      stage,
      provider,
      model: modelForProvider(settings, provider),
    };
  }
  if (!isPipelineMode(settings)) {
    const provider = effectiveProviderId(settings, settings.provider);
    const economyModel = economyModelForStage(settings, stage, provider);
    if (economyModel) {
      return { stage, provider, model: economyModel };
    }
    return {
      stage,
      provider,
      model: modelForProvider(settings, provider),
    };
  }
  const provider = stageProvider(settings, stage);
  const economyModel = economyModelForStage(settings, stage, provider);
  return {
    stage,
    provider,
    model: economyModel ?? stageModel(settings, stage),
  };
}

export function operationToStage(
  operation:
    | "ai_plan"
    | "apply_plan"
    | "ai_patch"
    | "agent"
    | "auto_fix"
    | "pipeline_planner"
    | "pipeline_coder"
    | "pipeline_repair",
): AgentStage {
  switch (operation) {
    case "ai_plan":
    case "agent":
    case "pipeline_planner":
      return "planner";
    case "apply_plan":
    case "ai_patch":
    case "pipeline_coder":
      return "coder";
    case "auto_fix":
    case "pipeline_repair":
      return "repair";
    default:
      return "coder";
  }
}

export function providerShortLabel(provider: ProviderId): string {
  return getProviderInfo(provider).label.replace(/\s*\(.*\)$/, "");
}

export function formatStageRoutingLine(routing: StageRouting): string {
  if (routing.stage === "verifier") return "Verifier: Local";
  return `${capitalize(routing.stage)}: ${providerShortLabel(routing.provider)} · ${routing.model}`;
}

export function formatPipelinePillText(settings: ProviderSettings): string {
  const planner = resolveStageRouting(settings, "planner");
  const coder = resolveStageRouting(settings, "coder");
  const repair = resolveStageRouting(settings, "repair");
  if (!planner || !coder || !repair) return "Pipeline";
  return [
    `Planner ${providerShortLabel(planner.provider)}`,
    `Coder ${providerShortLabel(coder.provider)}`,
    `Repair ${providerShortLabel(repair.provider)}`,
  ].join(" · ");
}

export function formatSingleAgentPillText(settings: ProviderSettings): string {
  const model = modelForProvider(settings, settings.provider).trim();
  const label = providerShortLabel(settings.provider);
  return model ? `${label} · ${model}` : label;
}

export function formatProviderRoutingSummary(settings: ProviderSettings): string {
  const enablement = formatProviderEnablementRoutingLog(settings);
  const economyHint = formatEconomyRoutingHint(settings);
  if (!isPipelineMode(settings)) {
    const planner = resolveStageRouting(settings, "planner");
    const coder = isEconomyMode(settings) ? resolveStageRouting(settings, "coder") : null;
    const route = planner
      ? economyHint ??
        `Single agent · ${providerShortLabel(planner.provider)} · ${planner.model}`
      : "Single agent";
    if (economyHint && coder) {
      return `${route}\nCoder/Repair: ${providerShortLabel(coder.provider)} · ${coder.model}\n${enablement}`;
    }
    return `${route}\n${enablement}`;
  }
  return [
    formatStageRoutingLine(resolveStageRouting(settings, "planner")!),
    formatStageRoutingLine(resolveStageRouting(settings, "coder")!),
    formatStageRoutingLine(resolveStageRouting(settings, "repair")!),
    "Verifier: Local",
    enablement,
  ].join("\n");
}

export type WorkflowEstimateKind =
  | "ai_plan"
  | "apply_plan"
  | "ai_patch"
  | "agent"
  | "auto_fix";

/** Rough minimum AI calls for a workflow (before file-count scaling). */
export function estimateAiCalls(
  settings: ProviderSettings,
  workflow: WorkflowEstimateKind,
  opts?: { fileCount?: number; repairEnabled?: boolean },
): number {
  const files = Math.max(1, opts?.fileCount ?? 1);
  switch (workflow) {
    case "ai_plan":
    case "agent":
      return 1;
    case "ai_patch":
      return 1;
    case "apply_plan":
      return Math.min(files, 3);
    case "auto_fix":
      return opts?.repairEnabled
        ? Math.min(settings.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS_DEFAULT, files)
        : 0;
    default:
      return 1;
  }
}

export function formatFallbackPolicy(settings: ProviderSettings): string {
  const parts = [
    `Max AI calls: ${settings.maxAiCalls ?? MAX_AI_CALLS_DEFAULT}`,
    `Max repair attempts: ${settings.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS_DEFAULT}`,
  ];
  if (settings.stopOnProviderLimit !== false) {
    parts.push("Stop on rate limit / insufficient credits");
  }
  parts.push(
    settings.askBeforeFallback !== false
      ? "Ask before fallback provider"
      : "No fallback prompts",
  );
  return parts.join(" · ");
}

export function buildContextOrchestrationSection(
  settings: ProviderSettings,
  opts?: {
    stage?: AgentStage | null;
    estimatedAiCalls?: number | null;
    providerHealthAtStart?: Readonly<Partial<Record<ProviderId, string>>>;
    providerFailureSummary?: string | null;
  },
): import("@/core/contextInspector/types").ContextOrchestrationSection {
  const stage = opts?.stage ?? null;
  return {
    agentMode: settings.agentMode ?? AGENT_MODE_DEFAULT,
    stage,
    routingSummary: formatProviderRoutingSummary(settings),
    estimatedAiCalls: opts?.estimatedAiCalls ?? null,
    maxRepairAttempts: settings.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS_DEFAULT,
    fallbackPolicy: formatFallbackPolicy(settings),
    ...(opts?.providerHealthAtStart
      ? { providerHealthAtStart: opts.providerHealthAtStart }
      : {}),
    ...(opts?.providerFailureSummary != null
      ? { providerFailureSummary: opts.providerFailureSummary }
      : {}),
    providerEnablementSummary: formatProviderEnablementRoutingLog(settings),
  };
}

export function patchStageProvider(
  stage: Exclude<AgentStage, "verifier" | "greenfield">,
  provider: ProviderId,
): Partial<ProviderSettings> {
  switch (stage) {
    case "planner":
      return { plannerProvider: provider };
    case "coder":
      return { coderProvider: provider };
    case "repair":
      return { repairProvider: provider };
  }
}

export function patchStageModel(
  stage: Exclude<AgentStage, "verifier" | "greenfield">,
  model: string,
): Partial<ProviderSettings> {
  switch (stage) {
    case "planner":
      return { plannerModel: model };
    case "coder":
      return { coderModel: model };
    case "repair":
      return { repairModel: model };
  }
}

export function stageModelValue(
  settings: ProviderSettings,
  stage: Exclude<AgentStage, "verifier" | "greenfield">,
): string {
  switch (stage) {
    case "planner":
      return settings.plannerModel ?? "";
    case "coder":
      return settings.coderModel ?? "";
    case "repair":
      return settings.repairModel ?? "";
  }
}

/** Fill orchestration defaults for settings loaded before Phase 22.5. */
export function normalizeProviderSettings(
  settings: ProviderSettings,
): ProviderSettings {
  const normalized: ProviderSettings = {
    ...settings,
    groqModel: settings.groqModel ?? DEFAULT_GROQ_MODEL,
    openrouterModel: settings.openrouterModel ?? DEFAULT_OPENROUTER_MODEL,
    hasGroqKey: settings.hasGroqKey ?? false,
    hasOpenRouterKey: settings.hasOpenRouterKey ?? false,
    agentMode: settings.agentMode ?? AGENT_MODE_DEFAULT,
    backupProvider: settings.backupProvider ?? null,
    plannerProvider: settings.plannerProvider ?? settings.provider,
    plannerModel: settings.plannerModel ?? "",
    coderProvider: settings.coderProvider ?? settings.provider,
    coderModel: settings.coderModel ?? "",
    repairProvider: settings.repairProvider ?? settings.provider,
    repairModel: settings.repairModel ?? "",
    maxAiCalls: settings.maxAiCalls ?? MAX_AI_CALLS_DEFAULT,
    maxRepairAttempts: settings.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS_DEFAULT,
    stopOnProviderLimit: settings.stopOnProviderLimit ?? true,
    askBeforeFallback: settings.askBeforeFallback ?? true,
    fileWriteMode: (settings.fileWriteMode ?? "workspace") as FileWriteMode,
    plannerMaxOutputTokens: coercePlannerMaxOutputTokens(settings.plannerMaxOutputTokens),
    providerEnabled: normalizeProviderEnabled(settings.providerEnabled),
    costMode: settings.costMode ?? COST_MODE_DEFAULT,
  };
  return coerceSettingsToEnabledProviders(normalized).settings;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
