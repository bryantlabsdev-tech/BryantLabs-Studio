import { useCallback, useRef } from "react";
import type { BryantLabsApi, FileNode } from "@/types";
import type { Patch } from "@/core/editor";
import type { EditTarget, EditStatus } from "@/app/workspace/workspaceState";
import type { CenterTab } from "@/core/layout/types";
import type { WorkspacePlanState } from "@/app/workspace/useWorkspacePlanState";
import type { OpenFile } from "@/app/workspace/types";

export function useWorkspaceEditSurface(input: {
  readonly api: BryantLabsApi | undefined;
  readonly activePath: string | null;
  readonly openFileTabs: string[];
  readonly openFilesByPath: Record<string, OpenFile>;
  readonly setOpenFileTabs: React.Dispatch<React.SetStateAction<string[]>>;
  readonly setOpenFilesByPath: React.Dispatch<
    React.SetStateAction<Record<string, OpenFile>>
  >;
  readonly setActivePath: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setFileStatus: React.Dispatch<
    React.SetStateAction<import("@/app/workspace/useWorkspaceProjectState").FileStatus>
  >;
  readonly setError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setActiveFile: React.Dispatch<
    React.SetStateAction<OpenFile | null>
  >;
  readonly plan: Pick<
    WorkspacePlanState,
    | "setAiPatchSession"
    | "setPatchStatus"
    | "setPatchError"
    | "setAiPatchApproved"
    | "setAiPatchApplyStatus"
    | "setAiPatchApplyError"
  >;
  readonly setEditTarget: React.Dispatch<React.SetStateAction<EditTarget | null>>;
  readonly setPendingPatch: React.Dispatch<React.SetStateAction<Patch | null>>;
  readonly setReviewing: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setEditError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setEditStatus: React.Dispatch<React.SetStateAction<EditStatus>>;
  readonly pendingPatch: Patch | null;
  readonly setCenterTab: React.Dispatch<React.SetStateAction<CenterTab>>;
}) {
  const inputRef = useRef(input);
  inputRef.current = input;

  const activateFile = useCallback((path: string) => {
    const current = inputRef.current;
    const cached = current.openFilesByPath[path];
    if (!cached) return;
    current.setActivePath(path);
    current.setActiveFile(cached);
    current.setFileStatus("loaded");
    current.setCenterTab("editor");
  }, []);

  const closeFile = useCallback((path: string) => {
    const current = inputRef.current;
    const nextTabs = current.openFileTabs.filter((tabPath) => tabPath !== path);
    const { [path]: _removed, ...rest } = current.openFilesByPath;
    current.setOpenFileTabs(nextTabs);
    current.setOpenFilesByPath(rest);

    if (current.activePath !== path) return;

    const currentIndex = current.openFileTabs.indexOf(path);
    const fallback =
      nextTabs[currentIndex] ??
      nextTabs[currentIndex - 1] ??
      nextTabs[nextTabs.length - 1] ??
      null;

    if (fallback && rest[fallback]) {
      current.setActivePath(fallback);
      current.setActiveFile(rest[fallback]!);
      current.setFileStatus("loaded");
    } else {
      current.setActivePath(null);
      current.setActiveFile(null);
      current.setFileStatus("idle");
    }
  }, []);

  const openFile = useCallback(async (
    node: FileNode,
    opts?: { readonly revealEditor?: boolean },
  ) => {
    const current = inputRef.current;
    if (!current.api || node.type !== "file") return;
    const path = node.path;
    if (opts?.revealEditor !== false) {
      current.setCenterTab("editor");
    }

    const cached = current.openFilesByPath[path];
    if (cached) {
      current.setActivePath(path);
      current.setActiveFile(cached);
      current.setFileStatus("loaded");
      current.setError(null);
      return;
    }

    current.setActivePath(path);
    current.setFileStatus("loading");
    current.setError(null);
    current.plan.setAiPatchSession(null);
    current.plan.setPatchStatus("idle");
    current.plan.setPatchError(null);
    current.plan.setAiPatchApproved(false);
    current.plan.setAiPatchApplyStatus("idle");
    current.plan.setAiPatchApplyError(null);
    try {
      const result = await current.api.readFile(path);
      const openFileEntry: OpenFile = { node, result };
      current.setActiveFile(openFileEntry);
      current.setOpenFilesByPath((prev) => ({ ...prev, [path]: openFileEntry }));
      current.setOpenFileTabs((prev) =>
        prev.includes(path) ? prev : [...prev, path],
      );
      current.setFileStatus(result.readable ? "loaded" : "error");
    } catch {
      current.setActiveFile(null);
      current.setFileStatus("error");
      current.setError("Failed to read file.");
    }
  }, []);

  const openPath = useCallback(
    async (absPath: string) => {
      const segments = absPath.split(/[/\\]/);
      const name = segments[segments.length - 1] ?? absPath;
      await openFile({ name, path: absPath, type: "file" });
    },
    [openFile],
  );

  const listDirectory = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    const current = inputRef.current;
    if (!current.api) return [];
    return current.api.listDirectory(dirPath);
  }, []);

  const resetPatch = useCallback(() => {
    const current = inputRef.current;
    current.setPendingPatch(null);
    current.setReviewing(false);
    current.setEditError(null);
    current.setEditStatus("idle");
  }, []);

  const selectEditTarget = useCallback(
    (target: EditTarget) => {
      inputRef.current.setEditTarget(target);
      resetPatch();
      void openPath(target.absPath);
    },
    [openPath, resetPatch],
  );

  const clearEditTarget = useCallback(() => {
    inputRef.current.setEditTarget(null);
    resetPatch();
  }, [resetPatch]);

  const reviewPatch = useCallback(() => {
    const current = inputRef.current;
    if (current.pendingPatch) {
      current.setReviewing(true);
      current.setCenterTab("editor");
    }
  }, []);

  const discardPatch = useCallback(() => resetPatch(), [resetPatch]);

  return {
    openFile,
    openPath,
    activateFile,
    closeFile,
    listDirectory,
    resetPatch,
    selectEditTarget,
    clearEditTarget,
    reviewPatch,
    discardPatch,
  };
}
