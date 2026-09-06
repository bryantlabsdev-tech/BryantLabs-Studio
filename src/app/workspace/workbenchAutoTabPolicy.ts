import type { CenterTab } from "@/core/layout/types";

export interface WorkbenchAutoTabSignals {
  readonly previewTabNonce: number;
  readonly reviewingPendingPatch: boolean;
  readonly planApplyReadyForReview: boolean;
  readonly aiPatchForEditor: boolean;
  readonly aiPatchApplied: boolean;
}

export interface WorkbenchAutoTabState {
  readonly lastPreviewNonce: number;
  readonly revealedPendingPatch: boolean;
  readonly revealedPlanApplyReview: boolean;
  readonly revealedAiPatch: boolean;
  readonly revealedAiPatchApplied: boolean;
}

export const INITIAL_WORKBENCH_AUTO_TAB_STATE: WorkbenchAutoTabState = {
  lastPreviewNonce: 0,
  revealedPendingPatch: false,
  revealedPlanApplyReview: false,
  revealedAiPatch: false,
  revealedAiPatchApplied: false,
};

/**
 * Auto-reveal workbench tabs only when a signal first becomes true.
 * Subsequent ticks (session identity churn, run-active flipping, loading)
 * must not override a tab the user selected, and must not ping-pong
 * Preview vs Diff on every render.
 */
export function evaluateWorkbenchAutoTab(
  state: WorkbenchAutoTabState,
  signals: WorkbenchAutoTabSignals,
): { readonly nextState: WorkbenchAutoTabState; readonly tabToSet: CenterTab | null } {
  const nextState: WorkbenchAutoTabState = {
    lastPreviewNonce:
      signals.previewTabNonce > state.lastPreviewNonce
        ? signals.previewTabNonce
        : state.lastPreviewNonce,
    revealedPendingPatch: signals.reviewingPendingPatch,
    revealedPlanApplyReview: signals.planApplyReadyForReview,
    revealedAiPatch: signals.aiPatchForEditor,
    revealedAiPatchApplied: signals.aiPatchApplied,
  };

  let tabToSet: CenterTab | null = null;
  if (signals.aiPatchApplied && !state.revealedAiPatchApplied) {
    tabToSet = "editor";
  } else if (
    (signals.reviewingPendingPatch && !state.revealedPendingPatch) ||
    (signals.planApplyReadyForReview && !state.revealedPlanApplyReview)
  ) {
    tabToSet = "diff";
  } else if (signals.aiPatchForEditor && !state.revealedAiPatch) {
    tabToSet = "diff";
  } else if (
    signals.previewTabNonce > state.lastPreviewNonce &&
    signals.previewTabNonce > 0
  ) {
    tabToSet = "preview";
  }

  return { nextState, tabToSet };
}

const REACT_MAX_UPDATE_DEPTH = 50;

/**
 * Models the pre-fix CenterWorkbench effects: each effect wrote a tab on every
 * tick, and a nested update restarted the effect list. Preview + review then
 * ping-pong until React's max update depth.
 */
export function countLegacyAlwaysOnTabCommits(
  signals: WorkbenchAutoTabSignals,
  maxCommits = REACT_MAX_UPDATE_DEPTH + 5,
): { readonly commits: number; readonly exceededMaxDepth: boolean } {
  let tab: CenterTab = "editor";
  let commits = 0;
  let changed = true;
  while (changed && commits < maxCommits) {
    changed = false;
    commits += 1;
    const requested: CenterTab[] = [];
    if (signals.previewTabNonce > 0) requested.push("preview");
    if (signals.reviewingPendingPatch || signals.planApplyReadyForReview) {
      requested.push("diff");
    }
    if (signals.aiPatchForEditor) requested.push("diff");
    if (signals.aiPatchApplied) requested.push("editor");
    for (const next of requested) {
      if (next !== tab) {
        tab = next;
        changed = true;
        break;
      }
    }
  }
  return {
    commits,
    exceededMaxDepth: commits > REACT_MAX_UPDATE_DEPTH,
  };
}

export function countEdgeTriggeredTabCommits(
  signals: WorkbenchAutoTabSignals,
  ticks = REACT_MAX_UPDATE_DEPTH + 5,
): { readonly writes: number; readonly exceededMaxDepth: boolean } {
  let state = INITIAL_WORKBENCH_AUTO_TAB_STATE;
  let writes = 0;
  for (let i = 0; i < ticks; i += 1) {
    const result = evaluateWorkbenchAutoTab(state, signals);
    state = result.nextState;
    if (result.tabToSet) writes += 1;
  }
  return {
    writes,
    exceededMaxDepth: writes > REACT_MAX_UPDATE_DEPTH,
  };
}
