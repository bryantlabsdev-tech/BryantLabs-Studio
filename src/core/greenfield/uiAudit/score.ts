import type { UiAuditIssue } from "@/core/greenfield/uiAudit/types";

const ISSUE_PENALTY: Partial<Record<UiAuditIssue, number>> = {
  audit_transport_error: 100,
  root_empty: 80,
  no_board: 25,
  insufficient_cells: 20,
  board_not_square: 22,
  vertical_strip: 28,
  cells_unequal: 18,
  cells_collapsed: 20,
  controls_not_visible: 15,
  controls_overlapping: 18,
  submit_hidden: 22,
  fields_too_small: 14,
  labels_missing: 8,
  panels_collapsed: 16,
  sidebar_hidden: 12,
  content_overflow: 14,
  display_too_small: 20,
  buttons_too_small: 18,
  keypad_misaligned: 12,
  messages_hidden: 20,
  input_hidden: 25,
  thread_collapsed: 15,
  horizontal_overflow: 20,
  touch_targets_small: 18,
  viewport_broken: 22,
  columns_collapsed: 18,
  header_hidden: 12,
  rows_overflow: 14,
};

export function computeUiAuditScore(issues: readonly UiAuditIssue[]): number {
  if (issues.length === 0) return 100;
  let penalty = 0;
  for (const issue of issues) {
    penalty += ISSUE_PENALTY[issue] ?? 10;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}
