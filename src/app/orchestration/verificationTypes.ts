import type { Dispatch, SetStateAction } from "react";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { SessionMemorySnapshot } from "@/core/sessionMemory";
import type { StudioActionType } from "@/core/studioRun/types";
import type { BryantLabsApi, VerificationResult } from "@/types";

/** Workspace bridge for manual project verification runs. */
export interface VerificationOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly setVerifyStatus: Dispatch<
    SetStateAction<"idle" | "running" | "done" | "error">
  >;
  readonly setVerifyError: Dispatch<SetStateAction<string | null>>;
  readonly setVerification: Dispatch<SetStateAction<VerificationResult | null>>;
  readonly setSessionMemory: Dispatch<SetStateAction<SessionMemorySnapshot>>;
  readonly beginStudioAction: (
    actionType: StudioActionType,
    stage: GreenfieldRunLogEntry["stage"],
    message: string,
    opts?: {
      details?: string;
      patch?: Partial<GreenfieldRunSnapshot>;
    },
  ) => void;
  readonly finishStudioAction: (
    actionType: StudioActionType,
    stage: GreenfieldRunLogEntry["stage"],
    ok: boolean,
    message: string,
    opts?: {
      details?: string;
      patch?: Partial<GreenfieldRunSnapshot>;
    },
  ) => void;
  readonly publishFailureReport: (report: StudioFailureReport) => void;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
}
