import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";

export interface ArtifactDiffFileView {
  readonly path: string;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly before: string | null;
  readonly after: string | null;
  readonly hasFullDiff: boolean;
  readonly preview: RunFileDiff["preview"];
}

function toFileView(file: RunFileDiff): ArtifactDiffFileView {
  const hasFullDiff = file.before !== undefined && file.after !== undefined;
  return {
    path: file.path,
    linesAdded: file.linesAdded,
    linesRemoved: file.linesRemoved,
    before: file.before ?? null,
    after: file.after ?? null,
    hasFullDiff,
    preview: file.preview,
  };
}

function fileViewHasDiffContent(file: ArtifactDiffFileView): boolean {
  return (
    file.hasFullDiff ||
    file.preview.length > 0 ||
    file.linesAdded > 0 ||
    file.linesRemoved > 0
  );
}

export function diffableFilesFromArtifact(artifact: AgentRunArtifact): ArtifactDiffFileView[] {
  if (artifact.fileDiffs.length > 0) {
    return artifact.fileDiffs.map(toFileView);
  }
  return artifact.filesModified.map((path) => ({
    path,
    linesAdded: 0,
    linesRemoved: 0,
    before: null,
    after: null,
    hasFullDiff: false,
    preview: [],
  }));
}

/** True when the artifact has line-level or preview diff content, not just file paths. */
export function artifactHasDiffContent(artifact: AgentRunArtifact): boolean {
  if (artifact.fileDiffs.length === 0) return false;
  return diffableFilesFromArtifact(artifact).some(fileViewHasDiffContent);
}

export function diffableFilesFromRunDiffs(
  diffs: readonly RunFileDiff[],
): ArtifactDiffFileView[] {
  return diffs.map(toFileView);
}

export function hasDiffFileViews(files: readonly ArtifactDiffFileView[]): boolean {
  return files.some(fileViewHasDiffContent);
}

export function resolveSelectedDiffPath(
  files: readonly ArtifactDiffFileView[],
  preferredPath: string | null,
): string | null {
  if (preferredPath && files.some((file) => file.path === preferredPath)) {
    return preferredPath;
  }
  return files[0]?.path ?? null;
}
