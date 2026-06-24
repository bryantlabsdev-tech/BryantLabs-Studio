import type { UiAuditSnapshotMetrics, UiDomSnapshot } from "@/core/greenfield/uiAudit/types";

const PUZZLE_GRID_EXPECTED_CELL_COUNT = 81;
const GENERIC_GRID_MIN_CELLS = 4;

/** Capture DOM counts at audit time for later user-facing diagnostics. */
export function extractUiAuditSnapshotMetrics(
  snapshot: UiDomSnapshot,
  puzzleGrid = false,
): UiAuditSnapshotMetrics {
  const grid = snapshot.grid;
  return {
    gridCellCount: grid?.cellCount ?? null,
    gridExpectedCells: grid
      ? puzzleGrid
        ? PUZZLE_GRID_EXPECTED_CELL_COUNT
        : GENERIC_GRID_MIN_CELLS
      : null,
    gridBoardFound: Boolean(grid && grid.width > 0 && grid.height > 0),
    calculatorButtonCount: snapshot.calculator?.buttonCount ?? null,
    calculatorButtonsTooSmall: snapshot.calculator?.buttonsTooSmall ?? null,
    calculatorDisplayHeight: snapshot.calculator?.displayHeight ?? null,
    calculatorDisplayVisible: snapshot.calculator?.displayVisible ?? null,
    formFieldCount: snapshot.form?.fieldCount ?? null,
    tableRowCount: snapshot.table?.rowCount ?? null,
    visibleControlCount: snapshot.controls.filter((control) => control.visible).length,
    dashboardPanelCount: snapshot.dashboardPanels.length,
    chatMessageCount: snapshot.chat?.messageCount ?? null,
    rootHasContent: snapshot.rootHasContent,
    horizontalOverflow: snapshot.horizontalOverflow,
  };
}
