import type {
  UiAuditIssue,
  UiAuditLayoutType,
  UiDomSnapshot,
} from "@/core/greenfield/uiAudit/types";

const MIN_CONTROL_PX = 28;
const MIN_VISIBLE_CONTROLS = 3;
const SQUARE_MIN_RATIO = 0.9;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function cellsAreEqual(
  cells: readonly { readonly width: number; readonly height: number }[],
): boolean {
  if (cells.length < 9) return false;
  const widths = cells.map((c) => c.width).filter((w) => w > 0);
  const heights = cells.map((c) => c.height).filter((h) => h > 0);
  if (widths.length === 0 || heights.length === 0) return false;
  const mw = median(widths);
  const mh = median(heights);
  const tol = 0.15;
  return (
    widths.every((w) => Math.abs(w - mw) <= mw * tol) &&
    heights.every((h) => Math.abs(h - mh) <= mh * tol)
  );
}

function controlsOverlap(snapshot: UiDomSnapshot): boolean {
  const rects = snapshot.controls.filter((c) => c.visible);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlap =
        a.left < b.left + b.width &&
        a.left + a.width > b.left &&
        a.top < b.top + b.height &&
        a.top + a.height > b.top;
      if (overlap && a.width > 0 && b.width > 0) return true;
    }
  }
  return false;
}

function visibleControlCount(snapshot: UiDomSnapshot): number {
  return snapshot.controls.filter((c) => c.visible).length;
}

function validateGridLayout(snapshot: UiDomSnapshot, puzzleGrid: boolean): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  const grid = snapshot.grid;
  if (!grid || grid.width <= 0 || grid.height <= 0) {
    issues.push("no_board");
    return issues;
  }
  const minCells = puzzleGrid ? 81 : 4;
  if (grid.cellCount < minCells) {
    issues.push("insufficient_cells");
  }
  if (puzzleGrid) {
    if (grid.width < grid.height * SQUARE_MIN_RATIO || grid.height < grid.width * SQUARE_MIN_RATIO) {
      issues.push("board_not_square");
    }
    if (grid.height > grid.width * 1.35 || grid.hasRowWrappers) {
      issues.push("vertical_strip");
    }
    if (grid.cells.some((c) => c.height < 8 || c.width < 8)) {
      issues.push("cells_collapsed");
    } else if (!cellsAreEqual(grid.cells)) {
      issues.push("cells_unequal");
    }
  }
  if (visibleControlCount(snapshot) < MIN_VISIBLE_CONTROLS) {
    issues.push("controls_not_visible");
  }
  return issues;
}

function validateFormLayout(snapshot: UiDomSnapshot): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  const form = snapshot.form;
  if (!form || form.fieldCount === 0) {
    issues.push("fields_too_small");
    return issues;
  }
  if (!form.submitVisible) issues.push("submit_hidden");
  if (form.fields.some((f) => f.width < MIN_CONTROL_PX || f.height < MIN_CONTROL_PX)) {
    issues.push("fields_too_small");
  }
  if (controlsOverlap(snapshot)) issues.push("controls_overlapping");
  return issues;
}

function validateDashboardLayout(snapshot: UiDomSnapshot): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  if (snapshot.dashboardPanels.length < 2) {
    issues.push("panels_collapsed");
  } else if (snapshot.dashboardPanels.some((p) => p.width < 80 || p.height < 40)) {
    issues.push("panels_collapsed");
  }
  const sidebar = snapshot.dashboardPanels.find((p) => p.width < 200 && p.height > 200);
  if (!sidebar && /sidebar/.test(JSON.stringify(snapshot))) {
    issues.push("sidebar_hidden");
  }
  if (snapshot.horizontalOverflow) issues.push("content_overflow");
  return issues;
}

function validateCalculatorLayout(snapshot: UiDomSnapshot): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  const calc = snapshot.calculator;
  if (!calc) {
    issues.push("display_too_small");
    issues.push("buttons_too_small");
    return issues;
  }
  if (!calc.displayVisible || calc.displayHeight < 24) issues.push("display_too_small");
  if (calc.buttonsTooSmall > 0 || calc.buttonCount < 4) issues.push("buttons_too_small");
  if (calc.buttonCount >= 4 && calc.buttonsTooSmall > calc.buttonCount / 2) {
    issues.push("keypad_misaligned");
  }
  return issues;
}

function validateChatLayout(snapshot: UiDomSnapshot): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  const chat = snapshot.chat;
  if (!chat) {
    issues.push("messages_hidden");
    issues.push("input_hidden");
    return issues;
  }
  if (chat.messageCount === 0) issues.push("messages_hidden");
  if (!chat.inputVisible) issues.push("input_hidden");
  if (chat.threadHeight < 80) issues.push("thread_collapsed");
  return issues;
}

function validateMobileLayout(snapshot: UiDomSnapshot): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  if (snapshot.horizontalOverflow) issues.push("horizontal_overflow");
  const small = snapshot.controls.filter(
    (c) => c.visible && (c.width < MIN_CONTROL_PX || c.height < MIN_CONTROL_PX),
  );
  if (small.length > snapshot.controls.length / 3) issues.push("touch_targets_small");
  if (snapshot.viewport.width < 320 || snapshot.viewport.height < 400) {
    issues.push("viewport_broken");
  }
  if (visibleControlCount(snapshot) < 2) issues.push("controls_not_visible");
  return issues;
}

function validateTableLayout(snapshot: UiDomSnapshot): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  const table = snapshot.table;
  if (!table || table.rowCount < 2) {
    issues.push("rows_overflow");
    return issues;
  }
  if (!table.headerVisible) issues.push("header_hidden");
  if (table.columnCount < 2 || table.width < 120) issues.push("columns_collapsed");
  if (table.height < 60) issues.push("rows_overflow");
  return issues;
}

function validateUniversal(snapshot: UiDomSnapshot): UiAuditIssue[] {
  const issues: UiAuditIssue[] = [];
  if (!snapshot.rootHasContent) issues.push("root_empty");
  return issues;
}

export interface ValidateUiLayoutOptions {
  readonly puzzleGrid?: boolean;
}

export function validateUiLayout(
  type: UiAuditLayoutType | "unclassified",
  snapshot: UiDomSnapshot,
  options: ValidateUiLayoutOptions = {},
): UiAuditIssue[] {
  const puzzleGrid = options.puzzleGrid ?? false;
  const universal = validateUniversal(snapshot);
  if (type === "unclassified") {
    return [...universal, ...validateMobileLayout(snapshot)];
  }

  let specific: UiAuditIssue[] = [];
  switch (type) {
    case "grid_layout":
      specific = validateGridLayout(snapshot, puzzleGrid);
      break;
    case "form_layout":
      specific = validateFormLayout(snapshot);
      break;
    case "dashboard_layout":
      specific = validateDashboardLayout(snapshot);
      break;
    case "calculator_layout":
      specific = validateCalculatorLayout(snapshot);
      break;
    case "chat_layout":
      specific = validateChatLayout(snapshot);
      break;
    case "mobile_layout":
      specific = validateMobileLayout(snapshot);
      break;
    case "table_layout":
      specific = validateTableLayout(snapshot);
      break;
  }

  const merged = [...universal, ...specific];
  return [...new Set(merged)];
}
