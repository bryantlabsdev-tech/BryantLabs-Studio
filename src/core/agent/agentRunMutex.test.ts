import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import {
  getAgentRunBlockReason,
  isAgentRunActive,
  isAgentWorkflowBusy,
  isGreenfieldRunActive,
} from "@/core/agent/agentRunMutex";

describe("agentRunMutex", () => {
  it("detects active greenfield generation", () => {
    const run = { ...emptyGreenfieldRun(), genStatus: "running" };
    assert.equal(isGreenfieldRunActive(run, false), true);
  });

  it("does not treat embedded greenfield panel alone as active run", () => {
    assert.equal(isGreenfieldRunActive(emptyGreenfieldRun(), true), false);
  });

  it("detects active follow-up planning", () => {
    assert.equal(
      isAgentRunActive({
        greenfieldRun: emptyGreenfieldRun(),
        greenfieldPanelActive: false,
        buildRunning: false,
        pipelineRunning: false,
        aiPlanStatus: "running",
        planApplyPhase: null,
        autoFixPhase: null,
      }),
      true,
    );
  });

  it("blocks when greenfield and follow-up would overlap", () => {
    const run = { ...emptyGreenfieldRun(), genStatus: "running" };
    const reason = getAgentRunBlockReason({
      greenfieldRun: run,
      greenfieldPanelActive: false,
      buildRunning: true,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplyPhase: null,
      autoFixPhase: null,
    });
    assert.ok(reason);
  });

  it("does not treat success with stale running log rows as active", () => {
    const run = {
      ...emptyGreenfieldRun(),
      genStatus: "done",
      writeStatus: "done",
      setupStatus: "done",
      runResult: "success" as const,
      entries: [
        {
          id: "preview-running",
          stage: "preview" as const,
          status: "running" as const,
          message: "Preview started",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    assert.equal(isGreenfieldRunActive(run, false), false);
    assert.equal(
      getAgentRunBlockReason({
        greenfieldRun: run,
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

  it("isAgentWorkflowBusy when greenfield panel is active", () => {
    assert.equal(
      isAgentWorkflowBusy({
        greenfieldRun: emptyGreenfieldRun(),
        greenfieldPanelActive: true,
        buildRunning: false,
        pipelineRunning: false,
        aiPlanStatus: "idle",
        planApplyPhase: null,
        autoFixPhase: null,
      }),
      true,
    );
  });
});
