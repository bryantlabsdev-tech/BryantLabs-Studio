import type { PlanFile } from "@/core/planner/types";

const MAX_REASONS = 6;

/** Merge heuristic and repository rankings (keeps the higher score per file). */
export function mergePlanRankings(
  heuristic: readonly PlanFile[],
  repository: readonly PlanFile[],
): PlanFile[] {
  const map = new Map<string, PlanFile>();

  const mergeOne = (file: PlanFile) => {
    const existing = map.get(file.path);
    if (!existing) {
      map.set(file.path, {
        ...file,
        reasons: [...file.reasons].slice(0, MAX_REASONS),
      });
      return;
    }
    const reasons = [...existing.reasons];
    for (const r of file.reasons) {
      if (reasons.length >= MAX_REASONS) break;
      if (!reasons.includes(r)) reasons.push(r);
    }
    map.set(file.path, {
      path: file.path,
      absPath: file.absPath,
      score: Math.max(existing.score, file.score),
      reasons,
    });
  };

  for (const f of heuristic) mergeOne(f);
  for (const f of repository) mergeOne(f);

  return [...map.values()].sort(
    (a, b) => b.score - a.score || a.path.localeCompare(b.path),
  );
}
