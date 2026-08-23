import type { CenterTab } from "@/core/layout/types";

export interface WorkbenchAutoTabSignals {
  readonly previewTabNonce: number;
  readonly reviewingPendingPatch: boolean;
  readonly aiPatchForEditor: boolean;
  readonly aiPatchApplied: boolean;
}

export interface WorkbenchAutoTabState {
  readonly lastPreviewNonce: number;
  readonly revealedPendingPatch: boolean;
  readonly revealedAiPatch: boolean;
  readonly revealedAiPatchApplied: boolean;
}

export const INITIAL_WORKBENCH_AUTO_TAB_STATE: WorkbenchAutoTabState = {
  lastPreviewNonce: 0,
  revealedPendingPatch: false,
  revealedAiPatch: false,
  revealedAiPatchApplied: false,
};

/**
 * Auto-reveal workbench tabs only when a signal first becomes true.
 * Subsequent ticks (session identity churn, run-active flipping, loading)
 * must not override a tab the user selected.
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
    revealedAiPatch: signals.aiPatchForEditor,
    revealedAiPatchApplied: signals.aiPatchApplied,
  };

  let tabToSet: CenterTab | null = null;
  if (signals.aiPatchApplied && !state.revealedAiPatchApplied) {
    tabToSet = "editor";
  } else if (signals.reviewingPendingPatch && !state.revealedPendingPatch) {
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
