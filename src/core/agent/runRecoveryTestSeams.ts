import type { VerificationResult } from "@/types";

let nextForcedVerification: VerificationResult | { error: string } | null = null;
let nextUndoPathFailure: string | null = null;

/** E2E/unit seam: next Apply Plan verify() uses this result once. */
export function setForcedVerificationResult(
  result: VerificationResult | { error: string } | null,
): void {
  nextForcedVerification = result;
}

export function consumeForcedVerificationResult():
  | VerificationResult
  | { error: string }
  | null {
  const current = nextForcedVerification;
  nextForcedVerification = null;
  return current;
}

/** E2E/unit seam: next checkpoint restore fails this relative path once. */
export function setForcedUndoPathFailure(relPath: string | null): void {
  nextUndoPathFailure = relPath;
}

export function consumeForcedUndoPathFailure(): string | null {
  const current = nextUndoPathFailure;
  nextUndoPathFailure = null;
  return current;
}
