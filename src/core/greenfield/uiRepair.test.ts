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
  repairSudokuGridAppTsx,
  repairSudokuGridIndexCss,
} from "@/core/greenfield/uiRepair";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/brokenSudokuGrid",
);

function readFixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}

describe("uiRepair", () => {
  const brokenApp = readFixture("App.tsx");
  const brokenCss = readFixture("index.css");

  it("detects broken row-wrapped Sudoku board", () => {
    assert.equal(detectBrokenSudokuRowGrid(brokenApp), true);
  });

  it("generates patches that flatten the grid and fix CSS", () => {
    const patches = buildSudokuGridRepairPatches(brokenApp, brokenCss);
    assert.ok(patches.some((p) => p.relPath === "src/App.tsx"));
    assert.ok(patches.some((p) => p.relPath === "src/index.css"));

    const appPatch = patches.find((p) => p.relPath === "src/App.tsx")!.content;
    const cssPatch = patches.find((p) => p.relPath === "src/index.css")!.content;

    assert.equal(/cell-row/.test(appPatch), false);
    assert.match(appPatch, /role="grid"/);
    assert.match(appPatch, /data-row=\{rIndex\}/);
    assert.match(cssPatch, /grid-template-rows:\s*repeat\(9/);
    assert.match(cssPatch, /aspect-ratio:\s*1/);
    assert.match(cssPatch, /clamp\(52px/);
  });

  it("moves repaired layout metrics from fail to pass", () => {
    const repairedApp = repairSudokuGridAppTsx(brokenApp)!;
    const repairedCss = repairSudokuGridIndexCss(brokenCss)!;
    assert.ok(repairedApp);
    assert.ok(repairedCss);
    assert.equal(detectBrokenSudokuRowGrid(repairedApp), false);

    const classification = classifyUiLayout("sudoku", repairedApp, repairedCss);
    const before = evaluateUiAudit(
      "grid_layout",
      legacyGridSnapshotToDom({
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
      }),
      classification,
      "generated_app",
      true,
    );
    assert.equal(before.ok, false);

    const after = evaluateUiAudit(
      "grid_layout",
      legacyGridSnapshotToDom({
        board: { width: 540, height: 520 },
        cells: Array.from({ length: 81 }, () => ({ width: 60, height: 58 })),
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
