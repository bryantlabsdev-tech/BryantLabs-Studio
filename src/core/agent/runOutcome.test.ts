import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cancelGreenfieldRunPatch, clearStaleGreenfieldRunPatch } from "@/core/agent/greenfieldRunLifecycle";
import {
  inferOutcomeFromSnapshot,
  isRunFailureOutcome,
  isRunNeutralOutcome,
  normalizeStoredOutcome,
  outcomeToOverallStatus,
  resolveFailureRunResult,
} from "@/core/agent/runOutcome";
import { resolveRunTerminalState } from "@/core/agent/runTerminal";
import { createLatestAction } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

describe("runOutcome state machine", () => {
  it("classifies explicit runResult values", () => {
    assert.equal(
      inferOutcomeFromSnapshot({ ...emptyGreenfieldRun(), runResult: "cancelled" }),
      "cancelled",
    );
    assert.equal(
      inferOutcomeFromSnapshot({ ...emptyGreenfieldRun(), runResult: "aborted" }),
      "aborted",
    );
    assert.equal(
      inferOutcomeFromSnapshot({ ...emptyGreenfieldRun(), runResult: "interrupted" }),
      "interrupted",
    );
  });

  it("reclassifies legacy failed cancel summaries", () => {
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "failed" as const,
      latestAction: createLatestAction("failed", "Run cancelled by user"),
      finalMessage: "Run cancelled. You can try again.",
    };
    assert.equal(inferOutcomeFromSnapshot(run), "cancelled");
    assert.equal(
      normalizeStoredOutcome("failed", {
        card: {
          overallStatus: "failed",
          summary: "Run cancelled. You can try again.",
        } as never,
      }),
      "cancelled",
    );
  });

  it("maps patches to terminal outcomes", () => {
    const running = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      genStatus: "running" as const,
      runStartedAt: Date.now() - 1000,
    };
    const cancelled = { ...running, ...cancelGreenfieldRunPatch(running) };
    assert.equal(cancelled.runResult, "cancelled");
    assert.equal(resolveRunTerminalState(cancelled).outcome, "cancelled");
    assert.equal(outcomeToOverallStatus("cancelled"), "cancelled");

    const interrupted = { ...running, ...clearStaleGreenfieldRunPatch(running) };
    assert.equal(interrupted.runResult, "interrupted");
    assert.equal(resolveRunTerminalState(interrupted).outcome, "interrupted");
  });

  it("detects aborted provider failures", () => {
    assert.equal(resolveFailureRunResult("This operation was aborted"), "aborted");
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "failed" as const,
      latestAction: createLatestAction("failed", "Provider call failed", {
        detail: "AbortError: operation was aborted",
      }),
    };
    assert.equal(inferOutcomeFromSnapshot(run), "aborted");
  });

  it("separates failure metrics from neutral outcomes", () => {
    assert.equal(isRunFailureOutcome("failed"), true);
    assert.equal(isRunFailureOutcome("cancelled"), false);
    assert.equal(isRunNeutralOutcome("cancelled"), true);
    assert.equal(isRunNeutralOutcome("aborted"), true);
    assert.equal(isRunNeutralOutcome("interrupted"), true);
  });
});
