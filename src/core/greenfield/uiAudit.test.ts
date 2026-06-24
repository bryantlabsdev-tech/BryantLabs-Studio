import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  classifyUiLayout,
  evaluateUiAudit,
  formatUiAuditLogLine,
  legacyGridSnapshotToDom,
  resolveUiAuditKind,
} from "@/core/greenfield/uiAudit";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/brokenSudokuGrid",
);

function readFixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}

function brokenGridMetrics() {
  return legacyGridSnapshotToDom({
    board: { width: 120, height: 810 },
    cells: Array.from({ length: 81 }, () => ({ width: 120, height: 10 })),
    cellCount: 81,
    controls: [
      { width: 24, height: 24, visible: false },
      { width: 80, height: 36, visible: true },
      { width: 80, height: 36, visible: true },
      { width: 80, height: 36, visible: true },
    ],
    hasRowWrappers: true,
  });
}

function healthyGridMetrics() {
  return legacyGridSnapshotToDom({
    board: { width: 540, height: 540 },
    cells: Array.from({ length: 81 }, () => ({ width: 60, height: 60 })),
    cellCount: 81,
    controls: [
      { width: 60, height: 60, visible: true },
      { width: 60, height: 60, visible: true },
      { width: 60, height: 60, visible: true },
      { width: 100, height: 40, visible: true },
    ],
    hasRowWrappers: false,
  });
}

describe("uiAudit", () => {
  const appSource = readFixture("App.tsx");
  const cssSource = readFixture("index.css");

  it("classifies broken Sudoku fixture as grid_layout", () => {
    const classification = classifyUiLayout(
      "Build a sudoku puzzle app",
      appSource,
      cssSource,
      brokenGridMetrics(),
    );
    assert.equal(classification.type, "grid_layout");
    assert.equal(resolveUiAuditKind(appSource, cssSource, "sudoku"), "grid_layout");
  });

  it("fails grid_layout audit for tall vertical strip metrics", () => {
    const classification = classifyUiLayout("", appSource, cssSource);
    const result = evaluateUiAudit(
      "grid_layout",
      brokenGridMetrics(),
      classification,
      "generated_app",
      true,
    );
    assert.equal(result.ok, false);
    assert.equal(result.type, "grid_layout");
    assert.ok(result.issues.includes("board_not_square"));
    assert.ok(result.score < 100);
    assert.match(formatUiAuditLogLine(result), /\[ui:audit\]/);
    assert.match(formatUiAuditLogLine(result), /type=grid_layout/);
  });

  it("passes grid_layout audit for square board with equal cells", () => {
    const classification = classifyUiLayout("", appSource, cssSource);
    const result = evaluateUiAudit(
      "grid_layout",
      healthyGridMetrics(),
      classification,
      "generated_app",
      true,
    );
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
    assert.equal(result.score, 100);
  });
});
