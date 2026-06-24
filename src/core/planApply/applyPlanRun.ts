/** Monotonic Apply Plan attempt id (propose or apply phase). */
export function createApplyPlanRunId(): string {
  return `apply-plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * True when an async Apply Plan result belongs to a superseded or finalized run
 * and must not update session, latest action, or failure reports.
 */
export function shouldIgnoreStaleApplyPlanResult(
  resultRunId: string,
  activeRunId: string | null,
  completedRunId: string | null,
): boolean {
  if (activeRunId !== null && resultRunId !== activeRunId) {
    return true;
  }
  if (completedRunId !== null && resultRunId !== completedRunId) {
    return true;
  }
  return false;
}
