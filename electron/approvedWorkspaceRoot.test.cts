import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import * as path from "node:path";
import {
  approveWorkspaceRoot,
  isApprovedWorkspaceRoot,
  resetApprovedWorkspaceRootsForTests,
} from "./approvedWorkspaceRoot.cjs";

describe("approvedWorkspaceRoot", () => {
  beforeEach(() => {
    resetApprovedWorkspaceRootsForTests();
  });

  it("rejects unapproved paths", () => {
    assert.equal(isApprovedWorkspaceRoot("/tmp/unapproved"), false);
  });

  it("accepts explicitly approved roots", () => {
    const root = approveWorkspaceRoot("/tmp/studio-app");
    assert.equal(isApprovedWorkspaceRoot(root), true);
    assert.equal(isApprovedWorkspaceRoot(path.join(root, ".")), true);
  });

  it("accepts the open project root even if not in the set", () => {
    assert.equal(
      isApprovedWorkspaceRoot("/tmp/open-project", "/tmp/open-project"),
      true,
    );
  });

  it("does not treat a sibling of the open project as approved", () => {
    assert.equal(
      isApprovedWorkspaceRoot("/tmp/other", "/tmp/open-project"),
      false,
    );
  });
});
