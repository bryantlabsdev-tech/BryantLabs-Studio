import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
/** Workspace bridge for greenfield run lifecycle (begin/finish studio actions). */
export interface StudioActionOrchestrationHost {
  readonly projectPath: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly pipelineRunActiveRef: MutableRefObject<boolean>;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly setGreenfieldRun: Dispatch<SetStateAction<GreenfieldRunSnapshot>>;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly resetAiCallTracker: () => void;
  readonly refreshProviderStatus: (opts?: { logToRun?: boolean }) => Promise<void>;
  readonly persistAnalyticsRecord: (
    snapshot: GreenfieldRunSnapshot,
    ok: boolean,
    message: string,
    detail?: string,
  ) => void;
  readonly offerMemoryCandidatesFromRun: (
    snapshot: GreenfieldRunSnapshot,
    ok: boolean,
    prompt?: string,
    provider?: string | null,
    model?: string | null,
  ) => void;
}
