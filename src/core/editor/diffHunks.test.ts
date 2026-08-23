import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDiffHunks, mergeHunkDecisions } from "@/core/editor/diffHunks";

describe("diffHunks", () => {
  it("splits multi-region edits into hunks", () => {
    const before = "a\nb\nc\nd\n";
    const after = "a\nB\nc\nD\n";
    const hunks = computeDiffHunks(before, after);
    assert.ok(hunks.length >= 2);
  });

  it("rejects a hunk while keeping others", () => {
    const before = "keep\nold\nstay\n";
    const after = "keep\nnew\nstay\nmore\n";
    const merged = mergeHunkDecisions(before, after, { "hunk-0": false });
    assert.equal(merged.includes("new"), false);
    assert.equal(merged.includes("more"), true);
  });

  it("returns empty hunks for identical content", () => {
    assert.deepEqual(computeDiffHunks("same", "same"), []);
  });
});
