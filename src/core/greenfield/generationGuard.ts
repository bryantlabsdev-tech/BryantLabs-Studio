import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

export const USER_CANCELLED_GREENFIELD_MESSAGE = "Run cancelled by user";
export const USER_CANCELLED_GREENFIELD_RETRY_MESSAGE = "Run cancelled. You can try again.";

export function createGreenfieldGenerationId(): string {
  return `gf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isGreenfieldNewRunStart(
  prev: GreenfieldRunSnapshot,
  patch: Partial<GreenfieldRunSnapshot>,
): boolean {
  const nextId = patch.generationId;
  if (nextId && nextId !== prev.generationId) {
    return patch.genStatus === "running" || patch.runResult === "running";
  }

  // Remounted generate stamps genStatus running before/with a new id.
  return (
    (prev.runResult === "cancelled" ||
      prev.runResult === "aborted" ||
      prev.runResult === "interrupted") &&
    patch.genStatus === "running"
  );
}

export function shouldIgnoreGreenfieldRunMutation(
  prev: GreenfieldRunSnapshot,
  patch: Partial<GreenfieldRunSnapshot>,
): boolean {
  if (isGreenfieldNewRunStart(prev, patch)) return false;

  const patchId = patch.generationId;
  if (patchId && prev.generationId && patchId !== prev.generationId) {
    return true;
  }

  if (prev.runResult !== "cancelled") return false;
  if (patch.runResult === "cancelled") return false;
  return true;
}

export function isUserCancelledGreenfieldFailure(input: {
  readonly ok?: boolean;
  readonly error?: string;
  readonly exactFailureStage?: string;
} | null | undefined): boolean {
  if (!input || input.ok) return false;
  if (input.exactFailureStage === "cancelled") return true;
  return /cancelled by user|run cancelled/i.test(input.error ?? "");
}
