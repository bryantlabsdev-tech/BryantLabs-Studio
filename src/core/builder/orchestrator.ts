import type {
  BuilderApprovalMode,
  BuilderPhase,
  BuilderPhaseStatus,
} from "@/core/builder/types";

export function phaseNeedsApproval(
  phase: BuilderPhase,
  mode: BuilderApprovalMode,
): boolean {
  if (mode === "autonomous") return false;
  if (mode === "manual") return true;
  return phase.major;
}

export function nextPendingPhase(
  phases: readonly BuilderPhase[],
): BuilderPhase | null {
  return phases.find((p) => p.status === "pending") ?? null;
}

export function updatePhase(
  phases: BuilderPhase[],
  phaseId: string,
  patch: Partial<BuilderPhase>,
): BuilderPhase[] {
  return phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p));
}

export function countPhasesByStatus(
  phases: readonly BuilderPhase[],
  status: BuilderPhaseStatus,
): number {
  return phases.filter((p) => p.status === status).length;
}

export function mergeUniqueFiles(
  existing: readonly string[],
  added: readonly string[],
  created: readonly string[],
): { modified: string[]; created: string[] } {
  const modifiedSet = new Set(existing);
  const createdSet = new Set(created);
  for (const f of added) {
    if (createdSet.has(f)) continue;
    modifiedSet.add(f);
  }
  for (const f of created) createdSet.add(f);
  return {
    modified: [...modifiedSet],
    created: [...createdSet],
  };
}
