import type { Dispatch, SetStateAction } from "react";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { AutoFixSession } from "@/core/autoFix";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { PlanApplySession } from "@/core/planApply/types";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type { SessionMemorySnapshot } from "@/core/sessionMemory";
import type { BryantLabsApi, ProjectInfo, ProjectScan, VerificationResult } from "@/types";
/** Workspace bridge for autonomous repair after verification failures. */
export interface AutoFixOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly autoFixSession: AutoFixSession | null;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly setAutoFixSession: Dispatch<SetStateAction<AutoFixSession | null>>;
  readonly setVerification: Dispatch<SetStateAction<VerificationResult | null>>;
  readonly setVerifyStatus: Dispatch<
    SetStateAction<"idle" | "running" | "done" | "error">
  >;
  readonly setPlanApplyError: Dispatch<SetStateAction<string | null>>;
  readonly setPlanApplySession: Dispatch<SetStateAction<PlanApplySession | null>>;
  readonly setSessionMemory: Dispatch<SetStateAction<SessionMemorySnapshot>>;
  readonly pushAgent: (
    updater: (session: AgentWorkspaceSession) => AgentWorkspaceSession,
  ) => void;
  readonly runScan: () => Promise<void>;
  readonly invokeRepairCall: <T extends StageProviderResult>(
    settings: ProviderSettings,
    maxTokens: number,
    call: (provider: ProviderId) => Promise<T>,
  ) => Promise<T | null>;
}
