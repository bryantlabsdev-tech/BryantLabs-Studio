import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { EmptyState } from "@/components/EmptyState";
import { WelcomeEditor } from "@/components/WelcomeEditor";
import { FolderOpenIcon } from "@/components/icons";
import { EDITOR_PANEL } from "@/core/panels";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EditToolbar } from "@/components/editor/EditToolbar";
import { EditorFileTabs } from "@/components/editor/EditorFileTabs";
import { InlineEditPanel } from "@/components/editor/InlineEditPanel";
import { MonacoEditorView } from "@/components/editor/MonacoEditorView";
import type { InlineEditSelection } from "@/core/editor/inlineEdit";
import {
  deriveAiPatchReview,
  deriveSafeEditPatchReview,
} from "@/core/editor/patchReviewOverlay";
import {
  buildInlineSuggestPrompt,
  parseInlineSuggestResponse,
} from "@/core/editor/aiInlineSuggest";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { AiInlineSuggestFn } from "@/monaco/inlineTabCompletion";
import { useMonacoProjectSync } from "@/hooks/useMonacoProject";

function relativePath(fullPath: string, root: string): string {
  if (fullPath.startsWith(root)) {
    return fullPath.slice(root.length).replace(/^[/\\]/, "");
  }
  return fullPath;
}

interface EditorPanelProps {
  /** When true, omit outer panel chrome (embedded in center workbench). */
  embedded?: boolean;
}

/**
 * Center editor tab — Monaco with TypeScript/JavaScript intelligence.
 */
