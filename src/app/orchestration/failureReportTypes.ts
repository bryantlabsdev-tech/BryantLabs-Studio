import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

/** Workspace bridge for publishing structured failure reports to the run log. */
export interface FailureReportOrchestrationHost {
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
}

export type { StudioFailureReport };
