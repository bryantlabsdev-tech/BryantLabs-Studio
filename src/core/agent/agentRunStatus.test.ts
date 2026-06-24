import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveAgentRunStatus } from "@/core/agent/agentRunStatus";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

describe("deriveAgentRunStatus", () => {
  it("maps greenfield generation to generating phase", () => {
    const run = { ...emptyGreenfieldRun(), genStatus: "running", runStartedAt: Date.now() - 5000 };
    const status = deriveAgentRunStatus({
      greenfieldRun: run,
      greenfieldPanelActive: true,
      agentIntent: "greenfield",
      buildPhase: "idle",
      planApplyPhase: null,
      planApplySession: null,
      autoFixPhase: null,
      buildRunning: false,
      pipelineRunning: false,
      recentLogs: run.entries,
      runStartedAt: run.runStartedAt,
      provider: "openai",
      model: "gpt-4",
      buildError: null,
      planApplyError: null,
      pipelineError: null,
    });
    assert.equal(status.phase, "generating");
    assert.equal(status.isActive, true);
  });

  it("labels repair intent during auto_repair", () => {
    const run = emptyGreenfieldRun();
    const status = deriveAgentRunStatus({
      greenfieldRun: run,
      greenfieldPanelActive: false,
      agentIntent: "repair",
      buildPhase: "verifying",
      planApplyPhase: null,
      planApplySession: null,
      autoFixPhase: "proposing",
      buildRunning: true,
      pipelineRunning: false,
      recentLogs: run.entries,
      runStartedAt: Date.now() - 1000,
      provider: null,
      model: null,
      buildError: null,
      planApplyError: null,
      pipelineError: null,
    });
    assert.equal(status.phase, "auto_repair");
    assert.match(status.currentLabel, /Updating app/i);
  });
});
