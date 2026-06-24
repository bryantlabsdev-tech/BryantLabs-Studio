import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type {
  AIPatchApplyStatus,
  AIPatchSession,
} from "@/core/planner/aiTypes";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type { SessionMemorySnapshot } from "@/core/sessionMemory";
import type { StudioActionType } from "@/core/studioRun/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { MemoryRetrievalResult } from "@/core/memory";
import type { PlanContext } from "@/core/planner/aiTypes";
import type {
  BryantLabsApi,
  FileNode,
  ProjectInfo,
  ProjectScan,
  ReadFileResult,
} from "@/types";
import type { AIPatchStatus } from "@/app/orchestration/types";

export interface ActiveOpenFile {
  readonly node: FileNode;
  readonly result: ReadFileResult;
}

/** Workspace bridge for single-file AI patch propose / approve / apply. */
export interface AIPatchOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly project: ProjectInfo | null;
  readonly scan: ProjectScan | null;
  readonly activeFile: ActiveOpenFile | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemoryRef: MutableRefObject<ProjectMemory>;
  readonly aiPatchSession: AIPatchSession | null;
  readonly aiPatchApproved: boolean;
  readonly setPatchStatus: Dispatch<SetStateAction<AIPatchStatus>>;
  readonly setPatchError: Dispatch<SetStateAction<string | null>>;
  readonly setAiPatchSession: Dispatch<SetStateAction<AIPatchSession | null>>;
  readonly setAiPatchApproved: Dispatch<SetStateAction<boolean>>;
  readonly setAiPatchApplyStatus: Dispatch<SetStateAction<AIPatchApplyStatus>>;
  readonly setAiPatchApplyError: Dispatch<SetStateAction<string | null>>;
  readonly setCanUndo: Dispatch<SetStateAction<boolean>>;
  readonly setLastEditedPath: Dispatch<SetStateAction<string | null>>;
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
    operation: "ai_patch",
    paths: readonly string[],
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
  readonly invokeCoderCall: <T extends StageProviderResult>(
    settings: ProviderSettings,
    estimatedTokens: number,
    call: (provider: ProviderId) => Promise<T>,
  ) => Promise<T | null>;
  readonly openPath: (absPath: string) => Promise<void>;
  readonly runScan: () => Promise<void>;
}
