import { useCallback } from "react";
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
  const activateFile = useCallback(
    (path: string) => {
      const cached = input.openFilesByPath[path];
      if (!cached) return;
      input.setActivePath(path);
      input.setActiveFile(cached);
      input.setFileStatus("loaded");
      input.setCenterTab("editor");
    },
    [input],
  );

  const closeFile = useCallback(
    (path: string) => {
      const nextTabs = input.openFileTabs.filter((tabPath) => tabPath !== path);
      const { [path]: _removed, ...rest } = input.openFilesByPath;
      input.setOpenFileTabs(nextTabs);
      input.setOpenFilesByPath(rest);

      if (input.activePath !== path) return;

      const currentIndex = input.openFileTabs.indexOf(path);
      const fallback =
        nextTabs[currentIndex] ??
        nextTabs[currentIndex - 1] ??
        nextTabs[nextTabs.length - 1] ??
        null;

      if (fallback && rest[fallback]) {
        input.setActivePath(fallback);
        input.setActiveFile(rest[fallback]!);
        input.setFileStatus("loaded");
      } else {
        input.setActivePath(null);
        input.setActiveFile(null);
        input.setFileStatus("idle");
      }
    },
    [input],
  );

  const openFile = useCallback(
    async (node: FileNode) => {
      if (!input.api || node.type !== "file") return;
      const path = node.path;
      input.setCenterTab("editor");

      const cached = input.openFilesByPath[path];
      if (cached) {
        input.setActivePath(path);
        input.setActiveFile(cached);
        input.setFileStatus("loaded");
        input.setError(null);
        return;
      }

      input.setActivePath(path);
      input.setFileStatus("loading");
      input.setError(null);
      input.plan.setAiPatchSession(null);
      input.plan.setPatchStatus("idle");
      input.plan.setPatchError(null);
      input.plan.setAiPatchApproved(false);
      input.plan.setAiPatchApplyStatus("idle");
      input.plan.setAiPatchApplyError(null);
      try {
        const result = await input.api.readFile(path);
        const openFileEntry: OpenFile = { node, result };
        input.setActiveFile(openFileEntry);
        input.setOpenFilesByPath((prev) => ({ ...prev, [path]: openFileEntry }));
        input.setOpenFileTabs((prev) =>
          prev.includes(path) ? prev : [...prev, path],
        );
        input.setFileStatus(result.readable ? "loaded" : "error");
      } catch {
        input.setActiveFile(null);
        input.setFileStatus("error");
        input.setError("Failed to read file.");
      }
    },
    [input],
  );

  const openPath = useCallback(
    async (absPath: string) => {
      const segments = absPath.split(/[/\\]/);
      const name = segments[segments.length - 1] ?? absPath;
      await openFile({ name, path: absPath, type: "file" });
    },
    [openFile],
  );

  const listDirectory = useCallback(
    async (dirPath: string): Promise<FileNode[]> => {
      if (!input.api) return [];
      return input.api.listDirectory(dirPath);
    },
    [input.api],
  );

  const resetPatch = useCallback(() => {
    input.setPendingPatch(null);
    input.setReviewing(false);
    input.setEditError(null);
    input.setEditStatus("idle");
  }, [input]);

  const selectEditTarget = useCallback(
    (target: EditTarget) => {
      input.setEditTarget(target);
      resetPatch();
      void openPath(target.absPath);
    },
    [input, openPath, resetPatch],
  );

  const clearEditTarget = useCallback(() => {
    input.setEditTarget(null);
    resetPatch();
  }, [input, resetPatch]);

  const reviewPatch = useCallback(() => {
    if (input.pendingPatch) {
      input.setReviewing(true);
      input.setCenterTab("editor");
    }
  }, [input]);

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
