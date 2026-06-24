import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { ApplyPlanSuccessOutcome } from "@/core/orchestration/applyPlanSuccess";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type { ExecutionSession } from "@/core/execution";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type { SessionMemorySnapshot } from "@/core/sessionMemory";
import type { StudioActionType } from "@/core/studioRun/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { MemoryRetrievalResult } from "@/core/memory";
import type { RailTool } from "@/core/layout/types";
import type {
  BryantLabsApi,
  ProjectInfo,
  ProjectScan,
  VerificationResult,
} from "@/types";

export interface ExecutionLoopResult {
  readonly ok: boolean;
  readonly verification: VerificationResult | null;
  readonly filesModified: readonly string[];
  readonly error?: string;
}

/** Workspace bridge for multi-file execution loop and session setup. */
export interface ExecutionOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly lastPlanPrompt: string | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemoryRef: MutableRefObject<ProjectMemory>;
  readonly verification: VerificationResult | null;
  readonly executionSession: ExecutionSession | null;
  readonly applyPlanSuccessRef: MutableRefObject<ApplyPlanSuccessOutcome | null>;
  readonly executionNoChangeGuardRef: MutableRefObject<Map<string, number>>;
  readonly setExecutionSession: Dispatch<SetStateAction<ExecutionSession | null>>;
  readonly setExecutionError: Dispatch<SetStateAction<string | null>>;
  readonly setVerification: Dispatch<SetStateAction<VerificationResult | null>>;
  readonly setVerifyStatus: Dispatch<
    SetStateAction<"idle" | "running" | "done" | "error">
  >;
  readonly setRailTool: Dispatch<SetStateAction<RailTool>>;
  readonly pushAgent: (
    updater: (session: AgentWorkspaceSession) => AgentWorkspaceSession,
  ) => void;
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
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly resolveMemoriesForPrompt: (
    prompt: string,
    operation: "apply_plan",
  ) => MemoryRetrievalResult;
  readonly invokeCoderCall: <T extends StageProviderResult>(
    settings: ProviderSettings,
    estimatedTokens: number,
    call: (provider: ProviderId) => Promise<T>,
  ) => Promise<T | null>;
  readonly runScan: () => Promise<void>;
}
