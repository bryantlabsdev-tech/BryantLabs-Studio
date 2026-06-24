import type {
  UiAuditFailureDiagnostics,
  UiAuditIssue,
  UiAuditIssueDiagnostic,
  UiAuditLayoutType,
  UiAuditResult,
  UiAuditSnapshotMetrics,
} from "@/core/greenfield/uiAudit/types";

const GRID_EXPECTED_CELL_COUNT = 81;

const LAYOUT_FAILURE_TITLES: Record<UiAuditLayoutType | "unclassified", string> = {
  grid_layout: "Grid Layout Failure",
  calculator_layout: "Calculator Layout Failure",
  form_layout: "Form Layout Failure",
  dashboard_layout: "Dashboard Layout Failure",
  chat_layout: "Chat Layout Failure",
  mobile_layout: "Mobile Layout Failure",
  table_layout: "Table Layout Failure",
  unclassified: "UI Layout Failure",
};

const ISSUE_SUGGESTED_FIX: Partial<Record<UiAuditIssue, string>> = {
  audit_transport_error:
    "Ensure the preview is running and reachable before the UI audit snapshot runs.",
  root_empty:
    "Verify the app mounts content into #root (or main) before the preview snapshot.",
  no_board:
    "Verify the main layout container renders before the preview snapshot (e.g. [role=grid] or a table).",
  insufficient_cells:
    "Ensure enough visible cells or rows render in the layout before audit.",
  board_not_square:
    "Use equal row and column counts so the board stays square in the preview viewport.",
  vertical_strip:
    "Set explicit width and grid layout on the main board container so cells wrap into rows.",
  cells_unequal:
    "Apply consistent cell width and height in CSS (equal-sized grid cells).",
  cells_collapsed:
    "Ensure cell elements retain min-width and min-height so they stay visible.",
  controls_not_visible:
    "Keep primary buttons and inputs visible within the preview viewport.",
  controls_overlapping:
    "Adjust layout spacing so interactive controls do not overlap.",
  submit_hidden:
    "Ensure the primary submit button is visible and not clipped or hidden.",
  fields_too_small:
    "Increase input and field dimensions to at least 44px for usability.",
  labels_missing:
    "Associate visible labels with each form field.",
  panels_collapsed:
    "Give dashboard panels and cards minimum width and height so they stay readable.",
  sidebar_hidden:
    "Ensure sidebar or navigation panels render with non-zero size in the preview.",
  content_overflow:
    "Fix overflow rules so dashboard content stays within the viewport.",
  display_too_small:
    "Increase calculator display height and font size (min-height ~48px).",
  buttons_too_small:
    "Size calculator keypad buttons to at least 52×52px with readable text.",
  keypad_misaligned:
    "Align calculator buttons in a consistent grid with even spacing.",
  messages_hidden:
    "Render at least one visible chat message in the conversation thread.",
  input_hidden:
    "Ensure the chat input is visible and not collapsed.",
  thread_collapsed:
    "Give the chat thread a minimum height so messages remain readable.",
  horizontal_overflow:
    "Remove horizontal scrolling by constraining widths and using responsive layout.",
  touch_targets_small:
    "Increase touch target size to at least 44×44px on mobile layouts.",
  viewport_broken:
    "Fix responsive root sizing and viewport meta configuration.",
  columns_collapsed:
    "Ensure table columns have minimum width and are not collapsed.",
  header_hidden:
    "Keep table header cells visible (use thead/th).",
  rows_overflow:
    "Ensure the table renders enough rows and fits within the layout.",
};

function resolveFailureTitle(
  layoutType: UiAuditLayoutType | "unclassified",
  issues: readonly UiAuditIssue[],
  auditLabel?: string,
): string {
  let base: string;
  if (layoutType === "grid_layout" && issues.includes("no_board")) {
    base = "Board Not Found";
  } else {
    base = LAYOUT_FAILURE_TITLES[layoutType];
  }
  return auditLabel ? `${auditLabel}: ${base}` : base;
}

