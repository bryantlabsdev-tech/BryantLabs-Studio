import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EditorPaneView, useEditorSplitResize } from "@/components/editor/EditorPaneView";
import {
  loadEditorSplitPrefs,
  saveEditorSplitPrefs,
} from "@/core/layout/editorSplit";
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
  derivePlanApplyPatchReview,
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
    openFileTabs,
    openFilesByPath,
    planApplySession,
    setPlanApplyFileDecision,
    applyApprovedPlanFiles,
  } = useWorkspace();

  const [splitPrefs, setSplitPrefs] = useState(loadEditorSplitPrefs);
  const { ratio, onHandleMouseDown } = useEditorSplitResize(splitPrefs.ratio);

  useEffect(() => {
    saveEditorSplitPrefs({ ...splitPrefs, ratio });
  }, [splitPrefs, ratio]);

  useEffect(() => {
    const onToggle = () => {
      setSplitPrefs((prev) => {
        const enabled = !prev.enabled;
        if (!enabled) return { ...prev, enabled };
        const secondary =
          prev.secondaryPath &&
          prev.secondaryPath !== activePath &&
          openFilesByPath[prev.secondaryPath]
            ? prev.secondaryPath
            : openFileTabs.find((p) => p !== activePath && openFilesByPath[p]) ?? null;
        return { ...prev, enabled, secondaryPath: secondary };
      });
    };
    window.addEventListener("bryantlabs:toggle-editor-split", onToggle);
    return () => window.removeEventListener("bryantlabs:toggle-editor-split", onToggle);
  }, [activePath, openFileTabs, openFilesByPath]);

  const setSecondaryPath = useCallback((path: string | null) => {
    setSplitPrefs((prev) => ({ ...prev, secondaryPath: path, enabled: path != null || prev.enabled }));
  }, []);

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
      derivePlanApplyPatchReview(planApplySession, activePath) ??
      deriveSafeEditPatchReview(pendingPatch, reviewing),
    [aiPatchSession, activePath, planApplySession, pendingPatch, reviewing],
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
    const planApplyFile =
      planApplySession?.files.find((f) => f.absPath === activePath && f.status === "ready") ??
      null;
    const isPlanApply = planApplyFile != null;
    return {
      before: patchReviewOverlay.before,
      after: patchReviewOverlay.after,
      onAccept: () => {
        if (isPlanApply && planApplyFile) {
          void applyApprovedPlanFiles({ approveRelPaths: [planApplyFile.relPath] });
          return;
        }
        if (isAi) {
          approveAIPatch();
          void applyAIPatch();
          return;
        }
        void applyPatch();
      },
      onReject: () => {
        if (isPlanApply && planApplyFile) {
          setPlanApplyFileDecision(planApplyFile.relPath, "rejected");
          return;
        }
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
    planApplySession,
    setPlanApplyFileDecision,
    applyApprovedPlanFiles,
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
    body = (
      <EmptyState
        branded
        title="Loading…"
        description="Reading file contents."
      />
    );
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
    const secondaryFile =
      splitPrefs.secondaryPath != null
        ? openFilesByPath[splitPrefs.secondaryPath] ?? null
        : null;
    const secondaryContent =
      secondaryFile != null
        ? (editorContent(secondaryFile.node.path) ??
          secondaryFile.result.content ??
          "")
        : "";
    const secondaryDirty =
      secondaryFile != null && isEditorDirty(secondaryFile.node.path);
    const secondaryEditable =
      secondaryFile != null && secondaryFile.result.readable && patchReviewOverlay == null;

    const splitToggle = (
      <button
        type="button"
        className={`btn btn--ghost btn--sm${splitPrefs.enabled ? " btn--active" : ""}`}
        title="Toggle split editor (⌘\\)"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("bryantlabs:toggle-editor-split"))
        }
      >
        Split
      </button>
    );

    const primaryPane = (
      <div className="editor-split__primary">
        <EditorPaneView
          projectRoot={project.path}
          openFile={activeFile}
          content={editorDisplayContent}
          editable={editable}
          dirty={dirty}
          projectSymbols={scan?.symbols ?? []}
          revealTarget={editorReveal}
          onRevealConsumed={clearEditorReveal}
          patchReview={patchReview}
          patchReviewLabel={patchReviewOverlay ? "Patch review" : null}
          enableInlineEdit={activeFile.result.readable && !patchReviewOverlay}
          fetchAiInlineSuffix={fetchAiInlineSuffix}
          onInlineEditRequest={(selection, anchorLine) => {
            setInlineEdit({ selection, anchorLine });
          }}
          {...(editable
            ? {
                onContentChange: (next: string) =>
                  updateEditorDraft(activeFile.node.path, next),
                onSaveRequest: handleSave,
              }
            : {})}
          headerExtra={
            <>
              {splitToggle}
              {editable && dirty ? (
                <div className="editor__save-actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={handleSave}>
                    {editorSaveStatus === "saving" ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={revertEditorDraft}>
                    Revert
                  </button>
                </div>
              ) : null}
            </>
          }
        />
        <InlineEditPanel
          open={inlineEdit !== null}
          line={inlineEdit?.anchorLine ?? 1}
          relPath={relPath}
          running={inlineRunning}
          onClose={() => setInlineEdit(null)}
          onSubmit={(instruction) => {
            if (!inlineEdit) return;
            void proposeAIPatch(instruction, { selection: inlineEdit.selection }).then(() => {
              setInlineEdit(null);
            });
          }}
        />
      </div>
    );

    body = (
      <div className="editor editor--monaco">
        <EditorFileTabs />
        {structuredEditMode ? <EditToolbar /> : null}
        {editorSaveError ? (
          <p className="edit-toolbar__msg edit-toolbar__msg--error">{editorSaveError}</p>
        ) : null}
        {splitPrefs.enabled ? (
          <div className="editor-split">
            <div className="editor-split__pane" style={{ flexBasis: `${ratio * 100}%` }}>
              {primaryPane}
            </div>
            <div
              className="editor-split__handle"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={onHandleMouseDown}
            />
            <div className="editor-split__pane editor-split__pane--secondary">
              {secondaryFile ? (
                <EditorPaneView
                  projectRoot={project.path}
                  openFile={secondaryFile}
                  content={secondaryContent}
                  editable={secondaryEditable}
                  dirty={secondaryDirty}
                  projectSymbols={scan?.symbols ?? []}
                  revealTarget={null}
                  onRevealConsumed={clearEditorReveal}
                  compact
                  {...(secondaryEditable
                    ? {
                        onContentChange: (next: string) =>
                          updateEditorDraft(secondaryFile.node.path, next),
                        onSaveRequest: () => void saveEditorFile(secondaryFile.node.path),
                      }
                    : {})}
                  headerExtra={
                    <select
                      className="editor-split__picker"
                      value={splitPrefs.secondaryPath ?? ""}
                      onChange={(e) => setSecondaryPath(e.target.value || null)}
                      aria-label="Secondary editor file"
                    >
                      {openFileTabs
                        .filter((p) => p !== activePath)
                        .map((p) => (
                          <option key={p} value={p}>
                            {relativePath(p, project.path)}
                          </option>
                        ))}
                    </select>
                  }
                />
              ) : (
                <div className="editor-split__empty">
                  <p className="plan__muted">Open another file for split view.</p>
                  {openFileTabs
                    .filter((p) => p !== activePath && openFilesByPath[p])
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setSecondaryPath(p)}
                      >
                        {relativePath(p, project.path)}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="editor__monaco-wrap">
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
              {splitToggle}
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
        )}
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
