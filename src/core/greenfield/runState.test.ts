import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyGreenfieldRunUpdate,
  emptyGreenfieldRun,
} from "@/core/greenfield/runState";

describe("applyGreenfieldRunUpdate", () => {
  it("preserves previous snapshot identity when no semantic field changed", () => {
    const prev = emptyGreenfieldRun();
    const same = applyGreenfieldRunUpdate(prev, {
      runResult: "idle",
      genStatus: "idle",
    });
    assert.equal(same, prev);

    const sameFn = applyGreenfieldRunUpdate(prev, (current) => ({
      filesWritten: current.filesWritten,
      entries: current.entries,
    }));
    assert.equal(sameFn, prev);
  });

  it("returns a new snapshot when a semantic field changes", () => {
    const prev = emptyGreenfieldRun();
    const next = applyGreenfieldRunUpdate(prev, { runResult: "running" });
    assert.notEqual(next, prev);
    assert.equal(next.runResult, "running");
    assert.equal(prev.runResult, "idle");
  });
});
