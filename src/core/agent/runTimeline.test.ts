import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginRunTimeline,
  completeRunTimeline,
  failRunTimeline,
  formatRunTimelineForSummary,
  getActiveRunTimeline,
  getLastRunTimeline,
  recordRunTimelineStage,
  runTimelineStageStatus,
} from "./runTimeline.ts";

describe("runTimeline", () => {
  it("records stages with elapsed and stage durations", () => {
    beginRunTimeline({ route: "edit_follow_up", runId: "run-test-1" });
    recordRunTimelineStage("audit_start");
    recordRunTimelineStage("audit_complete");
    recordRunTimelineStage("plan_start");
    recordRunTimelineStage("plan_complete", "files=2");
    const active = getActiveRunTimeline();
    assert.ok(active);
    assert.equal(active?.runId, "run-test-1");
    assert.equal(active?.route, "edit_follow_up");
    assert.equal(active?.stages.length, 6);
    assert.equal(active?.lastStage, "plan_complete");
    assert.equal(active?.lastSuccessfulStage, "plan_complete");
    const auditComplete = active?.stages.find((s) => s.stage === "audit_complete");
    assert.ok(auditComplete);
    assert.ok(auditComplete.elapsedMs >= 0);
    assert.ok(auditComplete.stageDurationMs >= 0);
  });

  it("finalizes with run_complete and summary", () => {
    beginRunTimeline({ route: "edit_follow_up", runId: "run-test-2" });
    recordRunTimelineStage("coder_complete");
    const done = completeRunTimeline("ok");
    assert.ok(done);
    assert.equal(done?.status, "complete");
    assert.equal(done?.lastStage, "run_complete");
    assert.equal(getActiveRunTimeline(), null);
    assert.equal(getLastRunTimeline()?.runId, "run-test-2");
    const summary = formatRunTimelineForSummary(done);
    assert.ok(summary.some((line) => line.includes("last_successful_stage: coder_complete")));
  });

  it("marks failed runs and preserves last successful stage before failure", () => {
    beginRunTimeline({ route: "edit_follow_up", runId: "run-test-3" });
    recordRunTimelineStage("patch_generated", "files=src/App.tsx");
    const failed = failRunTimeline("Patch generated but not applied");
    assert.ok(failed);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.lastSuccessfulStage, "patch_generated");
    assert.equal(failed?.failureDetail, "Patch generated but not applied");
  });

  it("does not mark earlier stages failed when plan_complete fails", () => {
    beginRunTimeline({ route: "edit_follow_up", runId: "run-test-4" });
    recordRunTimelineStage("audit_start");
    recordRunTimelineStage("audit_complete");
    recordRunTimelineStage("plan_start");
    recordRunTimelineStage("plan_complete", "failed");
    const failed = failRunTimeline("Provider not connected");
    assert.ok(failed);
    assert.equal(failed?.lastSuccessfulStage, "plan_start");
    const auditComplete = failed?.stages.find((stage) => stage.stage === "audit_complete");
    assert.equal(runTimelineStageStatus(auditComplete!, failed!), "success");
    const planComplete = failed?.stages.find((stage) => stage.stage === "plan_complete");
    assert.equal(runTimelineStageStatus(planComplete!, failed!), "failed");
  });
});
