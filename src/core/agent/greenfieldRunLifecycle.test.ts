import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cancelGreenfieldRunPatch,
  isStaleGreenfieldRun,
  reconcileStaleGreenfieldRun,
} from "@/core/agent/greenfieldRunLifecycle";
import {
  getAgentRunBlockReason,
  isGreenfieldRunActive,
} from "@/core/agent/agentRunMutex";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

function staleRunningRun(now: number) {
  const started = now - 11 * 60_000;
  return {
    ...emptyGreenfieldRun(),
    actionType: "greenfield" as const,
    genStatus: "running" as const,
    runResult: "running" as const,
    runStartedAt: started,
    entries: [
      {
        id: "gen",
        stage: "generation" as const,
        status: "running" as const,
        message: "Generation started",
        timestamp: new Date(started).toISOString(),
      },
    ],
  };
}

describe("greenfieldRunLifecycle", () => {
  it("detects stale greenfield runs older than 10 minutes", () => {
    const now = Date.now();
    const run = staleRunningRun(now);
    assert.equal(isStaleGreenfieldRun(run, now), true);
  });

  it("reconcile clears stale active state", () => {
    const now = Date.now();
    const run = staleRunningRun(now);
    const patch = reconcileStaleGreenfieldRun(run, now);
    assert.ok(patch);
    const cleared = { ...run, ...patch };
    assert.equal(isGreenfieldRunActive(cleared, false), false);
    assert.equal(
      getAgentRunBlockReason({
        greenfieldRun: cleared,
        greenfieldPanelActive: false,
        buildRunning: false,
        pipelineRunning: false,
        aiPlanStatus: "idle",
        planApplyPhase: null,
        autoFixPhase: null,
      }),
      null,
    );
  });

  it("cancel patch clears mutex and running statuses", () => {
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      genStatus: "running" as const,
      writeStatus: "writing" as const,
      setupStatus: "running" as const,
      runResult: "running" as const,
      entries: [
        {
          id: "gen",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const cleared = { ...run, ...cancelGreenfieldRunPatch(run) };
    assert.equal(cleared.genStatus, "error");
    assert.equal(cleared.writeStatus, "error");
    assert.equal(cleared.setupStatus, "error");
    assert.equal(cleared.runResult, "cancelled");
    assert.equal(isGreenfieldRunActive(cleared, false), false);
    assert.equal(cleared.entries.every((e) => e.status !== "running"), true);
  });

  it("blocks composer while follow-up awaits review", () => {
    assert.equal(
      getAgentRunBlockReason({
        greenfieldRun: emptyGreenfieldRun(),
        greenfieldPanelActive: false,
        buildRunning: false,
        pipelineRunning: false,
        aiPlanStatus: "idle",
        planApplyPhase: "waiting_for_review",
        autoFixPhase: null,
      }),
      "Review pending — approve, reject, or regenerate patches before starting another run.",
    );
  });

  it("stale greenfield cannot block composer forever", () => {
    const now = Date.now();
    const run = staleRunningRun(now);
    assert.ok(
      getAgentRunBlockReason({
        greenfieldRun: run,
        greenfieldPanelActive: false,
        buildRunning: false,
        pipelineRunning: false,
        aiPlanStatus: "idle",
        planApplyPhase: null,
        autoFixPhase: null,
      }),
    );
    const cleared = { ...run, ...reconcileStaleGreenfieldRun(run, now)! };
    assert.equal(
      getAgentRunBlockReason({
        greenfieldRun: cleared,
        greenfieldPanelActive: false,
        buildRunning: false,
        pipelineRunning: false,
        aiPlanStatus: "idle",
        planApplyPhase: null,
        autoFixPhase: null,
      }),
      null,
    );
  });
});
