import type { UiRepairPatch } from "@/core/greenfield/uiAudit/repair/types";

export const GRID_LAYOUT_REPAIR_STRATEGY = "grid_layout_css";

export function detectBrokenRowGrid(appSource: string): boolean {
  return /sudoku-board|game-board|grid-board/.test(appSource) && /cell-row/.test(appSource);
}

export function repairGridAppTsx(appSource: string): string | null {
  if (!detectBrokenRowGrid(appSource)) return null;

  let next = appSource;

  next = next.replace(
    /\{grid\.map\(\(row, rIndex\) => \(\s*<div key=\{rIndex\} className="cell-row">\s*\{row\.map\(\(cell, cIndex\) => \(/g,
    "{grid.map((row, rIndex) =>\n            row.map((cell, cIndex) => (",
  );

  next = next.replace(
    /\{grid\.map\(\(row, rIndex\) => \(\s*<div key=\{rIndex\} className="cell-row">\s*\{row\.map\(\(cell, cIndex\) => \{/g,
    "{grid.map((row, rIndex) =>\n            row.map((cell, cIndex) => {",
  );

  next = next.replace(/\)\)\}\s*<\/div>\s*\)\)\}/g, "),\n          )}");
  next = next.replace(/\}\)\}\s*<\/div>\s*\)\)\}/g, "}),\n          )}");

  if (!/role="grid"/.test(next)) {
    next = next.replace(
      /className="(?:sudoku-board|game-board|grid-board)"/,
      'className="sudoku-board" role="grid" aria-label="Game board"',
    );
  }

  next = next.replace(
    /<div\s+key=\{cIndex\}\s+className=\{className\}\s+onClick=\{\(\) => handleCellClick\(rIndex, cIndex\)\}\s*>/g,
    `<div
                    key={\`\${rIndex}-\${cIndex}\`}
                    role="gridcell"
                    className={className}
                    data-row={rIndex}
                    data-col={cIndex}
                    onClick={() => handleCellClick(rIndex, cIndex)}
                  >`,
  );

  next = next.replace(
    /<div\s+key=\{cIndex\}\s+className="cell"\s+onClick=\{\(\) => setSelected\(\{ row: rIndex, col: cIndex \}\)\}\s*>/g,
    `<div
                  key={\`\${rIndex}-\${cIndex}\`}
                  role="gridcell"
                  className="cell"
                  data-row={rIndex}
                  data-col={cIndex}
                  onClick={() => setSelected({ row: rIndex, col: cIndex })}
                >`,
  );

  next = next.replace(/>\s*\{cell\}\s*<\/div>/g, ">\n                    {cell ?? \"\"}\n                  </div>");

  return next !== appSource ? next : null;
}

const BOARD_CSS = `.sudoku-board,
.game-board,
.grid-board {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(9, 1fr);
  aspect-ratio: 1;
  width: min(90vw, 540px);
  max-width: 100%;
  border: 3px solid var(--border-thick-color, #888);
  background-color: var(--board-bg-color, #2a2a2a);
}`;

const CELL_CSS = `.cell {
  display: flex;
  justify-content: center;
  align-items: center;
  aspect-ratio: 1;
  min-width: 0;
  min-height: 0;
  font-size: clamp(1.1rem, 3.5vw, 2rem);
  border: 1px solid var(--border-color, #555);
  cursor: pointer;
}

.cell[data-col="2"],
.cell[data-col="5"] {
  border-right: 2px solid var(--border-thick-color, #888);
}

.cell[data-row="2"],
.cell[data-row="5"] {
  border-bottom: 2px solid var(--border-thick-color, #888);
}`;

export function repairGridIndexCss(cssSource: string): string | null {
  if (!/\.(?:sudoku-board|game-board|grid-board)/.test(cssSource)) return null;

  let next = cssSource;
  next = next.replace(
    /\.(?:sudoku-board|game-board|grid-board)\s*\{[\s\S]*?\}/,
    `${BOARD_CSS}\n`,
  );
  next = next.replace(/\.cell-row[^{]*\{[\s\S]*?\}/g, "");
  next = next.replace(/\.cell:nth-child\([^)]+\)\s*\{[\s\S]*?\}/g, "");
  next = next.replace(/\.cell-row:nth-child\([^)]+\)[^{]*\{[\s\S]*?\}/g, "");
  next = next.replace(/\.cell\s*\{[\s\S]*?\}/, `${CELL_CSS}\n`);

  if (!/clamp\(52px/.test(next)) {
    next = next.replace(
      /\.number-pad button,\s*\n\.action-buttons button\s*\{[\s\S]*?\}/,
      `.number-pad button,
.action-buttons button {
  width: clamp(52px, 12vw, 72px);
  height: clamp(52px, 12vw, 72px);
  font-size: clamp(1.25rem, 3vw, 1.75rem);
}`,
    );
  }

  return next !== cssSource ? next : null;
}

export function buildGridLayoutRepairPatches(
  appSource: string | null,
  cssSource: string | null,
): UiRepairPatch[] {
  const patches: UiRepairPatch[] = [];
  if (appSource) {
    const repairedApp = repairGridAppTsx(appSource);
    if (repairedApp) patches.push({ relPath: "src/App.tsx", content: repairedApp });
  }
  if (cssSource) {
    const repairedCss = repairGridIndexCss(cssSource);
    if (repairedCss) patches.push({ relPath: "src/index.css", content: repairedCss });
  }
  return patches;
}
