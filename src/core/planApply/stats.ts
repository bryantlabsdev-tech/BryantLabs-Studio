import { computeDiff, type DiffRow } from "@/core/editor";
import type { PlanApplyDiffStats, PlanApplyTotals } from "@/core/planApply/types";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

export function diffLineStats(before: string, after: string): PlanApplyDiffStats {
  const rows = computeDiff(before, after);
  return diffStatsFromRows(rows, before !== after);
}

export function diffStatsFromRows(
  rows: DiffRow[],
  changed: boolean,
): PlanApplyDiffStats {
  return {
    added: rows.filter((r) => r.type === "add").length,
    removed: rows.filter((r) => r.type === "remove").length,
    changed,
  };
}

export function computePlanApplyTotals(
  files: readonly PlanApplyFileEntry[],
  appliedRelPaths?: readonly string[],
): PlanApplyTotals {
  let linesAdded = 0;
  let linesRemoved = 0;
  let filesChanged = 0;

  for (const file of files) {
    if (!file.diffStats?.changed) continue;
    filesChanged += 1;
    linesAdded += file.diffStats.added;
    linesRemoved += file.diffStats.removed;
  }

  const appliedSet = appliedRelPaths ? new Set(appliedRelPaths) : null;
  const filesApplied = appliedSet
    ? files.filter((f) => appliedSet.has(f.relPath)).length
    : files.filter((f) => f.decision === "approved" && f.status === "ready").length;

  return {
    filesChanged,
    linesAdded,
    linesRemoved,
    filesApproved: files.filter((f) => f.decision === "approved").length,
    filesApplied,
  };
}
