import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MonacoEditorView } from "@/components/editor/MonacoEditorView";
import type { OpenFile } from "@/app/workspace/types";
import type { InlineEditSelection } from "@/core/editor/inlineEdit";
import type { SymbolEntry } from "@/types";
import type { AiInlineSuggestFn } from "@/monaco/inlineTabCompletion";
import type { PatchReviewDecorationInput } from "@/monaco/patchReviewDecorations";

function relativePath(fullPath: string, root: string): string {
  if (fullPath.startsWith(root)) {
    return fullPath.slice(root.length).replace(/^[/\\]/, "");
  }
  return fullPath;
}

export interface EditorPaneViewProps {
  readonly projectRoot: string;
  readonly openFile: OpenFile;
  readonly content: string;
  readonly editable: boolean;
  readonly dirty: boolean;
  readonly projectSymbols: readonly SymbolEntry[];
  readonly revealTarget: { readonly line: number; readonly column: number } | null;
  readonly onRevealConsumed: () => void;
  readonly onContentChange?: (next: string) => void;
  readonly onSaveRequest?: () => void;
  readonly headerExtra?: ReactNode;
  readonly compact?: boolean;
  readonly patchReview?: PatchReviewDecorationInput | null;
  readonly enableInlineEdit?: boolean;
  readonly fetchAiInlineSuffix?: AiInlineSuggestFn;
  readonly onInlineEditRequest?: (selection: InlineEditSelection, anchorLine: number) => void;
  readonly patchReviewLabel?: string | null;
}

/** Single Monaco pane (primary or split secondary). */
export function EditorPaneView({
  projectRoot,
  openFile,
  content,
  editable,
  dirty,
  projectSymbols,
  revealTarget,
  onRevealConsumed,
  onContentChange,
  onSaveRequest,
  headerExtra,
  compact = false,
  patchReview = null,
  enableInlineEdit = false,
  fetchAiInlineSuffix,
  onInlineEditRequest,
  patchReviewLabel = null,
}: EditorPaneViewProps) {
  const relPath = relativePath(openFile.node.path, projectRoot);

  return (
    <div className={`editor-pane${compact ? " editor-pane--compact" : ""}`}>
      <div className="editor__bar editor-pane__bar">
        <span className="editor__path">{relPath}</span>
        {openFile.result.language ? (
          <span className="editor__lang">{openFile.result.language}</span>
        ) : null}
        {patchReviewLabel ? (
          <span className="editor__patch-badge">{patchReviewLabel}</span>
        ) : dirty ? (
          <span className="editor__patch-badge editor__patch-badge--dirty">Unsaved</span>
        ) : (
          <span className={`editor__readonly${editable ? " editor__readonly--edit" : ""}`}>
            {editable ? "editable" : "read-only"}
          </span>
        )}
        {headerExtra}
      </div>
      <div className="editor__monaco-wrap editor-pane__monaco">
        <MonacoEditorView
          absPath={openFile.node.path}
          content={content}
          language={openFile.result.language}
          readOnly={!editable}
          relPath={relPath}
          projectSymbols={projectSymbols}
          revealTarget={revealTarget}
          onRevealConsumed={onRevealConsumed}
          patchReview={patchReview}
          {...(editable && onContentChange
            ? {
                onContentChange,
                onSaveRequest,
                ...(fetchAiInlineSuffix ? { fetchAiInlineSuffix } : {}),
              }
            : {})}
          {...(enableInlineEdit && editable && onInlineEditRequest
            ? { enableInlineEdit: true, onInlineEditRequest }
            : { enableInlineEdit: false })}
        />
      </div>
    </div>
  );
}

export function useEditorSplitResize(initialRatio: number) {
  const [ratio, setRatio] = useState(initialRatio);
  const dragging = useRef(false);

  const onHandleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const container = document.querySelector(".editor-split");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const next = (event.clientX - rect.left) / rect.width;
      setRatio(Math.min(0.75, Math.max(0.25, next)));
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return { ratio, setRatio, onHandleMouseDown };
}
