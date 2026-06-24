import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveAgentRunState } from "@/core/agent/deriveAgentRunState";
import { createLatestAction } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

const baseInput = {
  greenfieldRun: emptyGreenfieldRun(),
  greenfieldPanelActive: false,
  agentIntent: null,
  buildPhase: "idle" as const,
  planApplyPhase: null,
  planApplySession: null,
  autoFixPhase: null,
  buildRunning: false,
  pipelineRunning: false,
  recentLogs: [],
  runStartedAt: null,
  provider: null,
  model: null,
  buildError: null,
  planApplyError: null,
  pipelineError: null,
  plan: null,
  aiPlan: null,
  scan: null,
};

describe("deriveAgentRunState", () => {
  it("aligns runStatus progress and duration with agentRunCard", () => {
    const run = {
      ...emptyGreenfieldRun(),
      runStartedAt: Date.now() - 42_000,
      endedAt: Date.now() - 1_000,
      durationMs: 41_000,
      runResult: "success" as const,
      latestAction: createLatestAction("success", "Run complete"),
    };

    const state = deriveAgentRunState(
      { ...baseInput, greenfieldRun: run },
      Date.now(),
    );

    assert.equal(state.runStatus.progressPercent, state.agentRunCard.progressPercent);
    assert.equal(state.runStatus.elapsedMs, state.agentRunCard.durationMs);
    assert.equal(state.runStatus.isActive, state.agentRunCard.overallStatus === "running");
    assert.equal(state.terminal.isTerminal, true);
    assert.equal(state.dashboard.progressPercent, state.agentRunCard.progressPercent);
  });
});
