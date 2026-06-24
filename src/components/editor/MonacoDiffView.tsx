import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { useCallback, useMemo } from "react";
import { monacoLanguageId } from "@/monaco/language";

export interface MonacoDiffViewProps {
  readonly relPath: string;
  readonly original: string;
  readonly modified: string;
  readonly language: string | null;
}

export function MonacoDiffView({
  relPath,
  original,
  modified,
  language,
}: MonacoDiffViewProps) {
  const languageId = useMemo(
    () => monacoLanguageId(language, relPath),
    [language, relPath],
  );

  const onMount: DiffOnMount = useCallback((_editor, monaco) => {
    monaco.editor.setTheme("bryantlabs-dark");
  }, []);

  return (
    <div className="monaco-diff-root">
      <DiffEditor
        original={original}
        modified={modified}
        language={languageId}
        theme="bryantlabs-dark"
        loading={
          <p className="monaco-editor-root__loading plan__muted">Loading diff…</p>
        }
        onMount={onMount}
        options={{
          readOnly: true,
          automaticLayout: true,
          renderSideBySide: true,
          fontSize: 13,
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
        }}
      />
    </div>
  );
}
