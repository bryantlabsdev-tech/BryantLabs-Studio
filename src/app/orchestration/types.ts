import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { AutoFixSession } from "@/core/autoFix";
import type { BuildLoopMode } from "@/core/build";
import type { PlanContext } from "@/core/planner/aiTypes";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type { PlanApplySession } from "@/core/planApply";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type { SessionMemorySnapshot } from "@/core/sessionMemory";
import type { StudioActionType } from "@/core/studioRun/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { CenterTab, RailTool } from "@/core/layout/types";
import type { MemoryRetrievalResult } from "@/core/memory";
import type { ReferencedFileContent } from "@/core/context/referencedFileContext";
import type { BryantLabsApi, ProjectInfo, ProjectScan, VerificationResult } from "@/types";

export type AIPlanStatus = "idle" | "running" | "done" | "error";
export type AIPatchStatus = "idle" | "running" | "done" | "error";

export interface PipelineCoderResult {
  ok: boolean;
  fileCount: number;
  error?: string;
  routing: { provider: ProviderId; model: string };
  contextSnapshotId: string | null;
}

/** Latest workspace callbacks — updated each render via ref. */
export interface BuildPipelineHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplySession: PlanApplySession | null;
  readonly autoFixSession: AutoFixSession | null;
  readonly lastPlanPrompt: string | null;
  readonly projectMemory: ProjectMemory;
  readonly createPlanErrorRef: MutableRefObject<string | null>;
  readonly editExplorationContentsRef: MutableRefObject<readonly ReferencedFileContent[]>;
  readonly aiPlanRef: MutableRefObject<AIPlanResult | null>;
  readonly lastContextSnapshotIdRef: MutableRefObject<string | null>;
  readonly pipelineCoderResultRef: MutableRefObject<PipelineCoderResult | null>;
  readonly createPlan: (
    prompt: string,
    semanticBoostPaths?: readonly string[],
  ) => Plan | null;
  readonly runAIPlan: (explicitPrompt?: string) => Promise<boolean>;
  readonly clearRunContextForNewSubmit: () => void;
  readonly startApplyPlan: (opts?: {
    autoContinue?: boolean;
  }) => Promise<import("@/app/orchestration/applyPlan").ExecuteApplyPlanResult>;
  readonly approveAllPlanApplyFiles: () => void;
  readonly applyApprovedPlanFiles: (opts?: {
    pipelineMode?: boolean;
  }) => Promise<{
    ok: boolean;
    verification: VerificationResult | null;
    applied: readonly string[];
    error?: string;
  }>;
  readonly cancelApplyPlan: () => void;
  readonly executeApplyPlan: (opts: {
    directRewrite: boolean;
    pipelineMode?: boolean;
    autoContinue?: boolean;
  }) => Promise<import("@/app/orchestration/applyPlan").ExecuteApplyPlanResult>;
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
  readonly approveAutoFixRepair: () => Promise<void>;
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
    details?: string,
  ) => void;
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
  readonly invokePlannerCall: <T extends StageProviderResult>(
    settings: ProviderSettings,
    maxTokens: number,
    call: (provider: ProviderId) => Promise<T>,
  ) => Promise<T | null>;
  readonly refreshSmartFileSelection: (
    prompt: string,
    memory: SessionMemorySnapshot,
  ) => void;
  readonly resolveMemoriesForPrompt: (
    prompt: string,
    operation: "ai_plan",
  ) => MemoryRetrievalResult;
  readonly setSessionMemory: Dispatch<SetStateAction<SessionMemorySnapshot>>;
  readonly setSessionMemoryDiagnostics: Dispatch<
    SetStateAction<import("@/core/sessionMemory").SessionMemoryDiagnostics | null>
  >;
  readonly setAiPlan: Dispatch<SetStateAction<AIPlanResult | null>>;
  readonly setAiPlanStatus: Dispatch<SetStateAction<AIPlanStatus>>;
  readonly setCenterTab: Dispatch<SetStateAction<CenterTab>>;
  readonly setRailTool: Dispatch<SetStateAction<RailTool>>;
  readonly buildApplyPlanFailureReport: typeof import("@/core/diagnostics/failureReport").buildApplyPlanFailureReport;
  readonly recordFollowUpUserMessage: (prompt: string) => void;
  readonly recordAgentUserMessage: (prompt: string) => void;
  readonly recordFollowUpFailureMessage?: (text: string) => void;
  readonly finalizeFollowUpActivityRun?: () => void;
  readonly attemptFollowUpAutoEscalation?: (error: string) => Promise<boolean>;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly greenfieldPanelActive: boolean;
  readonly getAgentRunBlockReason: () => string | null;
  readonly releaseBuildRunForReview?: () => void;
  readonly setPlanApplySession: Dispatch<SetStateAction<PlanApplySession | null>>;
  readonly setPlanApplyError: Dispatch<SetStateAction<string | null>>;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly refreshProviderStatus?: () => Promise<void>;
  readonly syncAppContextBeforeEdit?: () => void;
  readonly runAgentFollowUp?: (prompt: string) => Promise<void>;
}

export interface BuildStatusInput {
  mode: BuildLoopMode;
  buildRunning: boolean;
  pipelineRunning: boolean;
  pipelineStatus: import("@/core/pipeline/types").PipelineSession["status"] | null;
  aiPlanStatus: AIPlanStatus;
  planApplyPhase: PlanApplySession["phase"] | null;
  autoFixPhase: AutoFixSession["phase"] | null;
  lastPlanPrompt: string | null;
  pipelinePrompt: string | null;
  buildError: string | null;
  pipelineError: string | null;
}
