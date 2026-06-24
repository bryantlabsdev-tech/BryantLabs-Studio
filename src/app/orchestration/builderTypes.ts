import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { BuilderSession } from "@/core/builder";
import type { ExecutionSession } from "@/core/execution";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type { SessionMemoryDiagnostics, SessionMemorySnapshot } from "@/core/sessionMemory";
import type { StudioActionType } from "@/core/studioRun/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { RailTool } from "@/core/layout/types";
import type {
  BryantLabsApi,
  ProjectInfo,
  ProjectScan,
  VerificationResult,
} from "@/types";
import type { ExecutionLoopResult } from "@/app/orchestration/executionTypes";

export interface BuilderControlState {
  paused: boolean;
  stopped: boolean;
}

export interface BuilderPhaseOnceResult {
  ok: boolean;
  verification: VerificationResult | null;
  filesModified: string[];
  filesCreated: string[];
  error?: string;
}

export interface BuilderAutoFixInput {
  verification: VerificationResult;
  applied: readonly string[];
  prompt: string;
  planSummary: string;
  planSource: string;
  failureLine: string;
}

/** Workspace bridge for autonomous app builder orchestration. */
export interface BuilderOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemoryRef: MutableRefObject<ProjectMemory>;
  readonly builderSession: BuilderSession | null;
  readonly builderControlRef: MutableRefObject<BuilderControlState>;
  readonly builderSkipApprovalRef: MutableRefObject<string | null>;
  readonly setBuilderSession: Dispatch<SetStateAction<BuilderSession | null>>;
  readonly setBuilderError: Dispatch<SetStateAction<string | null>>;
  readonly setRailTool: Dispatch<SetStateAction<RailTool>>;
  readonly setPlan: Dispatch<SetStateAction<Plan | null>>;
  readonly setLastPlanPrompt: Dispatch<SetStateAction<string | null>>;
  readonly setSessionMemory: Dispatch<SetStateAction<SessionMemorySnapshot>>;
  readonly setSessionMemoryDiagnostics: Dispatch<
    SetStateAction<SessionMemoryDiagnostics | null>
  >;
  readonly setExecutionSession: Dispatch<SetStateAction<ExecutionSession | null>>;
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
  readonly runScan: () => Promise<void>;
  readonly refreshSmartFileSelection: (
    prompt: string,
    memory: SessionMemorySnapshot,
  ) => void;
  readonly executeAIPlanForPrompt: (
    userPrompt: string,
    deterministicPlan: Plan,
  ) => Promise<AIPlanResult | null>;
  readonly createExecutionSessionFromPlans: (
    deterministicPlan: Plan,
    aiPlanResult: AIPlanResult,
    userPrompt: string,
  ) => ExecutionSession | null;
  readonly executeMultiFileLoop: (
    session: ExecutionSession,
  ) => Promise<ExecutionLoopResult>;
  readonly runAutoFixAutomatic: (
    opts: BuilderAutoFixInput,
  ) => Promise<{ ok: boolean; verification: VerificationResult | null }>;
}
