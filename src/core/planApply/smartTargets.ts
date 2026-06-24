import type { ProjectScan } from "@/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import { rankSmartFiles } from "@/core/fileSelection";
import type { PlanApplyTargetCandidate } from "@/core/planApply/targetPolicy";

export const SMART_SELECTION_MAX = 8;

export function mergeCandidatesWithSmartSelection(
  candidates: readonly PlanApplyTargetCandidate[],
  seen: Set<string>,
  scan: ProjectScan,
  prompt: string,
  opts: {
    projectPath: string | null;
    projectMemory: ProjectMemory;
    sessionMemory: SessionMemorySnapshot;
    maxFiles?: number;
  },
): PlanApplyTargetCandidate[] {
  const trimmed = prompt.trim();
  if (!trimmed) return [...candidates];

  const selection = rankSmartFiles(trimmed, scan, {
    projectPath: opts.projectPath,
    projectMemory: opts.projectMemory,
    sessionMemory: opts.sessionMemory,
    maxFiles: opts.maxFiles ?? SMART_SELECTION_MAX,
  });

  const rankedCandidates: PlanApplyTargetCandidate[] = [];
  for (const file of selection.files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    rankedCandidates.push({
      relPath: file.path,
      absPath: file.absPath,
      planReason: file.primaryReason,
      selectionReason: `Smart selection (score ${file.score}): ${file.primaryReason}`,
    });
  }

  const existing = [...candidates];
  const merged = [...rankedCandidates, ...existing];
  const byPath = new Map<string, PlanApplyTargetCandidate>();
  for (const c of merged) {
    const prev = byPath.get(c.relPath);
    if (!prev) {
      byPath.set(c.relPath, c);
      continue;
    }
    if (c.selectionReason.includes("Smart selection")) {
      byPath.set(c.relPath, c);
    }
  }
  return [...byPath.values()];
}
