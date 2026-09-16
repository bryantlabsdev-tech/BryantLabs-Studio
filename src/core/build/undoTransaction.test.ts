import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatUndoFailureReason,
  snapshotsMatch,
  type UndoPathSnapshot,
} from "./undoTransaction.ts";

function snap(
  path: string,
  content: string,
  existed = true,
): UndoPathSnapshot {
  return { key: path, path, label: path, existed, content };
}

describe("undoTransaction helpers", () => {
  it("detects snapshot divergence", () => {
    const basis = [snap("a.ts", "one")];
    const current = [snap("a.ts", "two")];
    const result = snapshotsMatch(basis, current);
    assert.equal(result.ok, false);
  });

  it("formats compensation failures with dirty paths", () => {
    const reason = formatUndoFailureReason({
      reason: "restore failed",
      failedLabel: "src/App.tsx",
      wrapPath: true,
      compensationAttempted: true,
      compensationOk: false,
      compensationErrors: ["src/New.tsx: compensation blocked"],
      dirtyLabels: ["src/New.tsx"],
    });
    assert.match(reason, /src\/App\.tsx/);
    assert.match(reason, /restore failed/);
    assert.match(reason, /compensation blocked/);
    assert.match(reason, /Remaining dirty paths: src\/New\.tsx/);
  });
});
