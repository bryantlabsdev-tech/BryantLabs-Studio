import { aiPlanFailureTitle } from "@/core/planner/aiPlanSchema";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import {
  formatPlannerPreflightDiagnostics,
  preflightGateUserMessage,
  readPreflightDiagnostics,
  readPreflightGate,
  type PlannerPreflightGate,
} from "@/core/planner/plannerPreflight";

const RAW_TEXT_MAX = 1000;

export function truncatePlannerRawText(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed.length <= RAW_TEXT_MAX) return trimmed;
  return `${trimmed.slice(0, RAW_TEXT_MAX)}…`;
}

function formatPlannerStoppedBeforeProviderMessage(input: {
  readonly gate: PlannerPreflightGate | null;
  readonly gateDetail: string | null;
  readonly preflight: ReturnType<typeof readPreflightDiagnostics>;
  readonly planFileCount: number | null;
}): string {
  const gateLabel = input.gate
    ? preflightGateUserMessage(input.gate, input.gateDetail)
    : "unknown gate";
  const fallbackUsed = input.preflight?.fallbackUsed === true;
  const fallbackStatus = fallbackUsed ? "used" : "not used";
  const fallbackReason = fallbackUsed
    ? "deterministic plan applied"
    : input.preflight?.fallbackNotUsedReason ??
      (input.planFileCount === 0 ? "no editable files" : "not eligible");
  return `Planner stopped before provider response: ${gateLabel}. Fallback ${fallbackStatus}: ${fallbackReason}.`;
}

export function formatFollowUpPlannerFailureMessage(input: {
  readonly aiPlan: AIPlanResult | null;
  readonly createPlanError?: string | null;
  readonly planFileCount?: number;
  readonly preflightGate?: string | null;
  readonly preflightMessage?: string | null;
  readonly route?: string | null;
  readonly prompt?: string | null;
}): string {
  if (input.createPlanError?.trim()) return input.createPlanError.trim();

  const plan = input.aiPlan;
  const preflight = readPreflightDiagnostics(plan);
  const gate =
    readPreflightGate(plan) ??
    (input.preflightGate as PlannerPreflightGate | null) ??
    preflight?.gate ??
    null;

  if (gate && !plan?.ok && (preflight?.providerCallAttempted === false || gate !== "provider_request_failed")) {
    if (
      gate === "provider_not_connected" ||
      gate === "budget_exceeded" ||
      gate === "plan_missing" ||
      gate === "host_unavailable" ||
      gate === "provider_routing_missing" ||
      gate === "no_editable_files"
    ) {
      return formatPlannerStoppedBeforeProviderMessage({
        gate,
        gateDetail: plan?.error ?? input.preflightMessage ?? preflight?.providerBlockedReason ?? null,
        preflight,
        planFileCount: input.planFileCount ?? preflight?.editableFilesCount ?? null,
      });
    }
    return preflightGateUserMessage(
      gate,
      plan?.error ?? input.preflightMessage ?? preflight?.skipReason,
    );
  }

  if (!plan) {
    if (input.planFileCount === 0) return "No editable files found.";
    return formatPlannerStoppedBeforeProviderMessage({
      gate: (input.preflightGate as PlannerPreflightGate | null) ?? null,
      gateDetail: input.preflightMessage ?? null,
      preflight: null,
      planFileCount: input.planFileCount ?? null,
    });
  }

  if (plan.error) {
    if (/timed out/i.test(plan.error)) return "Planner timed out.";
    if (/budget exceeded|cancelled/i.test(plan.error)) {
      return `Provider request failed: ${plan.error}`;
    }
  }

  switch (plan.parseFailReason) {
    case "empty_response":
      return plan.error?.trim() || "Gemini returned an empty response.";
    case "no_json":
      return "Provider returned no JSON plan.";
    case "schema_validation":
      return "Provider JSON schema validation failed.";
    case "json_syntax":
      return "Provider returned invalid JSON.";
    case "truncated":
      return "Provider response was truncated.";
    default:
      break;
  }

  if (plan.parseError) {
    if (/no json/i.test(plan.parseError)) return "Provider returned no JSON plan.";
    if (/schema/i.test(plan.parseError)) {
      return "Provider JSON schema validation failed.";
    }
    return plan.parseError;
  }

  const title = aiPlanFailureTitle(plan.parseFailReason, plan.error);
  if (title === "No JSON Returned") return "Provider returned no JSON plan.";
  if (title === "Schema Validation Failed") {
    return "Provider JSON schema validation failed.";
  }
  if (title === "Invalid JSON") return "Provider returned invalid JSON.";
  if (title === "Response Truncated") return "Provider response was truncated.";

  if (plan.error) return `Provider request failed: ${plan.error}`;

  if (input.planFileCount === 0) return "No editable files found.";

  return "AI plan failed.";
}

