import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeProjectHealth } from "./projectHealth.ts";

const okResult = {
  command: "test",
  ok: true,
  exitCode: 0,
  stdout: "",
  stderr: "",
  durationMs: 1,
  errorCount: 0,
  warningCount: 0,
  timedOut: false,
  truncated: false,
};

describe("computeProjectHealth", () => {
  it("scores highly when verification and preview pass", () => {
    const health = computeProjectHealth(
      {
        typecheck: okResult,
        build: okResult,
        ranAt: Date.now(),
      },
      true,
    );
    assert.equal(health.typecheckOk, true);
    assert.equal(health.buildOk, true);
    assert.equal(health.previewOk, true);
    assert.ok(health.score >= 9);
  });
});
