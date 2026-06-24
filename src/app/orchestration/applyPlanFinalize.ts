import {
  agentWorkspaceAfterApplyPlanSuccess,
  agentLoopSessionAfterApplyPlanSuccess,
  executionSessionAfterApplyPlanSuccess,
  isApplyPlanOrchestrationComplete,
  type ApplyPlanSuccessOutcome,
} from "@/core/orchestration/applyPlanSuccess";
import type { VerificationResult } from "@/types";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";

export function finalizeOrchestrationAfterApplyPlan(
  host: ApplyPlanOrchestrationHost,
  outcome: ApplyPlanSuccessOutcome,
  finalVerification: VerificationResult | null,
): void {
  if (!isApplyPlanOrchestrationComplete(outcome)) return;

  host.applyPlanSuccessRef.current = outcome;
  host.executionNoChangeGuardRef.current.clear();
  host.agentControlRef.current.stopped = true;

  host.setAgentLoopSession((prev) =>
    prev && prev.status !== "completed" && prev.status !== "stopped"
      ? agentLoopSessionAfterApplyPlanSuccess(prev, outcome)
      : prev,
  );

  host.setExecutionSession((prev) =>
    prev &&
    (prev.phase === "running" ||
      prev.phase === "paused" ||
      prev.phase === "verifying" ||
      prev.phase === "ready")
      ? {
          ...executionSessionAfterApplyPlanSuccess(prev, outcome.filesWritten),
          verification: finalVerification ?? prev.verification,
        }
      : prev,
  );

  host.pushAgent((s) => agentWorkspaceAfterApplyPlanSuccess(s, outcome));

  host.appendGreenfieldRunLog(
    "multi_file_execution",
    "success",
    "Stopped — changes already applied via Apply Plan",
    {
      details: outcome.filesWritten.join(", "),
      failureRole: "skipped",
    },
  );
}
