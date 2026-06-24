import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { ApplyPlanSuccessOutcome } from "@/core/orchestration/applyPlanSuccess";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { RepositoryIndex } from "@/core/repository";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type { ExecutionSession } from "@/core/execution";
import type { StudioActionType } from "@/core/studioRun/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { RailTool } from "@/core/layout/types";
import type { ReferencedFileContent } from "@/core/context/referencedFileContext";
import type {
  BryantLabsApi,
  ProjectInfo,
  ProjectScan,
  VerificationResult,
} from "@/types";
import type {
  BuilderAutoFixInput,
} from "@/app/orchestration/builderTypes";
import type { ExecutionLoopResult } from "@/app/orchestration/executionTypes";

export interface AgentControlState {
  paused: boolean;
  stopped: boolean;
  safetyApproved: boolean;
  approveResolve: ((ok: boolean) => void) | null;
}

export type AgentScanStatus = "idle" | "scanning" | "done" | "error";

/** Workspace bridge for studio agent orchestration. */
export interface AgentOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly scanStatus: AgentScanStatus;
  readonly repository: RepositoryIndex | null;
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly lastPlanPrompt: string | null;
  readonly verification: VerificationResult | null;
  readonly agentLoopSession: AgentLoopSession | null;
  readonly agentControlRef: MutableRefObject<AgentControlState>;
  readonly agentLastExecRef: MutableRefObject<ExecutionLoopResult | null>;
  readonly applyPlanSuccessRef: MutableRefObject<ApplyPlanSuccessOutcome | null>;
  readonly createPlanErrorRef: MutableRefObject<string | null>;
  readonly editExplorationContentsRef: MutableRefObject<readonly ReferencedFileContent[]>;
  readonly setAgentLoopSession: Dispatch<
    SetStateAction<AgentLoopSession | null>
  >;
  readonly setAgentLoopError: Dispatch<SetStateAction<string | null>>;
  readonly setExecutionSession: Dispatch<SetStateAction<ExecutionSession | null>>;
  readonly setVerification: Dispatch<SetStateAction<VerificationResult | null>>;
  readonly setVerifyStatus: Dispatch<
    SetStateAction<"idle" | "running" | "done" | "error">
  >;
  readonly setVerifyError: Dispatch<SetStateAction<string | null>>;
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
  readonly createPlan: (prompt: string) => Plan | null;
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
