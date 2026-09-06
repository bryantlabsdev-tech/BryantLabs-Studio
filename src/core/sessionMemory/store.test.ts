import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySessionMemoryBranch,
  emptySessionMemory,
  setProjectContext,
} from "@/core/sessionMemory/store";

describe("session memory identity", () => {
  it("applySessionMemoryBranch keeps the previous snapshot when the branch is unchanged", () => {
    const prev = emptySessionMemory("/repo", "main");
    assert.equal(applySessionMemoryBranch(prev, "main"), prev);
    const next = applySessionMemoryBranch(prev, "feat");
    assert.notEqual(next, prev);
    assert.equal(next.branch, "feat");
  });

  it("setProjectContext keeps identity when path and branch match", () => {
    const prev = emptySessionMemory("/repo", "main");
    assert.equal(setProjectContext(prev, "/repo", "main"), prev);
  });
});
