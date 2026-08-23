import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateWorkbenchAutoTab,
  INITIAL_WORKBENCH_AUTO_TAB_STATE,
  type WorkbenchAutoTabSignals,
} from "@/app/workspace/workbenchAutoTabPolicy";

function signals(
  overrides: Partial<WorkbenchAutoTabSignals> = {},
): WorkbenchAutoTabSignals {
  return {
    previewTabNonce: 0,
    reviewingPendingPatch: false,
    aiPatchForEditor: false,
    aiPatchApplied: false,
    ...overrides,
  };
}

describe("workbenchAutoTabPolicy", () => {
  it("auto-reveals Diff once when a legacy pending-patch review starts", () => {
    const started = evaluateWorkbenchAutoTab(
      INITIAL_WORKBENCH_AUTO_TAB_STATE,
      signals({ reviewingPendingPatch: true }),
    );
    assert.equal(started.tabToSet, "diff");

    const whileReviewing = evaluateWorkbenchAutoTab(
      started.nextState,
      signals({ reviewingPendingPatch: true }),
    );
    assert.equal(whileReviewing.tabToSet, null);
  });

  it("does not re-force a tab after the user switches away during review or loading", () => {
    const review = evaluateWorkbenchAutoTab(
      INITIAL_WORKBENCH_AUTO_TAB_STATE,
      signals({ reviewingPendingPatch: true }),
    );
    assert.equal(review.tabToSet, "diff");

    const previewReady = evaluateWorkbenchAutoTab(
      review.nextState,
      signals({ reviewingPendingPatch: true, previewTabNonce: 1 }),
    );
    assert.equal(previewReady.tabToSet, "preview");

    const userLeftForEditor = evaluateWorkbenchAutoTab(
      previewReady.nextState,
      signals({ reviewingPendingPatch: true, previewTabNonce: 1 }),
    );
    assert.equal(userLeftForEditor.tabToSet, null);

    const loadingTick = evaluateWorkbenchAutoTab(
      userLeftForEditor.nextState,
      signals({ reviewingPendingPatch: true, previewTabNonce: 1 }),
    );
    assert.equal(loadingTick.tabToSet, null);
  });

  it("does not yank back to Preview just because a run later goes idle", () => {
    const requested = evaluateWorkbenchAutoTab(
      INITIAL_WORKBENCH_AUTO_TAB_STATE,
      signals({ previewTabNonce: 1 }),
    );
    assert.equal(requested.tabToSet, "preview");

    const stillIdle = evaluateWorkbenchAutoTab(
      requested.nextState,
      signals({ previewTabNonce: 1 }),
    );
    assert.equal(stillIdle.tabToSet, null);
  });

  it("auto-reveals Editor once when an AI patch is applied", () => {
    const applied = evaluateWorkbenchAutoTab(
      INITIAL_WORKBENCH_AUTO_TAB_STATE,
      signals({ aiPatchApplied: true }),
    );
    assert.equal(applied.tabToSet, "editor");

    const stillApplied = evaluateWorkbenchAutoTab(
      applied.nextState,
      signals({ aiPatchApplied: true }),
    );
    assert.equal(stillApplied.tabToSet, null);
  });

  it("auto-reveals Diff once for an inline AI patch, then leaves later tab clicks alone", () => {
    const first = evaluateWorkbenchAutoTab(
      INITIAL_WORKBENCH_AUTO_TAB_STATE,
      signals({ aiPatchForEditor: true }),
    );
    assert.equal(first.tabToSet, "diff");

    const later = evaluateWorkbenchAutoTab(
      first.nextState,
      signals({ aiPatchForEditor: true }),
    );
    assert.equal(later.tabToSet, null);
  });
});