export function EditorPanel({ embedded = false }: EditorPanelProps) {
  useMonacoProjectSync();

  const {
    project,
    activeFile,
    activePath,
    fileStatus,
    editTarget,
    pendingPatch,
    reviewing,
    aiPatchSession,
    proposeAIPatch,
    patchStatus,
    scan,
    editorReveal,
    clearEditorReveal,
    approveAIPatch,
    applyAIPatch,
    rejectAIPatch,
    applyPatch,
    discardPatch,
    editorContent,
    isEditorDirty,
    updateEditorDraft,
    saveEditorFile,
    revertEditorDraft,
    editorSaveStatus,
    editorSaveError,
  } = useWorkspace();

  const [inlineEdit, setInlineEdit] = useState<{
    selection: InlineEditSelection;
    anchorLine: number;
  } | null>(null);

  const fetchAiInlineSuffix = useCallback<AiInlineSuggestFn>(
    async (input, token) => {
      const api = window.bryantlabs;
      if (!api || token.isCancellationRequested) return null;
      try {
        const settings = normalizeProviderSettings(await api.getProviderSettings());
        const prompt = buildInlineSuggestPrompt(input);
        const res = await api.testProvider(settings.provider, prompt);
        if (!res.ok || token.isCancellationRequested) return null;
        return parseInlineSuggestResponse(res.text, input.linePrefix);
      } catch {
        return null;
      }
    },
    [],
  );

  const structuredEditMode =
    editTarget !== null &&
    activePath === editTarget.absPath;

  const patchReviewOverlay = useMemo(
    () =>
      deriveAiPatchReview(aiPatchSession, activePath) ??
      deriveSafeEditPatchReview(pendingPatch, reviewing),
    [aiPatchSession, activePath, pendingPatch, reviewing],
  );

  const directEditMode =
    activeFile !== null &&
    activeFile.result.readable &&
    patchReviewOverlay == null;

  const editable = directEditMode;
  const dirty = activePath != null && isEditorDirty(activePath);

  const handleSave = useCallback(() => {
    void saveEditorFile();
  }, [saveEditorFile]);

  useEffect(() => {
    if (!editable || !dirty) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, editable, handleSave]);

  const patchReview = useMemo(() => {
    if (!patchReviewOverlay) return null;
    const isAi = aiPatchSession != null && activePath === aiPatchSession.absPath;
    return {
      before: patchReviewOverlay.before,
      after: patchReviewOverlay.after,
      onAccept: () => {
        if (isAi) {
          approveAIPatch();
          void applyAIPatch();
          return;
        }
        void applyPatch();
      },
      onReject: () => {
        if (isAi) {
          rejectAIPatch();
          return;
        }
        discardPatch();
      },
    };
  }, [
    patchReviewOverlay,
    aiPatchSession,
    activePath,
    approveAIPatch,
    applyAIPatch,
    rejectAIPatch,
    applyPatch,
    discardPatch,
  ]);

  let body: ReactNode;

  if (!project) {
    body = (
      <EmptyState
        title="No project open"
        description="Open a project from the Explorer to start reading files."
        icon={<FolderOpenIcon />}
      />
    );
  } else if (!activePath) {
    body = <WelcomeEditor />;
  } else if (fileStatus === "loading") {
    body = <EmptyState title="Loading…" description="Reading file contents." />;
  } else if (activeFile && !activeFile.result.readable) {
    body = (
      <EmptyState
        title="Cannot display file"
        description={activeFile.result.reason ?? "This file cannot be shown."}
      />
    );
  } else if (activeFile) {
    const relPath = relativePath(activeFile.node.path, project.path);
    const inlineRunning = patchStatus === "running";
    const bufferContent =
      editorContent(activeFile.node.path) ?? activeFile.result.content ?? "";
    const editorDisplayContent = patchReviewOverlay?.after ?? bufferContent;
    body = (
      <div className="editor editor--monaco">
        <EditorFileTabs />
        <div className="editor__bar">
          <span className="editor__path">{relPath}</span>
          {activeFile.result.language ? (
            <span className="editor__lang">{activeFile.result.language}</span>
          ) : null}
          {patchReviewOverlay ? (
            <span className="editor__patch-badge">Patch review</span>
          ) : dirty ? (
            <span className="editor__patch-badge editor__patch-badge--dirty">Unsaved</span>
          ) : (
            <span
              className={`editor__readonly${editable ? " editor__readonly--edit" : ""}`}
            >
              {editable ? "editable · ⌘S save" : "Monaco · ⌘K inline edit"}
            </span>
          )}
          {editable && dirty ? (
            <div className="editor__save-actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={handleSave}>
                {editorSaveStatus === "saving" ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={revertEditorDraft}
              >
                Revert
              </button>
            </div>
          ) : null}
        </div>
        {structuredEditMode ? <EditToolbar /> : null}
        {editorSaveError ? (
          <p className="edit-toolbar__msg edit-toolbar__msg--error">{editorSaveError}</p>
        ) : null}
        <div className="editor__monaco-wrap">
          <MonacoEditorView
            absPath={activeFile.node.path}
            content={editorDisplayContent}
            language={activeFile.result.language}
            readOnly={!editable}
            relPath={relPath}
            projectSymbols={scan?.symbols ?? []}
            revealTarget={editorReveal}
            onRevealConsumed={clearEditorReveal}
            patchReview={patchReview}
            {...(editable
              ? {
                  onContentChange: (next: string) =>
                    updateEditorDraft(activeFile.node.path, next),
                  onSaveRequest: handleSave,
                  fetchAiInlineSuffix,
                }
              : {})}
            enableInlineEdit={activeFile.result.readable && !patchReviewOverlay}
            onInlineEditRequest={(selection, anchorLine) => {
              setInlineEdit({ selection, anchorLine });
            }}
          />
          <InlineEditPanel
            open={inlineEdit !== null}
            line={inlineEdit?.anchorLine ?? 1}
            relPath={relPath}
            running={inlineRunning}
            onClose={() => setInlineEdit(null)}
            onSubmit={(instruction) => {
              if (!inlineEdit) return;
              void proposeAIPatch(instruction, { selection: inlineEdit.selection }).then(
                () => {
                  setInlineEdit(null);
                },
              );
            }}
          />
        </div>
      </div>
    );
  } else {
    body = (
      <EmptyState title="Nothing to show" description="Select a file to view." />
    );
  }

  if (embedded) {
    return <div className="editor-embedded">{body}</div>;
  }

  return (
    <Panel meta={EDITOR_PANEL} className="panel--editor">
      {body}
    </Panel>
  );
}
