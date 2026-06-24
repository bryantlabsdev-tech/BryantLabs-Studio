import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { ProviderId } from "@/core/providers/types";
import {
  classifyFollowUpPromptType,
  isUiOnlyFollowUpPrompt,
} from "@/core/planner/promptClassification";
import { isFunctionalFeaturePrompt } from "@/core/planner/fallback";

export type PlannerPreflightGate =
  | "host_unavailable"
  | "plan_missing"
  | "prompt_validation"
  | "provider_routing_missing"
  | "provider_not_connected"
  | "budget_exceeded"
  | "provider_request_failed"
  | "no_editable_files"
  | "deterministic_fallback_unavailable";

export type FallbackNotUsedReason =
  | "no editable files"
  | "unsupported route"
  | "prompt not UI-only"
  | "connection gate blocked and fallback disabled"
  | "target resolution failed";

export interface PlannerPreflightDiagnostics {
  readonly gate: PlannerPreflightGate | null;
  readonly providerCallAttempted: boolean;
  readonly providerBlockedReason: string | null;
  readonly skipReason: string | null;
  readonly route: string | null;
  readonly editableFilesCount: number;
  readonly targetFilesCount: number;
  readonly fallbackEligible: boolean;
  readonly fallbackAttempted: boolean;
  readonly fallbackUsed: boolean;
  readonly fallbackNotUsedReason: FallbackNotUsedReason | null;
  readonly promptClassification: string;
  readonly message: string | null;
}

export interface BuildPlannerPreflightInput {
  readonly userPrompt: string | null;
  readonly plan: Plan | null;
  readonly route?: string | null;
  readonly gate?: PlannerPreflightGate | null;
  readonly providerCallAttempted?: boolean;
  readonly providerBlockedReason?: string | null;
  readonly skipReason?: string | null;
  readonly message?: string | null;
  readonly fallbackAttempted?: boolean;
  readonly fallbackUsed?: boolean;
  readonly fallbackNotUsedReason?: FallbackNotUsedReason | null;
}

const PROVIDER_BLOCK_GATES = new Set<PlannerPreflightGate>([
  "provider_not_connected",
  "budget_exceeded",
  "provider_routing_missing",
]);

export function resolveFallbackNotUsedReason(input: {
  readonly userPrompt: string | null;
  readonly plan: Plan | null;
  readonly route: string | null;
  readonly gate: PlannerPreflightGate | null;
}): FallbackNotUsedReason | null {
  const prompt = input.userPrompt?.trim() ?? "";
  const fileCount = input.plan?.files.length ?? 0;
  if (fileCount === 0) return "no editable files";
  if (input.route && input.route !== "edit_follow_up") return "unsupported route";
  if (!prompt || !isUiOnlyFollowUpPrompt(prompt)) return "prompt not UI-only";
  if (
    input.gate &&
    PROVIDER_BLOCK_GATES.has(input.gate) &&
    !canUseDeterministicPlanWithoutProviderCall(prompt, input.plan!, input.route)
  ) {
    return "connection gate blocked and fallback disabled";
  }
  if (!canUseDeterministicPlanWithoutProviderCall(prompt, input.plan!, input.route)) {
    return "target resolution failed";
  }
  return null;
}

export function buildPlannerPreflightDiagnostics(
  input: BuildPlannerPreflightInput,
): PlannerPreflightDiagnostics {
  const prompt = input.userPrompt?.trim() ?? "";
  const editableFilesCount = input.plan?.files.length ?? 0;
  const route = input.route ?? null;
  const gate = input.gate ?? null;
  const fallbackEligible =
    prompt.length > 0 &&
    input.plan != null &&
    canUseDeterministicPlanWithoutProviderCall(prompt, input.plan, route);
  const fallbackNotUsedReason =
    input.fallbackNotUsedReason ??
    (input.fallbackUsed
      ? null
      : resolveFallbackNotUsedReason({
          userPrompt: prompt,
          plan: input.plan,
          route,
          gate,
        }));
  const providerBlockedReason =
    input.providerBlockedReason ??
    (gate && PROVIDER_BLOCK_GATES.has(gate)
      ? (input.skipReason ?? input.message ?? null)
      : null);

  return {
    gate,
    providerCallAttempted: input.providerCallAttempted ?? false,
    providerBlockedReason,
    skipReason: input.skipReason ?? input.message ?? null,
    route,
    editableFilesCount,
    targetFilesCount: editableFilesCount,
    fallbackEligible,
    fallbackAttempted: input.fallbackAttempted ?? false,
    fallbackUsed: input.fallbackUsed ?? false,
    fallbackNotUsedReason,
    promptClassification: prompt ? classifyFollowUpPromptType(prompt) : "general",
    message: input.message ?? null,
  };
}

