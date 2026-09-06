export type SubmitOperationAcquireResult =
  | { readonly ok: true; readonly operationId: string }
  | { readonly ok: false; readonly reason: "duplicate" | "in_flight" };

export interface SubmitOperationGate {
  inFlightOperationId: string | null;
  followUpAccepted: boolean;
}

export function createSubmitOperationId(prefix = "submit"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same operation ID executes once; a different ID is rejected while one is in flight. */
export function acquireSubmitOperation(
  gate: SubmitOperationGate,
  operationId: string,
): SubmitOperationAcquireResult {
  const id = operationId.trim();
  if (!id) return { ok: false, reason: "in_flight" };
  if (gate.inFlightOperationId === id) {
    return { ok: false, reason: "duplicate" };
  }
  if (gate.inFlightOperationId) {
    return { ok: false, reason: "in_flight" };
  }
  gate.inFlightOperationId = id;
  return { ok: true, operationId: id };
}

export function releaseSubmitOperation(
  gate: SubmitOperationGate,
  operationId?: string | null,
): void {
  if (operationId && gate.inFlightOperationId !== operationId) return;
  gate.inFlightOperationId = null;
}

export function markFollowUpAccepted(gate: SubmitOperationGate): void {
  gate.followUpAccepted = true;
}

/**
 * Late completion from an older create must not restart generation or
 * overwrite a follow-up that has already been accepted.
 */
export function canAcceptGreenfieldCompletion(input: {
  readonly completingOperationId: string;
  readonly activeOperationId: string | null;
  readonly followUpAccepted: boolean;
}): boolean {
  if (input.followUpAccepted) return false;
  if (
    input.activeOperationId &&
    input.completingOperationId !== input.activeOperationId
  ) {
    return false;
  }
  return true;
}

export function canStartGreenfieldGenerate(input: {
  readonly followUpAccepted: boolean;
  readonly alreadyGeneratedForOperation: boolean;
}): boolean {
  if (input.followUpAccepted) return false;
  if (input.alreadyGeneratedForOperation) return false;
  return true;
}