export function formatAiPlanPlannerDiagnostics(aiPlan: AIPlanResult | null): string {
  const preflight = readPreflightDiagnostics(aiPlan);
  if (preflight) {
    return formatPlannerPreflightDiagnostics(preflight);
  }
  if (!aiPlan) return "";
  const lines: string[] = [];
  if (aiPlan.parseFailReason && aiPlan.parseFailReason !== "none") {
    lines.push(`parseFailReason: ${aiPlan.parseFailReason}`);
  }
  if (aiPlan.parseError) lines.push(`parseError: ${aiPlan.parseError}`);
  if (aiPlan.error && aiPlan.error !== aiPlan.parseError) {
    lines.push(`error: ${aiPlan.error}`);
  }

  const diag = aiPlan.providerDiagnostics;
  const telemetry = aiPlan.telemetry;
  const responseLength =
    diag?.responseLength ??
    (aiPlan.rawText?.length ?? 0);
  lines.push(`responseLength: ${responseLength}`);
  lines.push(
    `candidateCount: ${diag?.candidateCount ?? (aiPlan.rawText?.trim() ? 1 : 0)}`,
  );
  if (diag?.finishReason) lines.push(`finishReason: ${diag.finishReason}`);
  lines.push(`safetyBlocked: ${diag?.safetyBlocked === true ? "true" : "false"}`);
  lines.push(
    `repairAttempted: ${diag?.repairAttempted ?? telemetry?.repair_attempted ?? false}`,
  );
  lines.push(
    `repairSucceeded: ${diag?.repairSucceeded ?? telemetry?.repair_success ?? false}`,
  );
  if (diag?.repairSkippedReason) {
    lines.push(`repairSkippedReason: ${diag.repairSkippedReason}`);
  }
  if (diag?.providerHttpStatus != null) {
    lines.push(`providerHttpStatus: ${diag.providerHttpStatus}`);
  }
  if (diag?.providerRequestId) lines.push(`providerRequestId: ${diag.providerRequestId}`);
  if (diag?.providerLatency != null) lines.push(`providerLatency: ${diag.providerLatency}`);
  if (diag?.providerModel) lines.push(`providerModel: ${diag.providerModel}`);
  if (diag?.providerEndpoint) lines.push(`providerEndpoint: ${diag.providerEndpoint}`);
  if (diag?.generateMethod) lines.push(`generateMethod: ${diag.generateMethod}`);
  if (diag?.requestPayloadBytes != null) {
    lines.push(`requestPayloadBytes: ${diag.requestPayloadBytes}`);
  }
  if (diag?.maxOutputTokens != null) {
    lines.push(`maxOutputTokens: ${diag.maxOutputTokens}`);
  }
  if (diag?.thoughtsTokenCount != null) {
    lines.push(`thoughtsTokenCount: ${diag.thoughtsTokenCount}`);
  }
  if (diag?.candidatesTokenCount != null) {
    lines.push(`candidatesTokenCount: ${diag.candidatesTokenCount}`);
  }
  if (diag?.tokenStarvationLikely != null) {
    lines.push(`tokenStarvationLikely: ${diag.tokenStarvationLikely}`);
  }
  if (diag?.tokenBudgetHint) {
    lines.push(`tokenBudgetHint: ${diag.tokenBudgetHint}`);
  }
  if (diag?.usageMetadata) lines.push(`usageMetadata: ${diag.usageMetadata}`);
  if (diag?.responseHeaders) lines.push(`responseHeaders: ${diag.responseHeaders}`);
  if (diag?.rawGeminiResponse) lines.push(`rawGeminiResponse: ${diag.rawGeminiResponse}`);

  const raw =
    diag?.rawResponsePreview ??
    truncatePlannerRawText(aiPlan.rawText);
  if (raw) lines.push(`rawResponsePreview: ${raw}`);
  if (diag?.providerMetadata) {
    lines.push(`providerMetadata: ${diag.providerMetadata}`);
  }
  // Legacy key — same preview for log parsers that read rawResponse
  if (raw) lines.push(`rawResponse: ${raw}`);

  lines.push(`deterministicFallback: ${describeDeterministicFallbackStatus(aiPlan)}`);
  return lines.join("\n");
}

export function describeDeterministicFallbackStatus(aiPlan: AIPlanResult | null): string {
  if (!aiPlan) return "not attempted";
  const preflight = readPreflightDiagnostics(aiPlan);
  if (preflight?.fallbackUsed) return "used";
  if (preflight?.fallbackAttempted && !preflight.fallbackUsed) {
    return `not used (${preflight.fallbackNotUsedReason ?? "not eligible"})`;
  }
  if (usedDeterministicPlanFallback(aiPlan)) {
    return `used (${aiPlan.parseFailReason ?? aiPlan.parseError ?? "parse failed"})`;
  }
  if (aiPlan.ok) return "not needed";
  return "not used";
}

export function usedDeterministicPlanFallback(aiPlan: AIPlanResult): boolean {
  if (!aiPlan.ok) return false;
  const raw = aiPlan.raw;
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as { source?: string }).source === "deterministic_fallback"
  );
}
