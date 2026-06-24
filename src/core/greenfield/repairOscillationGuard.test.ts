import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RepairConvergenceTracker,
  countTypeScriptErrors,
  fingerprintTypeScriptOutput,
} from "@/core/greenfield/repairOscillationGuard";

const sampleErr = (file: string, line: number, code: string, msg: string) =>
  `${file}(${line},1): error ${code}: ${msg}`;

describe("repairOscillationGuard", () => {
  it("counts parsed tsc errors", () => {
    const stderr = [
      sampleErr("src/App.tsx", 1, "TS2322", "bad"),
      sampleErr("src/App.tsx", 2, "TS2339", "missing"),
    ].join("\n");
    assert.equal(countTypeScriptErrors("", stderr), 2);
  });

  it("fingerprints are stable for the same error set", () => {
    const a = fingerprintTypeScriptOutput("", sampleErr("src/a.ts", 3, "TS2741", "missing prop"));
    const b = fingerprintTypeScriptOutput("", sampleErr("src/a.ts", 3, "TS2741", "missing prop"));
    assert.equal(a, b);
  });

  it("resets stale counter when repairs are applied between stale passes", () => {
    const tracker = new RepairConvergenceTracker(2);
    const stderr = sampleErr("src/pages/X.tsx", 5, "TS2740", "missing fields");

    tracker.beginPass("", stderr);
    tracker.beginPass("", stderr);
    tracker.markRepairsApplied();
    tracker.beginPass("", stderr);
    assert.equal(tracker.shouldStopForOscillation(), false);
  });

  it("stops after repeated passes with no improvement", () => {
    const tracker = new RepairConvergenceTracker(2);
    const stderr = sampleErr("src/pages/X.tsx", 5, "TS2740", "missing fields");

    tracker.beginPass("", stderr);
    assert.equal(tracker.shouldStopForOscillation(), false);

    tracker.beginPass("", stderr);
    assert.equal(tracker.shouldStopForOscillation(), false);

    tracker.beginPass("", stderr);
    assert.equal(tracker.shouldStopForOscillation(), true);
  });

  it("resets stale counter when error count drops", () => {
    const tracker = new RepairConvergenceTracker(2);
    const err3 = [
      sampleErr("src/a.ts", 1, "TS2322", "one"),
      sampleErr("src/a.ts", 2, "TS2322", "two"),
      sampleErr("src/a.ts", 3, "TS2322", "three"),
    ].join("\n");
    const err2 = [
      sampleErr("src/a.ts", 1, "TS2322", "one"),
      sampleErr("src/a.ts", 2, "TS2322", "two"),
    ].join("\n");

    tracker.beginPass("", err3);
    tracker.beginPass("", err3);
    tracker.beginPass("", err2);
    assert.equal(tracker.shouldStopForOscillation(), false);
  });
});
