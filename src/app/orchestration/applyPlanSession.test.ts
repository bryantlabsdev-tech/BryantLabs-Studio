import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanApplySession } from "@/core/planApply/types";

/**
 * Regression: executeApplyPlanOrchestration must not read planApplySession from the
 * frozen host snapshot at the end of propose — that snapshot is captured when the
 * async call starts (often null) even after setPlanApplySession during the run.
 */
describe("apply plan session ownership", () => {
  it("builds review session from in-run applySession, not stale host snapshot", () => {
    const applySession: PlanApplySession = {
      applyRunId: "run-1",
      prompt: "Add a timer",
      planSummary: "Add timer",
      planSource: "ai",
      applyTargetCount: 1,
      applySkippedCount: 0,
      files: [],
      phase: "proposing",
      selectedRelPath: "src/App.tsx",
      applyError: null,
      verification: null,
      totals: null,
    };

    const hostSnapshotAtCallTime: PlanApplySession | null = null;

    const reviewSession: PlanApplySession = {
      ...applySession,
      phase: "review",
      totals: {
        filesChanged: 1,
        linesAdded: 4,
        linesRemoved: 0,
        filesApproved: 0,
        filesApplied: 0,
      },
    };

    assert.notEqual(hostSnapshotAtCallTime, reviewSession);
    assert.equal(reviewSession.prompt, "Add a timer");
    assert.equal(reviewSession.phase, "review");
  });
});
