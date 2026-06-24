import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILD_PHASE_LABELS, deriveBuildPhase } from "@/core/build/types";

describe("build loop", () => {
  it("derives pipeline planning phase", () => {
    const phase = deriveBuildPhase({
      mode: "pipeline",
      buildRunning: false,
      pipelineRunning: true,
      pipelineStatus: "planning",
      aiPlanStatus: "idle",
      planApplyPhase: null,
      autoFixPhase: null,
    });
    assert.equal(phase, "planning");
  });

  it("derives single-agent review phase", () => {
    const phase = deriveBuildPhase({
      mode: "single",
      buildRunning: false,
      pipelineRunning: false,
      pipelineStatus: null,
      aiPlanStatus: "done",
      planApplyPhase: "review",
      autoFixPhase: null,
    });
    assert.equal(phase, "review");
  });

  it("derives review while buildRunning when waiting for review", () => {
    const phase = deriveBuildPhase({
      mode: "single",
      buildRunning: true,
      pipelineRunning: false,
      pipelineStatus: null,
      aiPlanStatus: "done",
      planApplyPhase: "waiting_for_review",
      autoFixPhase: null,
    });
    assert.equal(phase, "review");
  });

  it("labels all phases", () => {
    assert.ok(BUILD_PHASE_LABELS.review.includes("review"));
    assert.ok(BUILD_PHASE_LABELS.completed.length > 0);
  });
});
