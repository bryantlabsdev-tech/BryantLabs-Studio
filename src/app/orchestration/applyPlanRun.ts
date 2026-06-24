import type { MutableRefObject } from "react";
import {
  createApplyPlanRunId,
  shouldIgnoreStaleApplyPlanResult,
} from "@/core/planApply/applyPlanRun";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

export interface ApplyPlanRunController {
  beginApplyPlanRun(): string;
  completeApplyPlanRun(runId: string): void;
  isStaleApplyPlanRun(runId: string): boolean;
  ignoreStaleApplyPlanResult(runId: string, detail?: string): void;
}

export function createApplyPlanRunController(
  activeRunIdRef: MutableRefObject<string | null>,
  completedRunIdRef: MutableRefObject<string | null>,
  appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    details?: string,
  ) => void,
): ApplyPlanRunController {
  return {
    beginApplyPlanRun() {
      const runId = createApplyPlanRunId();
      activeRunIdRef.current = runId;
      completedRunIdRef.current = null;
      return runId;
    },
    completeApplyPlanRun(runId) {
      completedRunIdRef.current = runId;
      activeRunIdRef.current = null;
    },
    isStaleApplyPlanRun(runId) {
      return shouldIgnoreStaleApplyPlanResult(
        runId,
        activeRunIdRef.current,
        completedRunIdRef.current,
      );
    },
    ignoreStaleApplyPlanResult(runId, detail) {
      appendGreenfieldRunLog(
        "apply_plan",
        "success",
        "Ignored stale Apply Plan result",
        detail ?? runId,
      );
    },
  };
}
