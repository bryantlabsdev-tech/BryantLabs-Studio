import type { PlanApplyFileEntry, PlanApplySession } from "@/core/planApply";

const REVIEW_PHASES = new Set(["proposing", "review", "waiting_for_review"]);

export interface PlanApplyEditorSyncInput {
  readonly session: PlanApplySession | null;
  readonly projectPath: string | null | undefined;
}

export interface PlanApplyEditorSyncDecision {
  readonly reveal: boolean;
  readonly nextKey: string | null;
  readonly target: PlanApplyFileEntry | null;
}

export function resolvePlanApplyEditorSyncTarget(
  input: PlanApplyEditorSyncInput,
): PlanApplyFileEntry | null {
  const session = input.session;
  if (!session || !input.projectPath) return null;
  if (!REVIEW_PHASES.has(session.phase)) return null;

  const readyChanged = session.files.filter(
    (file) => file.status === "ready" && file.diffStats?.changed,
  );
  if (readyChanged.length === 0) return null;

  return (
    readyChanged.find((file) => file.relPath === session.selectedRelPath) ??
    readyChanged[0] ??
    null
  );
}

/**
 * Auto-focus the Diff review surface when a review target first appears
 * (or the selected file changes). Opening the file must not steal the tab
 * away from Accept all. Re-evaluating the same session must not override a
 * tab the user already switched to.
 */
export function evaluatePlanApplyEditorSync(
  lastKey: string | null,
  input: PlanApplyEditorSyncInput,
): PlanApplyEditorSyncDecision {
  const session = input.session;
  if (!session) {
    return { reveal: false, nextKey: null, target: null };
  }

  const target = resolvePlanApplyEditorSyncTarget(input);
  if (!target) {
    return { reveal: false, nextKey: lastKey, target: null };
  }

  const nextKey = `${session.applyRunId}:${target.absPath}`;
  if (nextKey === lastKey) {
    return { reveal: false, nextKey, target };
  }

  return { reveal: true, nextKey, target };
}
