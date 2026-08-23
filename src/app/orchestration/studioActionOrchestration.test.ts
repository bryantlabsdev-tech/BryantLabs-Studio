import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  beginStudioActionOrchestration,
  finishStudioActionOrchestration,
} from "@/app/orchestration/studioActionOrchestration";
import type { StudioActionOrchestrationHost } from "@/app/orchestration/studioActionTypes";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

function createMockHost(): StudioActionOrchestrationHost & {
  logs: Array<{ stage: string; status: string; message: string }>;
  runSnapshots: ReturnType<typeof emptyGreenfieldRun>[];
  offeredMemory: number;
} {
  let run = emptyGreenfieldRun();
  const logs: Array<{ stage: string; status: string; message: string }> = [];
  const runSnapshots: ReturnType<typeof emptyGreenfieldRun>[] = [];
  const host = {
    projectPath: "/tmp/project",
    get greenfieldRun() {
      return run;
    },
    pipelineRunActiveRef: { current: false },
    logs,
    runSnapshots,
    offeredMemory: 0,
    updateGreenfieldRun(patch: Parameters<StudioActionOrchestrationHost["updateGreenfieldRun"]>[0]) {
      run = { ...run, ...patch };
    },
    setGreenfieldRun(updater: Parameters<StudioActionOrchestrationHost["setGreenfieldRun"]>[0]) {
      run = typeof updater === "function" ? updater(run) : updater;
      runSnapshots.push(run);
    },
    appendGreenfieldRunLog(
      stage: Parameters<StudioActionOrchestrationHost["appendGreenfieldRunLog"]>[0],
      status: Parameters<StudioActionOrchestrationHost["appendGreenfieldRunLog"]>[1],
      message: string,
    ) {
      logs.push({ stage, status, message });
    },
    resetAiCallTracker() {},
    refreshProviderStatus: async () => {},
    persistAnalyticsRecord() {},
    offerMemoryCandidatesFromRun() {
      host.offeredMemory += 1;
    },
  };
  return host;
}

describe("studio action orchestration", () => {
  it("begin marks run as running and logs", () => {
    const host = createMockHost();
    beginStudioActionOrchestration(host, "ai_plan", "ai_plan", "Planning");
    assert.equal(host.greenfieldRun.runResult, "running");
    assert.equal(host.greenfieldRun.actionType, "ai_plan");
    assert.equal(host.logs[0]?.status, "running");
  });

  it("finish records success and updates snapshot", () => {
    const host = createMockHost();
    beginStudioActionOrchestration(host, "apply_plan", "apply_plan", "Starting");
    finishStudioActionOrchestration(
      host,
      "apply_plan",
      "apply_plan",
      true,
      "Done",
    );
    assert.equal(host.runSnapshots.at(-1)?.runResult, "success");
    assert.equal(host.logs.at(-1)?.status, "success");
  });

  it("does not offer success memory after a planner-only finish", () => {
    const host = createMockHost();
    finishStudioActionOrchestration(host, "ai_plan", "ai_plan", true, "Plan ready");
    assert.equal(host.offeredMemory, 0);
  });

  it("does not offer memory when apply plan is only ready for review", () => {
    const host = createMockHost();
    beginStudioActionOrchestration(host, "apply_plan", "apply_plan", "Starting");
    finishStudioActionOrchestration(
      host,
      "apply_plan",
      "apply_plan",
      true,
      "Changes ready for review",
    );
    assert.equal(host.offeredMemory, 0);
    assert.equal(host.runSnapshots.at(-1)?.runResult, "running");
  });

  it("no-ops when host is null", () => {
    beginStudioActionOrchestration(null, "ai_plan", "ai_plan", "x");
    finishStudioActionOrchestration(null, "ai_plan", "ai_plan", true, "x");
  });
});
