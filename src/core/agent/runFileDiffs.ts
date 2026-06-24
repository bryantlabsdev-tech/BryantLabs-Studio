import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import { computeDiff } from "@/core/editor";
import type { DiffRow } from "@/core/editor/types";
import type { GeneratedFile } from "@/core/greenfield/types";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { PlanApplyFileEntry, PlanApplySession } from "@/core/planApply/types";

/** Greenfield-only: stale generatedFiles must not become follow-up trace diffs. */
export function resolveAllowGeneratedFileDiffs(run: GreenfieldRunSnapshot): boolean {
  if (run.actionType === "greenfield") return true;
  const route = run.runTimeline?.route;
  if (route === "greenfield") return true;
  if ((run.generatedFiles?.length ?? 0) > 0 && run.genStatus === "done") return true;
  if (
    run.filesWritten.length >= 5 &&
    GREENFIELD_FILE_PATHS.some((path) => run.filesWritten.includes(path))
  ) {
    return true;
  }
  return false;
}

export interface RunFileDiffLine {
  readonly type: "add" | "remove" | "context";
  readonly text: string;
}

export interface RunFileDiff {
  readonly path: string;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly preview: readonly RunFileDiffLine[];
  readonly before?: string;
  readonly after?: string;
}

const MAX_PREVIEW_LINES = 14;

function diffRowToPreviewLine(row: DiffRow): RunFileDiffLine {
  return {
    type: row.type === "add" ? "add" : row.type === "remove" ? "remove" : "context",
    text: row.text,
  };
}

function buildPreview(rows: DiffRow[]): RunFileDiffLine[] {
  const changed = rows.filter((row) => row.type === "add" || row.type === "remove");
  const source = changed.length > 0 ? changed : rows;
  return source.slice(0, MAX_PREVIEW_LINES).map(diffRowToPreviewLine);
}

function afterContent(file: PlanApplySession["files"][number]): string {
  return (
    file.proposal?.newContent ??
    file.patch?.proposal?.newContent ??
    file.basisContent ??
    ""
  );
}

function countDiffLines(rows: DiffRow[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.type === "add") added += 1;
    if (row.type === "remove") removed += 1;
  }
  return { added, removed };
}

function diffsFromGeneratedFiles(
  generatedFiles: readonly GeneratedFile[],
): RunFileDiff[] {
  return generatedFiles.map((file) => {
    const before = "";
    const after = file.content;
    const rows = computeDiff(before, after);
    const { added, removed } = countDiffLines(rows);
    return {
      path: file.path,
      linesAdded: added,
      linesRemoved: removed,
      preview: buildPreview(rows),
      before,
      after,
    };
  });
}

function buildRunFileDiff(
  path: string,
  before: string,
  after: string,
  stats?: { added: number; removed: number },
): RunFileDiff {
  const rows = computeDiff(before, after);
  const counted = countDiffLines(rows);
  return {
    path,
    linesAdded: stats?.added ?? counted.added,
    linesRemoved: stats?.removed ?? counted.removed,
    preview: buildPreview(rows),
    before,
    after,
  };
}

function hasMeaningfulDiff(diff: RunFileDiff): boolean {
  return (
    diff.linesAdded + diff.linesRemoved > 0 ||
    (diff.before?.length ?? 0) > 0 ||
    (diff.after?.length ?? 0) > 0
  );
}

/** Freeze before/after content from an apply session before it is cleared post-write. */
export function freezePlanApplyFileDiffs(
  files: readonly PlanApplyFileEntry[],
  appliedRelPaths: readonly string[],
): RunFileDiff[] {
  const applied = new Set(appliedRelPaths);
  const diffs: RunFileDiff[] = [];
  for (const file of files) {
    if (!file.relPath || !applied.has(file.relPath)) continue;
    const before = file.basisContent ?? "";
    const after = file.proposal?.newContent ?? file.patch?.proposal?.newContent ?? before;
    if (!after && !before) continue;
    diffs.push(
      buildRunFileDiff(file.relPath, before, after, file.diffStats ?? undefined),
    );
  }
  return diffs;
}

function diffsFromPlanApplySession(session: PlanApplySession): RunFileDiff[] {
  const fromSession: RunFileDiff[] = [];
  for (const file of session.files) {
    if (!file.relPath) continue;
    if (!file.diffStats?.changed && file.status !== "ready" && file.status !== "proposing") {
      continue;
    }
    const before = file.basisContent ?? "";
    const after = afterContent(file);
    fromSession.push(
      buildRunFileDiff(file.relPath, before, after, file.diffStats ?? undefined),
    );
  }
  return fromSession;
}

export function extractRunFileDiffs(input: {
  readonly card: AgentRunCardViewModel;
  readonly planApplySession?: PlanApplySession | null;
  readonly generatedFiles?: readonly GeneratedFile[] | null;
  readonly appliedFileDiffs?: readonly RunFileDiff[] | null;
  readonly artifactFileDiffs?: readonly RunFileDiff[] | null;
  readonly allowGeneratedFiles?: boolean;
}): RunFileDiff[] {
  const applied = (input.appliedFileDiffs ?? []).filter(hasMeaningfulDiff);
  if (applied.length > 0) return applied;

  const session = input.planApplySession;
  if (session) {
    const fromSession = diffsFromPlanApplySession(session);
    if (fromSession.length > 0) return fromSession;
  }

  const artifactDiffs = (input.artifactFileDiffs ?? []).filter(hasMeaningfulDiff);
  if (artifactDiffs.length > 0) return artifactDiffs;

  if (
    input.allowGeneratedFiles !== false &&
    input.generatedFiles &&
    input.generatedFiles.length > 0
  ) {
    return diffsFromGeneratedFiles(input.generatedFiles);
  }

  const impact = input.card.patchImpact;
  const paths =
    impact.files.length > 0
      ? impact.files
      : input.card.filesModified.map((path) => ({ path, added: 0, removed: 0 }));

  return paths.map((file) => ({
    path: file.path,
    linesAdded: file.added,
    linesRemoved: file.removed,
    preview: [],
  }));
}
