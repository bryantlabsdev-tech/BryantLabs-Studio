import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePipelineAnalytics,
} from "@/core/pipeline/analytics";
import { plannerOutputFromAiPlan } from "@/core/pipeline/plannerOutput";
import {
  cancelPipelineSession,
  completePipelineSession,
  createPipelineSession,
  finishPipelineStage,
  getPipelineStage,
  isTerminalPipelineStatus,
  pipelineRunLogMessage,
  skipPipelineStage,
  startPipelineStage,
} from "@/core/pipeline/stateMachine";

describe("pipeline state machine", () => {
  it("creates session with ordered stages", () => {
    const session = createPipelineSession("Add dark mode toggle");
    assert.equal(session.status, "queued");
    assert.equal(session.stages.length, 5);
    assert.equal(session.stages[0]?.id, "planner");
    assert.equal(session.stages[4]?.id, "complete");
  });

  it("tracks stage lifecycle", () => {
    let session = createPipelineSession("Fix login bug");
    session = startPipelineStage(session, "planner", {
      provider: "gemini",
      model: "gemini-2.0-flash",
    });
    assert.equal(session.status, "planning");
    assert.equal(getPipelineStage(session, "planner")?.status, "running");

    session = finishPipelineStage(session, "planner", true, "Plan ready");
    assert.equal(getPipelineStage(session, "planner")?.status, "success");
    assert.ok(getPipelineStage(session, "planner")?.durationMs != null);

    session = skipPipelineStage(session, "repair", "Not needed");
    assert.equal(getPipelineStage(session, "repair")?.status, "skipped");

    session = completePipelineSession(session, true);
    assert.equal(session.status, "completed");
    assert.ok(isTerminalPipelineStatus(session.status));
  });

  it("marks cancelled sessions as terminal", () => {
    const session = cancelPipelineSession(createPipelineSession("test"));
    assert.equal(session.status, "cancelled");
    assert.ok(isTerminalPipelineStatus(session.status));
  });

  it("formats run log messages", () => {
    assert.equal(pipelineRunLogMessage("planner", "running"), "[planner] running");
    assert.equal(pipelineRunLogMessage("pipeline", "completed"), "[pipeline] completed");
  });
});

describe("planner output", () => {
  it("maps AI plan into structured output", () => {
    const output = plannerOutputFromAiPlan("Add settings page", {
      ok: true,
      provider: "gemini",
      model: "gemini-2.0-flash",
      latencyMs: 120,
      raw: "{}",
      plan: {
        summary: "Add a settings route and panel",
        reasoning: "Settings page improves UX",
        risks: ["May affect routing"],
        confidence: "Medium",
        files: [{ path: "src/Settings.tsx", reason: "New settings UI" }],
      },
    });
    assert.ok(output);
    assert.equal(output!.goal, "Add settings page");
    assert.equal(output!.selectedFiles.length, 1);
    assert.equal(output!.risks[0], "May affect routing");
  });
});

describe("pipeline analytics", () => {
  it("computes success and stage averages", () => {
    const stats = computePipelineAnalytics([
      {
        runId: "pipeline-test-1",
        at: Date.now(),
        ok: true,
        durationMs: 1200,
        repairAttempts: 0,
        stages: [
          { id: "planner", durationMs: 200, ok: true },
          { id: "coder", durationMs: 500, ok: true },
          { id: "verifier", durationMs: 300, ok: true },
        ],
      },
    ]);
    assert.equal(stats.totalRuns, 1);
    assert.equal(stats.successfulRuns, 1);
    assert.equal(stats.successRatePercent, 100);
    assert.equal(stats.averageDurationMs, 1200);
  });
});
