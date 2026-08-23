import type { EditPhasePlan, PersistedEditPhaseCheckpoint } from "@/core/editPhases/types";
import { firstIncompletePhase, resumeEditPhasePlan } from "@/core/editPhases/planPhases";

const STORAGE_PREFIX = "bryantlabs.editPhasePlan.";

export function editPhaseStorageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${projectPath}`;
}

export function serializeEditPhaseCheckpoint(
  projectPath: string,
  plan: EditPhasePlan,
): PersistedEditPhaseCheckpoint {
  return {
    version: 1,
    plan,
    projectPath,
    updatedAt: Date.now(),
  };
}

export function parseEditPhaseCheckpoint(
  raw: unknown,
): PersistedEditPhaseCheckpoint | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as PersistedEditPhaseCheckpoint;
  if (obj.version !== 1 || !obj.plan || !obj.projectPath) return null;
  return obj;
}

export function saveEditPhaseCheckpointLocal(
  projectPath: string,
  plan: EditPhasePlan,
): void {
  try {
    const payload = serializeEditPhaseCheckpoint(projectPath, plan);
    localStorage.setItem(editPhaseStorageKey(projectPath), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function loadEditPhaseCheckpointLocal(
  projectPath: string,
): PersistedEditPhaseCheckpoint | null {
  try {
    const raw = localStorage.getItem(editPhaseStorageKey(projectPath));
    if (!raw) return null;
    return parseEditPhaseCheckpoint(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearEditPhaseCheckpointLocal(projectPath: string): void {
  try {
    localStorage.removeItem(editPhaseStorageKey(projectPath));
  } catch {
    /* ignore */
  }
}

/**
 * Resume from the first incomplete phase without repeating completed ones.
 */
export function prepareResumeFromCheckpoint(
  checkpoint: PersistedEditPhaseCheckpoint,
): { plan: EditPhasePlan; resumePhaseId: string | null } {
  const plan = resumeEditPhasePlan(checkpoint.plan);
  const next = firstIncompletePhase(plan);
  return { plan, resumePhaseId: next?.id ?? null };
}

export function pausePlanForCredits(
  plan: EditPhasePlan,
  reason: string,
): EditPhasePlan {
  return {
    ...plan,
    status: "paused",
    pausedReason: reason,
  };
}

export function cancelBetweenPhases(plan: EditPhasePlan): EditPhasePlan {
  // Completed phases stay completed; current pending phase becomes cancelled.
  const nextStates = { ...plan.phaseStates };
  for (const phase of plan.phases) {
    const state = nextStates[phase.id];
    if (!state) continue;
    if (state.status === "pending" || state.status === "generating") {
      nextStates[phase.id] = {
        ...state,
        status: "cancelled",
        error: "Cancelled between phases",
        completedAt: Date.now(),
      };
    }
  }
  return {
    ...plan,
    status: "cancelled",
    pausedReason: "User cancelled",
    phaseStates: nextStates,
  };
}