function buildIssueReason(
  issue: UiAuditIssue,
  metrics: UiAuditSnapshotMetrics | undefined,
  layoutType: UiAuditLayoutType | "unclassified",
): string {
  switch (issue) {
    case "audit_transport_error":
      return "Could not inspect the preview DOM for UI audit.";
    case "root_empty":
      return metrics?.rootHasContent === false
        ? "Preview root rendered empty content."
        : "Preview root has no readable content.";
    case "no_board":
      return layoutType === "grid_layout"
        ? "No recognizable grid layout detected."
        : "Expected layout container was not detected in the preview.";
    case "insufficient_cells": {
      const expected = metrics?.gridExpectedCells ?? GRID_EXPECTED_CELL_COUNT;
      const detected = metrics?.gridCellCount ?? 0;
      return `Expected ${expected} visible cells but detected ${detected}.`;
    }
    case "board_not_square":
      return "Board layout is not square (width and height differ too much).";
    case "vertical_strip":
      return "Board collapsed into a vertical strip instead of a grid.";
    case "cells_unequal":
      return "Board cells have unequal sizes.";
    case "cells_collapsed":
      return "One or more board cells collapsed to near-zero size.";
    case "controls_not_visible": {
      const count = metrics?.visibleControlCount ?? 0;
      return `Too few visible controls detected (${count}).`;
    }
    case "controls_overlapping":
      return "Interactive controls overlap in the preview.";
    case "submit_hidden":
      return "Primary submit control is hidden or not visible.";
    case "fields_too_small":
      return "One or more form fields are smaller than the minimum usable size.";
    case "labels_missing":
      return "Form fields are missing associated labels.";
    case "panels_collapsed":
      return "Dashboard panels appear collapsed or too small to read.";
    case "sidebar_hidden":
      return "Sidebar or navigation panel is not visible.";
    case "content_overflow":
      return "Dashboard content overflows the viewport.";
    case "display_too_small": {
      const height = metrics?.calculatorDisplayHeight ?? 0;
      return metrics?.calculatorDisplayVisible === false
        ? "Calculator display is not visible."
        : `Calculator display is too small (height ${height}px).`;
    }
    case "buttons_too_small": {
      const buttons = metrics?.calculatorButtonCount ?? 0;
      const tooSmall = metrics?.calculatorButtonsTooSmall ?? 0;
      if (buttons < 4) {
        return `Expected at least 4 calculator buttons but detected ${buttons}.`;
      }
      return `${tooSmall} calculator button${tooSmall === 1 ? "" : "s"} below minimum size.`;
    }
    case "keypad_misaligned":
      return "Calculator keypad buttons are misaligned or inconsistently sized.";
    case "messages_hidden":
      return "Chat messages are not visible in the preview.";
    case "input_hidden":
      return "Chat input is hidden or not visible.";
    case "thread_collapsed":
      return "Chat thread height is too small to show messages.";
    case "horizontal_overflow":
      return metrics?.horizontalOverflow
        ? "Layout causes horizontal scrolling in the preview."
        : "Layout overflows horizontally on the target viewport.";
    case "touch_targets_small":
      return "Too many touch targets are smaller than recommended.";
    case "viewport_broken":
      return "Viewport dimensions appear broken for the target layout.";
    case "columns_collapsed":
      return "Table columns are collapsed or too narrow.";
    case "header_hidden":
      return "Table header row is not visible.";
    case "rows_overflow":
      return "Table has too few rows or insufficient height.";
    default:
      return `UI audit issue: ${String(issue).replace(/_/g, " ")}.`;
  }
}

function buildIssueDiagnostic(
  issue: UiAuditIssue,
  metrics: UiAuditSnapshotMetrics | undefined,
  layoutType: UiAuditLayoutType | "unclassified",
): UiAuditIssueDiagnostic {
  return {
    issue,
    reason: buildIssueReason(issue, metrics, layoutType),
    suggestedFix:
      ISSUE_SUGGESTED_FIX[issue] ??
      "Adjust layout and CSS so the preview matches the expected UI pattern before re-running audit.",
  };
}

function describeWhatFailed(
  layoutType: UiAuditLayoutType | "unclassified",
  issues: readonly UiAuditIssue[],
): string {
  const layoutLabel = layoutType === "unclassified" ? "UI layout" : layoutType.replace(/_/g, " ");
  if (issues.length === 1) {
    return `${layoutLabel} check failed (${issues[0]!.replace(/_/g, " ")}).`;
  }
  return `${layoutLabel} check failed (${issues.length} issues).`;
}

/** Convert a UI audit result into user-facing failure diagnostics. */
export function buildUiAuditFailureDiagnostics(
  result: UiAuditResult,
): UiAuditFailureDiagnostics | null {
  if (result.ok || result.skipped) return null;

  const issueDetails = result.issues.map((issue) =>
    buildIssueDiagnostic(issue, result.metrics, result.type),
  );
  const primary = issueDetails[0];

  return {
    title: resolveFailureTitle(result.type, result.issues, result.auditLabel),
    whatFailed: describeWhatFailed(result.type, result.issues),
    reason: primary?.reason ?? (result.details.trim() || "UI audit did not pass."),
    suggestedFix:
      primary?.suggestedFix ??
      "Review layout CSS and component structure, then re-run preview verification.",
    issueDetails,
    rawDetails: result.details,
    rawIssueCodes: [...result.issues],
    layoutType: result.type,
    score: result.score,
  };
}

/** @deprecated Use buildUiAuditFailureDiagnostics */
export function diagnoseUiAuditIssue(issue: UiAuditIssue | string): {
  readonly reason: string;
  readonly suggestedFix: string;
} | null {
  if (!issue) return null;
  const diagnostic = buildIssueDiagnostic(issue as UiAuditIssue, undefined, "unclassified");
  return { reason: diagnostic.reason, suggestedFix: diagnostic.suggestedFix };
}
