import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferOutcomeFromSnapshot } from "@/core/agent/runOutcome";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createLatestAction } from "@/core/greenfield/runLog";

describe("runOutcome follow-up interim actions", () => {
  it("does not terminalize edit_follow_up runs after ai_plan success only", () => {
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      runTimeline: {
        runId: "run-1",
        route: "edit_follow_up",
        startedAt: Date.now(),
        stages: [
          {
            stage: "plan_complete" as const,
            at: Date.now(),
            elapsedMs: 100,
            stageDurationMs: 100,
            detail: "src/App.tsx,src/index.css",
          },
        ],
        lastStage: "plan_complete" as const,
        lastSuccessfulStage: "plan_complete" as const,
        status: "running" as const,
        completedAt: null,
        totalDurationMs: null,
        failureDetail: null,
      },
      latestAction: createLatestAction("success", "AI Plan completed", {
        stage: "ai_plan",
      }),
    };
    assert.equal(inferOutcomeFromSnapshot(run), null);
  });
});
