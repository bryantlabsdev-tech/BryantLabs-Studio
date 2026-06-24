import type { AIPlanResult, AIPlanParseFailReason } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { ProviderId } from "@/core/providers/types";
import { isUiOnlyFollowUpPrompt } from "@/core/planner/promptClassification";

export { canUseDeterministicPlanWithoutProviderCall } from "@/core/planner/plannerPreflight";

const RETRIABLE_PARSE_FAIL_REASONS = new Set<AIPlanParseFailReason>([
  "no_json",
  "empty_response",
  "json_syntax",
  "schema_validation",
  "truncated",
]);

const FALLBACK_PARSE_ERRORS = [
  /no json/i,
  /json_syntax/i,
  /schema_validation/i,
  /truncated/i,
  /planning timed out/i,
];

function isRetriablePlannerParseFailure(result: AIPlanResult): boolean {
  if (result.parseFailReason && RETRIABLE_PARSE_FAIL_REASONS.has(result.parseFailReason)) {
    return true;
  }
  const haystack = `${result.error ?? ""}\n${result.parseError ?? ""}`;
  if (!haystack.trim()) return true;
  return FALLBACK_PARSE_ERRORS.some((re) => re.test(haystack));
}

/** Whether a failed AI plan can fall back to the deterministic plan for apply. */
export function canUseDeterministicPlanFallback(
  userPrompt: string,
  plan: Plan,
  result: AIPlanResult,
): boolean {
  if (result.ok) return false;
  if (!isUiOnlyFollowUpPrompt(userPrompt)) return false;
  if (plan.files.length === 0) return false;
  return isRetriablePlannerParseFailure(result);
}

/** Synthetic AI plan that mirrors the deterministic plan for UI-only apply. */
export function buildDeterministicAiPlanFallback(
  userPrompt: string,
  plan: Plan,
  provider: ProviderId,
  model: string,
  failedResult: AIPlanResult,
): AIPlanResult {
  return {
    ok: true,
    provider,
    model,
    plan: {
      summary: plan.summary,
      files: plan.files.map((f) => ({
        path: f.path,
        reason: f.reasons.join("; ") || "Listed in deterministic plan",
      })),
      reasoning: `Deterministic plan fallback after AI planner failure (${failedResult.parseError ?? failedResult.error ?? "unknown"}).`,
      risks: [],
      confidence: plan.confidence,
    },
    raw: { source: "deterministic_fallback", prompt: userPrompt },
    latencyMs: failedResult.latencyMs,
    ...(failedResult.telemetry ? { telemetry: failedResult.telemetry } : {}),
  };
}
