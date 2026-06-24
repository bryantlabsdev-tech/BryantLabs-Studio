import type { ExecuteApplyPlanResult } from "@/app/orchestration/applyPlan";

export function formatApplyContinuationFailure(input: {
  readonly applyResult: ExecuteApplyPlanResult;
  readonly planFileCount: number;
  readonly autoContinue: boolean;
}): string | null {
  const { applyResult, planFileCount, autoContinue } = input;
  if (applyResult.waitingForReview) return null;
  if (applyResult.validReady > 0) return null;
  if (applyResult.error?.trim()) return applyResult.error.trim();
  if (planFileCount === 0) return "No editable files in plan to apply.";
  if (autoContinue && applyResult.autoContinued && applyResult.applyOk === false) {
    return "Apply continued after planning but failed before writing files.";
  }
  if (!autoContinue) {
    return "Apply paused for review, but no patch proposals were generated.";
  }
  return `Apply did not start after planning (${planFileCount} file(s) in plan). Plan or AI plan state was not ready for apply.`;
}
