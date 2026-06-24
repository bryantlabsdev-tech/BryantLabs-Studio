import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { ProjectIntelligence } from "@/core/projectIntelligence/types";
import type { PlanContext } from "@/core/planner/aiTypes";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type {
  SessionMemoryDiagnostics,
  SessionMemorySnapshot,
} from "@/core/sessionMemory";
import type { StudioActionType } from "@/core/studioRun/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { MemoryRetrievalResult } from "@/core/memory";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { ReferencedFileContent } from "@/core/context/referencedFileContext";
import type { BryantLabsApi, ProjectInfo, ProjectScan } from "@/types";
import type { AIPlanStatus } from "@/app/orchestration/types";

/** Workspace bridge for deterministic + AI planning. */
export interface PlanningOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly plan: Plan | null;
  readonly lastPlanPrompt: string | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemory: ProjectMemory;
  readonly projectIntelligence: ProjectIntelligence;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly planRef: MutableRefObject<Plan | null>;
  readonly aiPlanRef: MutableRefObject<AIPlanResult | null>;
  readonly createPlanErrorRef: MutableRefObject<string | null>;
  readonly editExplorationContentsRef: MutableRefObject<readonly ReferencedFileContent[]>;
  readonly setPlan: Dispatch<SetStateAction<Plan | null>>;
  readonly setSessionMemory: Dispatch<SetStateAction<SessionMemorySnapshot>>;
  readonly setSessionMemoryDiagnostics: Dispatch<
    SetStateAction<SessionMemoryDiagnostics | null>
  >;
  readonly setAiPlan: Dispatch<SetStateAction<AIPlanResult | null>>;
  readonly setAiPlanStatus: Dispatch<SetStateAction<AIPlanStatus>>;
  readonly setLastPlanPrompt: Dispatch<SetStateAction<string | null>>;
  readonly refreshSmartFileSelection: (
    prompt: string,
    memory: SessionMemorySnapshot,
  ) => void;
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
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly resolveMemoriesForPrompt: (
    prompt: string,
    operation: "ai_plan" | "agent",
  ) => MemoryRetrievalResult;
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
}
