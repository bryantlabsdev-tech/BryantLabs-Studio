import type { FileNode, ReadFileResult } from "@/types";

/** Open file in the workspace editor. */
export interface OpenFile {
  readonly node: FileNode;
  readonly result: ReadFileResult;
}

export type WorkspaceFileStatus = "idle" | "loading" | "loaded" | "error";
export type WorkspaceScanStatus = "idle" | "scanning" | "done" | "error";
