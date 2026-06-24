import type { DeriveAgentRunStateInput } from "@/core/agent/deriveAgentRunState";
import { isRunTerminal } from "@/core/agent/runTerminal";
import { resolveAllowGeneratedFileDiffs } from "@/core/agent/runFileDiffs";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { PlanApplySession } from "@/core/planApply/types";

function followUpRunInProgress(run: GreenfieldRunSnapshot): boolean {
  const route = run.runTimeline?.route ?? "";
  if (route === "edit_follow_up" || route === "pipeline") {
    if (run.runTimeline?.status === "running") return true;
    if (
      run.runResult === "running" &&
      !run.runTimeline?.stages.some((stage) => stage.stage === "run_complete")
    ) {
      return true;
    }
  }
  return false;
}

function hasPlanApplyDiffs(session: PlanApplySession | null | undefined): boolean {
  if (!session) return false;
  return session.files.some(
    (file) =>
      file.relPath &&
      (file.diffStats?.changed ||
        file.status === "ready" ||
        file.status === "proposing"),
  );
}

export function hasArtifactFileDiffSource(stateInput: DeriveAgentRunStateInput): boolean {
  if ((stateInput.greenfieldRun.appliedFileDiffs ?? []).length > 0) return true;
  if (hasPlanApplyDiffs(stateInput.planApplySession)) return true;
  if (
    resolveAllowGeneratedFileDiffs(stateInput.greenfieldRun) &&
    (stateInput.greenfieldRun.generatedFiles?.length ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

/** Do not freeze while build_loop is still running or follow-up has not finished. */
export function shouldFreezeAgentRunArtifact(stateInput: DeriveAgentRunStateInput): boolean {
  if (stateInput.buildRunning || stateInput.pipelineRunning) return false;

  const run = stateInput.greenfieldRun;
  if (followUpRunInProgress(run)) return false;
  if (!isRunTerminal(run)) return false;

  return true;
}

/**
 * Persist or refresh the run artifact when the run is terminal or when
 * planner/apply produced file diffs for the active run.
 */
export function shouldRefreshAgentRunArtifact(
  stateInput: DeriveAgentRunStateInput,
  activeRunId: string | null,
): boolean {
  if (!activeRunId) return false;
  if (shouldFreezeAgentRunArtifact(stateInput)) return true;
  if (!hasArtifactFileDiffSource(stateInput)) return false;
  if (stateInput.buildRunning || stateInput.pipelineRunning) return true;
  if (followUpRunInProgress(stateInput.greenfieldRun)) return true;
  return false;
}
