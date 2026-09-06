import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFollowUpRunFailurePatch,
  recordFollowUpRunFailure,
} from "@/app/orchestration/followUpRunFailure";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

describe("followUpRunFailure", () => {
  it("finalizes dangling running log entries and records workflow errors", () => {
    const prev = {
      ...emptyGreenfieldRun(),
      runStartedAt: Date.now() - 1000,
      entries: [
        createRunLogEntry("provider_call", "running", "[provider_preflight] started"),
      ],
    };
    const patch = buildFollowUpRunFailurePatch(prev, "Provider not connected");
    assert.equal(patch.runResult, "failed");
    assert.equal(patch.entries?.[0]?.status, "failed");
    assert.deepEqual(patch.workflow?.errors, ["Provider not connected"]);
  });

  it("patches live run state instead of a stale host snapshot", () => {
    const liveEntry = createRunLogEntry("apply_plan", "success", "Proposing patches");
    let live: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runStartedAt: Date.now() - 500,
      entries: [liveEntry],
    };
    const staleHostSnapshot: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runStartedAt: live.runStartedAt,
      entries: [],
    };
    recordFollowUpRunFailure(
      {
        greenfieldRun: staleHostSnapshot,
        updateGreenfieldRun: (patch) => {
          const next = typeof patch === "function" ? patch(live) : patch;
          live = { ...live, ...next };
        },
        appendGreenfieldRunLog: () => undefined,
      },
      "Planner failed",
    );
    assert.equal(live.runResult, "failed");
    assert.equal(live.entries.length, 1);
    assert.equal(live.entries[0]?.message, "Proposing patches");
  });
});
