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
} {
  let run = emptyGreenfieldRun();
  const logs: Array<{ stage: string; status: string; message: string }> = [];
  const runSnapshots: ReturnType<typeof emptyGreenfieldRun>[] = [];

  return {
    projectPath: "/tmp/project",
    get greenfieldRun() {
      return run;
    },
    pipelineRunActiveRef: { current: false },
    logs,
    runSnapshots,
    updateGreenfieldRun(patch) {
      run = { ...run, ...patch };
    },
    setGreenfieldRun(updater) {
      run = typeof updater === "function" ? updater(run) : updater;
      runSnapshots.push(run);
    },
    appendGreenfieldRunLog(stage, status, message) {
      logs.push({ stage, status, message });
    },
    resetAiCallTracker() {},
    refreshProviderStatus: async () => {},
    persistAnalyticsRecord() {},
    offerMemoryCandidatesFromRun() {},
  };
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

  it("no-ops when host is null", () => {
    beginStudioActionOrchestration(null, "ai_plan", "ai_plan", "x");
    finishStudioActionOrchestration(null, "ai_plan", "ai_plan", true, "x");
  });
});
