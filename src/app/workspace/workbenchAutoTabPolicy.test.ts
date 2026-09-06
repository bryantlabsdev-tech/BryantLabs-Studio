import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countEdgeTriggeredTabCommits,
  countLegacyAlwaysOnTabCommits,
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
    planApplyReadyForReview: false,
    aiPatchForEditor: false,
    aiPatchApplied: false,
    ...overrides,
  };
}

describe("workbenchAutoTabPolicy", () => {
  it("legacy always-on Preview+Diff effects exceed React max update depth", () => {
    const legacy = countLegacyAlwaysOnTabCommits(
      signals({ previewTabNonce: 1, planApplyReadyForReview: true }),
    );
    assert.equal(legacy.exceededMaxDepth, true);
    assert.ok(legacy.commits > 50);
  });

  it("edge-triggered policy writes a tab once then stabilizes under the same signals", () => {
    const overlapping = signals({
      previewTabNonce: 1,
      planApplyReadyForReview: true,
    });
    const edge = countEdgeTriggeredTabCommits(overlapping);
    assert.equal(edge.exceededMaxDepth, false);
    assert.equal(edge.writes, 1);

    const started = evaluateWorkbenchAutoTab(
      INITIAL_WORKBENCH_AUTO_TAB_STATE,
      overlapping,
    );
    assert.equal(started.tabToSet, "diff");

    const again = evaluateWorkbenchAutoTab(started.nextState, overlapping);
    assert.equal(again.tabToSet, null);
  });

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
});
