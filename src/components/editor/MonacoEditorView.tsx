import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ensureMonacoModel } from "@/monaco/typescriptProject";
import { monacoLanguageId } from "@/monaco/language";
import {
  disposeProjectSymbolCompletions,
  registerProjectSymbolCompletions,
} from "@/monaco/symbolCompletion";
import {
  disposeInlineTabCompletions,
  registerInlineTabCompletions,
  type AiInlineSuggestFn,
} from "@/monaco/inlineTabCompletion";
import type { InlineEditSelection } from "@/core/editor/inlineEdit";
import { selectionFromMonaco } from "@/core/editor/inlineEdit";
import type { SymbolEntry } from "@/types";
import { applyPatchReviewDecorations } from "@/monaco/patchReviewDecorations";
import type { PatchReviewDecorationInput } from "@/monaco/patchReviewDecorations";

export interface MonacoEditorViewProps {
  readonly absPath: string;
  readonly content: string;
  readonly language: string | null;
  readonly readOnly?: boolean;
  readonly relPath?: string;
  readonly enableInlineEdit?: boolean;
  readonly projectSymbols?: readonly SymbolEntry[];
  readonly fetchAiInlineSuffix?: AiInlineSuggestFn;
  readonly onInlineEditRequest?: (selection: InlineEditSelection, anchorLine: number) => void;
  readonly onContentChange?: (content: string) => void;
  readonly onSaveRequest?: () => void;
  readonly revealTarget?: { readonly line: number; readonly column: number } | null;
  readonly onRevealConsumed?: () => void;
  readonly patchReview?: PatchReviewDecorationInput | null;
}

export function MonacoEditorView({
  absPath,
  content,
  language,
  readOnly = true,
  relPath,
  enableInlineEdit = false,
  projectSymbols = [],
  fetchAiInlineSuffix,
  onInlineEditRequest,
  onContentChange,
  onSaveRequest,
  revealTarget,
  onRevealConsumed,
  patchReview,
}: MonacoEditorViewProps) {
  const path = useMemo(() => absPath, [absPath]);
  const languageId = useMemo(
    () => monacoLanguageId(language, absPath),
    [language, absPath],
  );
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const patchReviewRef = useRef(patchReview);
  patchReviewRef.current = patchReview;
  const onInlineEditRef = useRef(onInlineEditRequest);
  onInlineEditRef.current = onInlineEditRequest;

  useEffect(() => {
    ensureMonacoModel(absPath, content, language);
  }, [absPath, content, language]);

  useEffect(() => {
    if (!revealTarget) return;
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(revealTarget.line);
    ed.setPosition({
      lineNumber: revealTarget.line,
      column: Math.max(1, revealTarget.column),
    });
    ed.focus();
    onRevealConsumed?.();
  }, [revealTarget, absPath, onRevealConsumed]);

  useEffect(() => {
    const ed = editorRef.current;
    const monacoApi = monacoRef.current;
    if (!ed || !monacoApi) return;
    const disposable = applyPatchReviewDecorations(
      monacoApi,
      ed,
      patchReview ?? null,
    );
    return () => disposable.dispose();
  }, [patchReview, absPath, content]);

  const requestInlineEdit = useCallback(() => {
    const ed = editorRef.current;
    const rel = relPath;
    if (!ed || !rel || !onInlineEditRef.current) return;
    const model = ed.getModel();
    const sel = ed.getSelection();
    if (!model || !sel) return;
    const text = model.getValueInRange(sel);
    const selection = selectionFromMonaco(
      rel,
      sel.startLineNumber,
      sel.endLineNumber,
      text,
    );
    if (!selection) {
      const line = model.getLineContent(sel.startLineNumber).trim();
      if (!line) return;
      onInlineEditRef.current(
        {
          relPath: rel,
          startLine: sel.startLineNumber,
          endLine: sel.startLineNumber,
          text: line,
        },
        sel.startLineNumber,
      );
      return;
    }
    onInlineEditRef.current(selection, sel.startLineNumber);
  }, [relPath]);

  const onMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;
      editorInstance.updateOptions({
        readOnly,
        fontSize: 13,
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        lineNumbers: "on",
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        wordWrap: "off",
        automaticLayout: true,
        padding: { top: 8 },
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        smoothScrolling: true,
        tabCompletion: "on",
        inlineSuggest: { enabled: true },
        quickSuggestions: {
          other: true,
          comments: false,
          strings: false,
        },
      });
      monaco.editor.setTheme("bryantlabs-dark");

      if (projectSymbols.length > 0 || fetchAiInlineSuffix) {
        registerProjectSymbolCompletions(monaco, projectSymbols);
        registerInlineTabCompletions(
          monaco,
          projectSymbols,
          fetchAiInlineSuffix,
          relPath,
        );
      }

      if (enableInlineEdit && relPath) {
        editorInstance.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
          () => requestInlineEdit(),
        );
      }

      if (!readOnly && onSaveRequest) {
        editorInstance.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => onSaveRequest(),
        );
      }
    },
    [enableInlineEdit, fetchAiInlineSuffix, onContentChange, onSaveRequest, projectSymbols, readOnly, relPath, requestInlineEdit],
  );

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  useEffect(
    () => () => {
      disposeProjectSymbolCompletions();
      disposeInlineTabCompletions();
    },
    [],
  );

  return (
    <div className="monaco-editor-root">
      <Editor
        path={path}
        value={content}
        language={languageId}
        theme="bryantlabs-dark"
        loading={
          <p className="monaco-editor-root__loading plan__muted">Loading editor…</p>
        }
        options={{
          readOnly,
          automaticLayout: true,
        }}
        onMount={onMount}
        onChange={(next) => {
          if (!readOnly && onContentChange && next != null) {
            onContentChange(next);
          }
        }}
      />
    </div>
  );
}
