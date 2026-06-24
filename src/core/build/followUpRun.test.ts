import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveFollowUpRunPhase,
  followUpRunProgress,
  formatElapsedDuration,
} from "./followUpRun.ts";

describe("followUpRun", () => {
  it("formats elapsed duration", () => {
    assert.equal(formatElapsedDuration(41_000), "00:41");
    assert.equal(formatElapsedDuration(125_000), "02:05");
  });

  it("maps verifying to typescript phase", () => {
    const phase = deriveFollowUpRunPhase({
      buildPhase: "verifying",
      planApplyPhase: "verifying",
      autoFixPhase: null,
      buildRunning: true,
      pipelineRunning: false,
      recentLogs: [],
      hasError: false,
    });
    assert.equal(phase, "typescript");
  });

  it("reports progress for applying", () => {
    assert.equal(followUpRunProgress("applying"), 58);
    assert.equal(followUpRunProgress("done"), 100);
  });
});
