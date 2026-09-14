import { isUiAuditFixPrompt } from "@/core/agent/uiAuditAdvisoryUx";
import { hasReviewablePlanApplyFiles } from "@/core/planApply/decisions";
import type { PlanApplySession } from "@/core/planApply/types";

const STORAGE_KEY = "bryantlabs.followUpReviewFirst";

/**
 * Emergency rollback: skip Accept all / review-first and write ready patches
 * as soon as the coder returns them. Keep the gated auto-apply paths; flip
 * this to true only to restore the previous continue-without-review behavior.
 */
export const AUTO_APPLY_FOLLOW_UP_PATCHES = false;

export function interpretFollowUpReviewFirst(
  raw: string | null,
  autoApply = AUTO_APPLY_FOLLOW_UP_PATCHES,
): boolean {
  if (autoApply) return false;
  if (raw === null) return true;
  return raw === "1";
}

/** When true, follow-up runs pause for review before applying patches. */
export function readFollowUpReviewFirst(): boolean {
  try {
    return interpretFollowUpReviewFirst(localStorage.getItem(STORAGE_KEY));
  } catch {
    return interpretFollowUpReviewFirst(null);
  }
}

export function writeFollowUpReviewFirst(reviewFirst: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, reviewFirst ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Automated Fix-with-AI flows should apply without pausing for manual review. */
export function shouldAutoContinueFollowUpApply(prompt: string): boolean {
  return isUiAuditFixPrompt(prompt);
}

/** Ordinary follow-ups honor review-first; UI-audit auto-fix prompts still continue. */
export function resolveFollowUpAutoContinue(prompt: string): boolean {
  return shouldAutoContinueFollowUpApply(prompt) || !readFollowUpReviewFirst();
}

/**
 * Promote waiting review sessions only while the emergency auto-apply
 * kill switch is on. Simulated e2e sessions are excluded.
 */
export function shouldAutoPromoteFollowUpReview(
  session: PlanApplySession | null | undefined,
  autoApply = AUTO_APPLY_FOLLOW_UP_PATCHES,
): boolean {
  if (!autoApply) return false;
  if (!session) return false;
  if (session.phase !== "waiting_for_review" && session.phase !== "review") return false;
  if (!hasReviewablePlanApplyFiles(session)) return false;
  if (
    session.files.length > 0 &&
    session.files.every((file) => file.selectionReason === "e2e")
  ) {
    return false;
  }
  return true;
}

/**
 * Pipeline review uses the same emergency kill switch. When it is false,
 * wait on the existing Approve & continue / center Accept all gate.
 */
export function awaitFollowUpPipelineReviewApproval(
  awaitGate: () => Promise<boolean>,
  autoApply = AUTO_APPLY_FOLLOW_UP_PATCHES,
): Promise<boolean> {
  if (autoApply) return Promise.resolve(true);
  return awaitGate();
}
