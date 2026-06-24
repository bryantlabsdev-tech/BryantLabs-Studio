import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeStaleGreenfieldRunningEntries,
  finalizeGreenfieldAgentRun,
  greenfieldSuccessWithStaleRunningEntries,
} from "@/core/agent/greenfieldAgentCleanup";
import {
  getAgentRunBlockReason,
  isGreenfieldRunActive,
} from "@/core/agent/agentRunMutex";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

describe("greenfieldAgentCleanup", () => {
  it("closes stale running log entries", () => {
    const run = greenfieldSuccessWithStaleRunningEntries();
    const closed = closeStaleGreenfieldRunningEntries(run.entries);
    assert.equal(closed.every((e) => e.status !== "running"), true);
    assert.equal(closed.filter((e) => e.id === "gen-running")[0]?.status, "success");
  });

  it("finalizeGreenfieldAgentRun clears busy flags", () => {
    const run = {
      ...emptyGreenfieldRun(),
      genStatus: "running",
      writeStatus: "writing",
      setupStatus: "repairing",
      runResult: "running" as const,
      entries: [
        {
          id: "a",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const patch = finalizeGreenfieldAgentRun(run);
    assert.equal(patch.genStatus, "done");
    assert.equal(patch.writeStatus, "done");
    assert.equal(patch.setupStatus, "done");
    assert.equal(patch.runResult, "success");
    assert.equal(patch.entries?.every((e) => e.status !== "running"), true);
    assert.equal(patch.actionType, "studio_agent");
    assert.equal(patch.failureReport, null);
    assert.equal(patch.greenfieldRepair, null);
  });

  it("finalizeGreenfieldAgentRun preserves repair snapshot with attempts", () => {
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "success" as const,
      greenfieldRepair: {
        status: "repaired" as const,
        failureKind: "typescript" as const,
        primaryErrorLine: "TS error",
        repairPrompt: "",
        attempts: [
          {
            attempt: 1,
            targetPath: "src/App.tsx",
            outcome: "applied" as const,
            detail: "ok",
          },
        ],
        filesRepaired: ["src/App.tsx"],
        pendingRelPath: null,
        pendingSummary: null,
      },
    };
    const patch = finalizeGreenfieldAgentRun(run);
    assert.equal(patch.greenfieldRepair?.attempts.length, 1);
  });

  it("finalizeGreenfieldAgentRun preserves greenfield action type", () => {
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      runResult: "success" as const,
    };
    const patch = finalizeGreenfieldAgentRun(run);
    assert.equal(patch.actionType, "greenfield");
  });
});

describe("greenfield success clears busy state", () => {
  it("does not treat successful greenfield as active when log rows are stale", () => {
    const run = greenfieldSuccessWithStaleRunningEntries();
    assert.equal(isGreenfieldRunActive(run, false), false);
  });

  it("does not block follow-up after greenfield success with stale entries", () => {
    const run = greenfieldSuccessWithStaleRunningEntries();
    const reason = getAgentRunBlockReason({
      greenfieldRun: run,
      greenfieldPanelActive: false,
      buildRunning: false,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplyPhase: null,
      autoFixPhase: null,
    });
    assert.equal(reason, null);
  });

  it("finalize + mutex agree follow-up can start", () => {
    const run = greenfieldSuccessWithStaleRunningEntries();
    const finalized = { ...run, ...finalizeGreenfieldAgentRun(run) };
    assert.equal(isGreenfieldRunActive(finalized, false), false);
    assert.equal(
      getAgentRunBlockReason({
        greenfieldRun: finalized,
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

describe("repair success clears busy state", () => {
  it("treats repaired successful run as idle for mutex", () => {
    const run = {
      ...greenfieldSuccessWithStaleRunningEntries(),
      setupStatus: "done",
      greenfieldRepair: null,
      finalMessage: "Repaired successfully — preview started.",
    };
    const finalized = { ...run, ...finalizeGreenfieldAgentRun(run) };
    assert.equal(isGreenfieldRunActive(finalized, false), false);
  });
});

describe("no false greenfield active warning after success", () => {
  it("returns the generic greenfield message only while run is in progress", () => {
    const running = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      genStatus: "done",
      writeStatus: "done",
      setupStatus: "done",
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
    assert.match(getAgentRunBlockReason({
      greenfieldRun: running,
      greenfieldPanelActive: false,
      buildRunning: false,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplyPhase: null,
      autoFixPhase: null,
    }) ?? "", /greenfield run is still active/i);

    const success = { ...running, runResult: "success" as const };
    assert.equal(
      getAgentRunBlockReason({
        greenfieldRun: success,
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

  it("does not block follow-up when apply plan is already active", () => {
    const run = greenfieldSuccessWithStaleRunningEntries();
    const reason = getAgentRunBlockReason({
      greenfieldRun: run,
      greenfieldPanelActive: true,
      buildRunning: false,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplyPhase: "proposing",
      autoFixPhase: null,
    });
    assert.match(reason ?? "", /Apply Plan is generating/);
    assert.doesNotMatch(reason ?? "", /greenfield run is still active/i);
  });
});
