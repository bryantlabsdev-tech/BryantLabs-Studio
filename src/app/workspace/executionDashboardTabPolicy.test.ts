import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import {
  applyUserCenterTabPin,
  evaluateExecutionTabOnRunProgress,
  INITIAL_EXECUTION_TAB_SWITCH_STATE,
  resolveRunInProgress,
  shouldPinCenterTabDuringRun,
} from "@/app/workspace/executionDashboardTabPolicy";

describe("executionDashboardTabPolicy", () => {
  it("treats active agent runs as in progress even when buildRunning flickers", () => {
    const inProgress = resolveRunInProgress({
      greenfieldRun: { ...emptyGreenfieldRun(), runStartedAt: Date.now() },
      activeAgentRunId: "run-live-1",
      buildRunning: false,
      pipelineRunning: false,
    });
    assert.equal(inProgress, true);
  });

  it("pins inspector tab during active runs", () => {
    assert.equal(shouldPinCenterTabDuringRun(true, "inspector"), true);
    assert.equal(shouldPinCenterTabDuringRun(true, "execution"), false);
  });

  it("keeps inspector tab pinned while run progress updates continue", () => {
    let state = applyUserCenterTabPin(INITIAL_EXECUTION_TAB_SWITCH_STATE, {
      runInProgress: true,
      centerTab: "inspector",
    });
    state = evaluateExecutionTabOnRunProgress(state, {
      runInProgress: true,
      centerTab: "inspector",
    }).nextState;

    for (let i = 0; i < 5; i += 1) {
      const update = evaluateExecutionTabOnRunProgress(state, {
        runInProgress: true,
        centerTab: "inspector",
      });
      state = update.nextState;
      assert.equal(update.tabToSet, null);
    }
    assert.equal(state.userPinnedNonExecution, true);
  });

  it("auto-switches to execution only when a run starts on a non-pinned tab", () => {
    const started = evaluateExecutionTabOnRunProgress(INITIAL_EXECUTION_TAB_SWITCH_STATE, {
      runInProgress: true,
      centerTab: "editor",
    });
    assert.equal(started.tabToSet, "execution");
    assert.equal(started.nextState.savedTab, "editor");
  });
});
