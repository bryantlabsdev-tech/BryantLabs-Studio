import type { Dispatch, SetStateAction } from "react";
import type { Patch } from "@/core/editor";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { StudioActionType } from "@/core/studioRun/types";
import type {
  BryantLabsApi,
  FileNode,
  ReadFileResult,
} from "@/types";

export interface SafeEditTarget {
  readonly path: string;
  readonly absPath: string;
}

export interface SafeEditOpenFile {
  readonly node: FileNode;
  readonly result: ReadFileResult;
}

/** Workspace bridge for deterministic safe-edit propose / apply / undo. */
export interface SafeEditOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly editTarget: SafeEditTarget | null;
  readonly activeFile: SafeEditOpenFile | null;
  readonly activePath: string | null;
  readonly pendingPatch: Patch | null;
  readonly reviewing: boolean;
  readonly setPendingPatch: Dispatch<SetStateAction<Patch | null>>;
  readonly setReviewing: Dispatch<SetStateAction<boolean>>;
  readonly setEditError: Dispatch<SetStateAction<string | null>>;
  readonly setEditStatus: Dispatch<
    SetStateAction<"idle" | "applying" | "applied" | "error">
  >;
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
  readonly openPath: (absPath: string) => Promise<void>;
  readonly runScan: () => Promise<void>;
}
