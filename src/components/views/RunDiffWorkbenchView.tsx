import type { ReactNode } from "react";
import type { ArtifactDiffFileView } from "@/core/agent/artifactDiffView";
import { DiffRowsView } from "@/components/editor/DiffRowsView";

function MiniPreviewLines({
  preview,
  linesAdded,
  linesRemoved,
}: {
  readonly preview: readonly { type: string; text: string }[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
}) {
  if (preview.length === 0) {
    return (
      <p className="plan__muted">
        Diff snapshot unavailable for this run. Stats: +{linesAdded} / −{linesRemoved}
      </p>
    );
  }

  return (
    <ul className="run-conversation__diff-lines">
      {preview.map((line, index) => (
        <li
          key={`${line.type}-${index}`}
          className={`run-conversation__diff-line run-conversation__diff-line--${line.type}`}
        >
          <span className="run-conversation__diff-sign">
            {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
          </span>
          <span>{line.text || " "}</span>
        </li>
      ))}
    </ul>
  );
}

export interface RunDiffWorkbenchViewProps {
  readonly files: readonly ArtifactDiffFileView[];
  readonly selectedPath: string | null;
  readonly onSelectPath: (path: string) => void;
  readonly header?: ReactNode;
  readonly testId?: string;
  readonly emptyHint?: string;
}

export function RunDiffWorkbenchView({
  files,
  selectedPath,
  onSelectPath,
  header = null,
  testId = "run-diff-workbench",
  emptyHint = "No file changes recorded for this run.",
}: RunDiffWorkbenchViewProps) {
  const selected =
    files.find((file) => file.path === selectedPath) ?? files[0] ?? null;

  if (files.length === 0) {
    return <p className="center-panel__hint">{emptyHint}</p>;
  }

  return (
    <div className="artifact-diff" data-testid={testId}>
      {header}
      <div className="artifact-diff__layout">
        <aside className="artifact-diff__files" aria-label="Changed files">
          <p className="artifact-diff__files-label">
            {files.length} file{files.length === 1 ? "" : "s"}
          </p>
          <ul className="artifact-diff__file-list">
            {files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  className={`artifact-diff__file${
                    selected?.path === file.path ? " artifact-diff__file--active" : ""
                  }`}
                  onClick={() => onSelectPath(file.path)}
                >
                  <span>{file.path}</span>
                  <span className="artifact-diff__file-stats plan__muted">
                    +{file.linesAdded} / −{file.linesRemoved}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="artifact-diff__content">
          {selected ? (
            <>
              <h4 className="artifact-diff__path">{selected.path}</h4>
              {selected.hasFullDiff && selected.before !== null && selected.after !== null ? (
                <DiffRowsView before={selected.before} after={selected.after} />
              ) : (
                <MiniPreviewLines
                  preview={selected.preview}
                  linesAdded={selected.linesAdded}
                  linesRemoved={selected.linesRemoved}
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
