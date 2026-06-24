import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { ExecutionSession } from "@/core/execution";
import type { ApplyPlanSuccessOutcome } from "@/core/orchestration/applyPlanSuccess";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { PlanContext } from "@/core/planner/aiTypes";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type {
  PlanApplyFileEntry,
  PlanApplySession,
} from "@/core/planApply";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type { SessionMemorySnapshot } from "@/core/sessionMemory";
import type { StudioActionType } from "@/core/studioRun/types";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { CenterTab } from "@/core/layout/types";
import type { UiAuditResult } from "@/core/greenfield/uiAudit";
import type { MemoryRetrievalResult } from "@/core/memory";
import type {
  BryantLabsApi,
  ProjectInfo,
  ProjectScan,
  VerificationResult,
} from "@/types";
import type { PipelineCoderResult } from "@/app/orchestration/types";
import type { AiCallTracker } from "@/core/providers/costControls";

/** Workspace bridge for Apply Plan proposal orchestration. */
export interface ApplyPlanOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly lastPlanPrompt: string | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly planApplySession: PlanApplySession | null;
  readonly projectMemory: ProjectMemory;
  readonly planRef: MutableRefObject<Plan | null>;
  readonly aiPlanRef: MutableRefObject<AIPlanResult | null>;
  readonly aiCallTrackerRef: MutableRefObject<AiCallTracker>;
  readonly applyPlanSuccessRef: MutableRefObject<ApplyPlanSuccessOutcome | null>;
  readonly executionNoChangeGuardRef: MutableRefObject<Map<string, number>>;
  readonly pipelineCoderResultRef: MutableRefObject<PipelineCoderResult | null>;
  readonly lastContextSnapshotIdRef: MutableRefObject<string | null>;
  readonly setPlanApplyError: Dispatch<SetStateAction<string | null>>;
  readonly setBuildError?: Dispatch<SetStateAction<string | null>>;
  readonly releaseBuildRunForReview?: () => void;
  readonly setPlanApplySession: Dispatch<SetStateAction<PlanApplySession | null>>;
  readonly setCenterTab: Dispatch<SetStateAction<CenterTab>>;
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
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly publishFailureReport: (report: StudioFailureReport) => void;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly beginApplyPlanRun: () => string;
  readonly isStaleApplyPlanRun: (runId: string) => boolean;
  readonly ignoreStaleApplyPlanResult: (runId: string, detail?: string) => void;
  readonly resolveMemoriesForPrompt: (
    prompt: string,
    operation: "apply_plan",
  ) => MemoryRetrievalResult;
  readonly uiAuditResult?: UiAuditResult | null;
  readonly commitContextCapture: (opts: {
    operation: import("@/core/contextInspector").ContextOperation;
    provider: ProviderId;
    model: string;
    originalPrompt: string;
    planContext: PlanContext;
    expandedPrompt?: string;
    requestPreviewOverride?: string;
    settings?: ProviderSettings;
    estimatedAiCalls?: number | null;
  }) => void;
  readonly invokeCoderCall: <T extends StageProviderResult>(
    settings: ProviderSettings,
    maxTokens: number,
    call: (provider: ProviderId) => Promise<T>,
    extras?: {
      promptPayload?: string;
      patchSize?: "small" | "large";
      skipSmartRetry?: boolean;
    },
  ) => Promise<T | null>;
  readonly agentControlRef: MutableRefObject<{
    paused: boolean;
    stopped: boolean;
    safetyApproved: boolean;
    approveResolve: ((ok: boolean) => void) | null;
  }>;
  readonly setAgentLoopSession: (
    updater: (prev: AgentLoopSession | null) => AgentLoopSession | null,
  ) => void;
  readonly setExecutionSession: (
    updater: (prev: ExecutionSession | null) => ExecutionSession | null,
  ) => void;
  readonly pushAgent: (
    updater: (session: AgentWorkspaceSession) => AgentWorkspaceSession,
  ) => void;
  readonly applyPlanActiveRunIdRef: MutableRefObject<string | null>;
  readonly completeApplyPlanRun: (runId: string) => void;
  readonly setSessionMemory: Dispatch<SetStateAction<SessionMemorySnapshot>>;
  readonly setVerification: Dispatch<SetStateAction<VerificationResult | null>>;
  readonly setVerifyStatus: Dispatch<
    SetStateAction<"idle" | "running" | "done" | "error">
  >;
  readonly runScan: () => void;
  readonly requestPreviewTab: () => void;
  readonly setAppPreview: (state: {
    url: string | null;
    running: boolean;
    root: string;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }) => void;
  readonly recordSmartFileHistory: (
    prompt: string,
    paths: readonly string[],
    success: boolean,
  ) => void;
  readonly startAutoFixAfterApply: (opts: {
    verification: VerificationResult;
    applied: string[];
    prompt: string;
    planSummary: string;
    planSource: string;
    failureLine: string;
  }) => Promise<{
    ok: boolean;
    verification: VerificationResult | null;
    awaitingApproval: boolean;
  }>;
  readonly setCanUndo: Dispatch<SetStateAction<boolean>>;
  readonly setLastEditedPath: Dispatch<SetStateAction<string | null>>;
  readonly saveFollowUpCheckpoint?: (
    checkpoint: import("@/core/build/followUpCheckpoint").FollowUpCheckpoint,
  ) => void;
  readonly recordFollowUpStudioMessage?: (
    text: string,
    meta?: {
      filesModified?: readonly string[];
      provider?: string;
      model?: string;
      durationMs?: number;
      typecheckPassed?: boolean;
      buildPassed?: boolean;
      verification?: import("@/types").VerificationResult | null;
      snapshotFiles?: readonly import("@/core/build/followUpCheckpoint").FollowUpCheckpointFile[];
    },
  ) => void;
  /** Clear live plan/verification workspace state after a successful terminal run. */
  readonly archiveActiveRunContextAfterSuccess?: () => void;
  readonly greenfieldRun?: GreenfieldRunSnapshot;
}

export type { PlanApplyFileEntry };
