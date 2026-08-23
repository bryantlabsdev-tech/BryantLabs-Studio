import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunUpdate } from "@/app/orchestration/followUpRunFailure";

/** Workspace bridge for publishing structured failure reports to the run log. */
export interface FailureReportOrchestrationHost {
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly updateGreenfieldRun: (patch: GreenfieldRunUpdate) => void;
}

export type { StudioFailureReport };