export function preflightGateUserMessage(
  gate: PlannerPreflightGate,
  detail?: string | null,
): string {
  switch (gate) {
    case "host_unavailable":
      return "Planner host unavailable (API, scan, or plan missing).";
    case "plan_missing":
      return "No deterministic plan available for this prompt.";
    case "prompt_validation":
      return "Prompt failed validation.";
    case "provider_routing_missing":
      return "No provider routing configured for the planner stage.";
    case "provider_not_connected":
      return detail?.trim() || "Provider not connected.";
    case "budget_exceeded":
      return detail?.trim() || "Budget gate blocked planner call.";
    case "provider_request_failed":
      return detail?.trim() || "Provider request failed.";
    case "no_editable_files":
      return "No editable files found.";
    case "deterministic_fallback_unavailable":
      return detail?.trim() || "Deterministic fallback unavailable for this prompt.";
    default:
      return detail?.trim() || "Planner preflight blocked.";
  }
}

export function readPreflightGate(aiPlan: AIPlanResult | null): PlannerPreflightGate | null {
  const raw = aiPlan?.raw;
  if (typeof raw !== "object" || raw === null) return null;
  const gate = (raw as { preflightGate?: PlannerPreflightGate }).preflightGate;
  return gate ?? null;
}

export function readPreflightDiagnostics(
  aiPlan: AIPlanResult | null,
): PlannerPreflightDiagnostics | null {
  const raw = aiPlan?.raw;
  if (typeof raw !== "object" || raw === null) return null;
  const diagnostics = (raw as { preflight?: PlannerPreflightDiagnostics }).preflight;
  return diagnostics ?? null;
}

export function buildBlockedPlannerResult(input: {
  readonly gate: PlannerPreflightGate;
  readonly message: string;
  readonly provider: ProviderId;
  readonly model: string;
  readonly preflight: PlannerPreflightDiagnostics;
  readonly providerCallAttempted?: boolean;
}): AIPlanResult {
  return {
    ok: false,
    provider: input.provider,
    model: input.model,
    raw: {
      preflightGate: input.gate,
      preflight: {
        ...input.preflight,
        gate: input.gate,
        providerCallAttempted: input.providerCallAttempted ?? false,
        message: input.message,
      },
    },
    latencyMs: 0,
    error: input.message,
  };
}

/** UI-only follow-ups may skip provider when a deterministic plan already has targets. */
export function canUseDeterministicPlanWithoutProviderCall(
  userPrompt: string,
  plan: Plan,
  route?: string | null,
): boolean {
  if (route && route !== "edit_follow_up") return false;
  if (!isUiOnlyFollowUpPrompt(userPrompt) && !isFunctionalFeaturePrompt(userPrompt.toLowerCase())) {
    return false;
  }
  return plan.files.length > 0;
}

export function formatPlannerPreflightDiagnostics(
  preflight: PlannerPreflightDiagnostics | null,
): string {
  if (!preflight) return "";
  const lines = [
    `preflightGate: ${preflight.gate ?? "none"}`,
    `providerCallAttempted: ${preflight.providerCallAttempted}`,
    `providerBlockedReason: ${preflight.providerBlockedReason ?? "—"}`,
    `skipReason: ${preflight.skipReason ?? "—"}`,
    `route: ${preflight.route ?? "—"}`,
    `editableFiles: ${preflight.editableFilesCount}`,
    `targetFiles: ${preflight.targetFilesCount}`,
    `fallbackEligible: ${preflight.fallbackEligible}`,
    `fallbackAttempted: ${preflight.fallbackAttempted}`,
    `fallbackUsed: ${preflight.fallbackUsed}`,
    `fallbackNotUsedReason: ${preflight.fallbackNotUsedReason ?? "—"}`,
    `promptClassification: ${preflight.promptClassification}`,
  ];
  return lines.join("\n");
}

export function parsePlannerPreflightFromLogDetails(
  details: string,
): PlannerPreflightDiagnostics | null {
  const trimmed = details.trim();
  if (!trimmed) return null;

  const values = new Map<string, string>();
  for (const line of trimmed.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx < 0) continue;
    values.set(line.slice(0, idx).trim(), line.slice(idx + 2).trim());
  }

  if (!values.has("preflightGate") && !values.has("fallbackEligible")) return null;

  const readBool = (key: string): boolean => values.get(key) === "true";
  const readCount = (primary: string, fallback: string): number => {
    const raw = values.get(primary) ?? values.get(fallback) ?? "0";
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const readOptional = (key: string): string | null => {
    const value = values.get(key);
    if (!value || value === "—") return null;
    return value;
  };

  const gateRaw = values.get("preflightGate");
  const gate =
    gateRaw && gateRaw !== "none" ? (gateRaw as PlannerPreflightGate) : null;
  const fallbackNotUsedRaw = readOptional("fallbackNotUsedReason");

  return {
    gate,
    providerCallAttempted: readBool("providerCallAttempted"),
    providerBlockedReason: readOptional("providerBlockedReason"),
    skipReason: readOptional("skipReason"),
    route: readOptional("route"),
    editableFilesCount: readCount("editableFilesCount", "editableFiles"),
    targetFilesCount: readCount("targetFilesCount", "targetFiles"),
    fallbackEligible: readBool("fallbackEligible"),
    fallbackAttempted: readBool("fallbackAttempted"),
    fallbackUsed: readBool("fallbackUsed"),
    fallbackNotUsedReason: fallbackNotUsedRaw as FallbackNotUsedReason | null,
    promptClassification: values.get("promptClassification") ?? "general",
    message: readOptional("skipReason"),
  };
}
