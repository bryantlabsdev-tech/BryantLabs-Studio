import { useCallback, useState } from "react";
import type { BryantLabsApi } from "@/types";
import type { OpenFile } from "@/app/workspace/types";

export type EditorSaveStatus = "idle" | "saving" | "saved" | "error";

export function useWorkspaceDirectEdit(input: {
  readonly api: BryantLabsApi | undefined;
  readonly activePath: string | null;
  readonly activeFile: OpenFile | null;
  readonly openFilesByPath: Record<string, OpenFile>;
  readonly setOpenFilesByPath: React.Dispatch<
    React.SetStateAction<Record<string, OpenFile>>
  >;
  readonly setActiveFile: React.Dispatch<React.SetStateAction<OpenFile | null>>;
  readonly setLastEditedPath: React.Dispatch<React.SetStateAction<string | null>>;
  readonly runScan: () => void | Promise<void>;
  readonly refreshProjectProblems: () => void | Promise<void>;
}) {
  const [editorDrafts, setEditorDrafts] = useState<Record<string, string>>({});
  const [editorSaveStatus, setEditorSaveStatus] = useState<EditorSaveStatus>("idle");
  const [editorSaveError, setEditorSaveError] = useState<string | null>(null);

  const savedContent = useCallback(
    (path: string): string | null =>
      input.openFilesByPath[path]?.result.content ?? null,
    [input.openFilesByPath],
  );

  const editorContent = useCallback(
    (path: string): string | null => {
      if (path in editorDrafts) return editorDrafts[path]!;
      return savedContent(path);
    },
    [editorDrafts, savedContent],
  );

  const isEditorDirty = useCallback(
    (path: string): boolean => {
      const draft = editorDrafts[path];
      if (draft === undefined) return false;
      const saved = savedContent(path);
      return saved !== null && draft !== saved;
    },
    [editorDrafts, savedContent],
  );

  const updateEditorDraft = useCallback((path: string, content: string) => {
    setEditorDrafts((prev) => {
      const saved = input.openFilesByPath[path]?.result.content;
      if (saved !== undefined && content === saved) {
        if (!(path in prev)) return prev;
        const { [path]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [path]: content };
    });
    setEditorSaveStatus("idle");
    setEditorSaveError(null);
  }, [input.openFilesByPath]);

  const clearEditorDraft = useCallback((path: string) => {
    setEditorDrafts((prev) => {
      if (!(path in prev)) return prev;
      const { [path]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const revertEditorDraft = useCallback(() => {
    if (!input.activePath) return;
    clearEditorDraft(input.activePath);
    setEditorSaveStatus("idle");
    setEditorSaveError(null);
  }, [clearEditorDraft, input.activePath]);

  const saveEditorFile = useCallback(
    async (path?: string): Promise<boolean> => {
      const targetPath = path ?? input.activePath;
      if (!input.api || !targetPath) return false;
      const draft = editorDrafts[targetPath];
      if (draft === undefined) return true;
      const open = input.openFilesByPath[targetPath];
      if (!open?.result.readable) return false;
      const before = open.result.content;
      if (draft === before) {
        clearEditorDraft(targetPath);
        return true;
      }

      setEditorSaveStatus("saving");
      setEditorSaveError(null);
      try {
        const res = await input.api.applyEdit(targetPath, before, draft);
        if (!res.ok) {
          setEditorSaveStatus("error");
          setEditorSaveError(res.reason ?? "Save failed.");
          return false;
        }
        const nextOpen: OpenFile = {
          ...open,
          result: { ...open.result, content: draft },
        };
        input.setOpenFilesByPath((prev) => ({ ...prev, [targetPath]: nextOpen }));
        if (input.activePath === targetPath) {
          input.setActiveFile(nextOpen);
        }
        input.setLastEditedPath(targetPath);
        clearEditorDraft(targetPath);
        setEditorSaveStatus("saved");
        void input.runScan();
        void input.refreshProjectProblems();
        return true;
      } catch {
        setEditorSaveStatus("error");
        setEditorSaveError("Save failed.");
        return false;
      }
    },
    [
      clearEditorDraft,
      editorDrafts,
      input,
    ],
  );

  return {
    editorDrafts,
    editorSaveStatus,
    editorSaveError,
    editorContent,
    isEditorDirty,
    updateEditorDraft,
    revertEditorDraft,
    saveEditorFile,
    clearEditorDraft,
  };
}
