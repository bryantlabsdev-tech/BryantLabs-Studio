import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  classifyUiLayout,
  evaluateUiAudit,
  legacyGridSnapshotToDom,
} from "@/core/greenfield/uiAudit";
import {
  buildSudokuGridRepairPatches,
  detectBrokenSudokuRowGrid,
} from "@/core/greenfield/uiRepair";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/brokenSudokuGrid",
);

/**
 * End-to-end Studio UI audit/repair contract (unit-level):
 * broken Sudoku fixture → audit fails → deterministic repair → audit passes.
 */
describe("greenfield UI audit pipeline fixture", () => {
  const brokenApp = readFileSync(path.join(fixtureDir, "App.tsx"), "utf8");
  const brokenCss = readFileSync(path.join(fixtureDir, "index.css"), "utf8");

  it("broken layout fails visual audit metrics", () => {
    assert.equal(detectBrokenSudokuRowGrid(brokenApp), true);
    const classification = classifyUiLayout("sudoku game", brokenApp, brokenCss);
    const audit = evaluateUiAudit(
      "grid_layout",
      legacyGridSnapshotToDom({
        board: { width: 100, height: 900 },
        cells: Array.from({ length: 81 }, () => ({ width: 100, height: 8 })),
        cellCount: 81,
        controls: [
          { width: 24, height: 24, visible: false },
          { width: 90, height: 32, visible: true },
          { width: 90, height: 32, visible: true },
          { width: 90, height: 32, visible: true },
        ],
        hasRowWrappers: true,
      }),
      classification,
      "generated_app",
      true,
    );
    assert.equal(audit.ok, false);
    assert.equal(audit.type, "grid_layout");
    assert.ok(
      audit.issues.includes("board_not_square") ||
        audit.issues.includes("vertical_strip"),
    );
  });

  it("Studio deterministic repair fixes sources then audit passes", () => {
    const patches = buildSudokuGridRepairPatches(brokenApp, brokenCss);
    const repairedApp = patches.find((p) => p.relPath === "src/App.tsx")!.content;
    const repairedCss = patches.find((p) => p.relPath === "src/index.css")!.content;

    assert.equal(detectBrokenSudokuRowGrid(repairedApp), false);
    assert.match(repairedCss, /grid-template-rows:\s*repeat\(9/);

    const classification = classifyUiLayout("sudoku", repairedApp, repairedCss);
    const after = evaluateUiAudit(
      "grid_layout",
      legacyGridSnapshotToDom({
        board: { width: 520, height: 510 },
        cells: Array.from({ length: 81 }, () => ({ width: 57, height: 56 })),
        cellCount: 81,
        controls: [
          { width: 60, height: 60, visible: true },
          { width: 60, height: 60, visible: true },
          { width: 60, height: 60, visible: true },
          { width: 100, height: 40, visible: true },
        ],
        hasRowWrappers: false,
      }),
      classification,
      "generated_app",
      true,
    );
    assert.equal(after.ok, true);
  });
});
