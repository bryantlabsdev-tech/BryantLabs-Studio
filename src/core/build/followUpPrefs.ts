const STORAGE_KEY = "bryantlabs.followUpReviewFirst";

import { isUiAuditFixPrompt } from "@/core/agent/uiAuditAdvisoryUx";

/**
 * Temporarily skip Accept all / review-first and write ready patches
 * as soon as the coder returns them.
 */
export const AUTO_APPLY_FOLLOW_UP_PATCHES = true;

/** When true, follow-up runs pause for review before applying patches. */
export function readFollowUpReviewFirst(): boolean {
  if (AUTO_APPLY_FOLLOW_UP_PATCHES) return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
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
