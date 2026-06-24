import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createApplyPlanRunId,
  shouldIgnoreStaleApplyPlanResult,
} from "@/core/planApply/applyPlanRun";

describe("applyPlanRun ownership", () => {
  it("creates unique run ids", () => {
    const a = createApplyPlanRunId();
    const b = createApplyPlanRunId();
    assert.notEqual(a, b);
    assert.match(a, /^apply-plan-/);
  });

  it("ignores stale propose failure after a newer run succeeds", () => {
    const runA = "run-a";
    const runB = "run-b";

    let active: string | null = runA;
    let completed: string | null = null;

    active = runB;
    completed = null;

    completed = runB;
    active = null;

    assert.equal(
      shouldIgnoreStaleApplyPlanResult(runA, active, completed),
      true,
      "A failure must not overwrite B success",
    );
    assert.equal(
      shouldIgnoreStaleApplyPlanResult(runB, active, completed),
      false,
      "B result remains authoritative after finalize",
    );
  });

  it("ignores superseded run while a newer run is active", () => {
    const runA = "run-a";
    const runB = "run-b";
    const active = runB;
    const completed: string | null = null;

    assert.equal(
      shouldIgnoreStaleApplyPlanResult(runA, active, completed),
      true,
    );
    assert.equal(
      shouldIgnoreStaleApplyPlanResult(runB, active, completed),
      false,
    );
  });
});
