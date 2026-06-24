/** Framework-wide post-preview UI audit types. */

export type UiAuditLayoutType =
  | "grid_layout"
  | "form_layout"
  | "dashboard_layout"
  | "calculator_layout"
  | "chat_layout"
  | "mobile_layout"
  | "table_layout";

export type UiAuditIssue =
  | "audit_transport_error"
  | "root_empty"
  | "no_board"
  | "insufficient_cells"
  | "board_not_square"
  | "vertical_strip"
  | "cells_unequal"
  | "cells_collapsed"
  | "controls_not_visible"
  | "controls_overlapping"
  | "submit_hidden"
  | "fields_too_small"
  | "labels_missing"
  | "panels_collapsed"
  | "sidebar_hidden"
  | "content_overflow"
  | "display_too_small"
  | "buttons_too_small"
  | "keypad_misaligned"
  | "messages_hidden"
  | "input_hidden"
  | "thread_collapsed"
  | "horizontal_overflow"
  | "touch_targets_small"
  | "viewport_broken"
  | "columns_collapsed"
  | "header_hidden"
  | "rows_overflow";

export interface ControlRect {
  readonly width: number;
  readonly height: number;
  readonly visible: boolean;
  readonly top: number;
  readonly left: number;
  readonly tag: string;
}

export interface GridRegion {
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  readonly cells: readonly { readonly width: number; readonly height: number }[];
  readonly hasRowWrappers: boolean;
}

export interface FormRegion {
  readonly fieldCount: number;
  readonly submitVisible: boolean;
  readonly fields: readonly ControlRect[];
}

export interface TableRegion {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly headerVisible: boolean;
  readonly width: number;
  readonly height: number;
}

export interface ChatRegion {
  readonly messageCount: number;
  readonly inputVisible: boolean;
  readonly threadHeight: number;
}

export interface CalculatorRegion {
  readonly displayVisible: boolean;
  readonly displayHeight: number;
  readonly buttonCount: number;
  readonly buttonsTooSmall: number;
}

export interface UiDomSnapshot {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly controls: readonly ControlRect[];
  readonly grid: GridRegion | null;
  readonly form: FormRegion | null;
  readonly table: TableRegion | null;
  readonly chat: ChatRegion | null;
  readonly calculator: CalculatorRegion | null;
  readonly dashboardPanels: readonly { readonly width: number; readonly height: number }[];
  readonly horizontalOverflow: boolean;
  readonly rootHasContent: boolean;
}

export interface UiLayoutClassification {
  readonly type: UiAuditLayoutType | "unclassified";
  readonly confidence: number;
  readonly signals: readonly string[];
}

/** Snapshot counts captured at audit time for user-facing diagnostics. */
export interface UiAuditSnapshotMetrics {
  readonly gridCellCount: number | null;
  readonly gridExpectedCells: number | null;
  readonly gridBoardFound: boolean;
  readonly calculatorButtonCount: number | null;
  readonly calculatorButtonsTooSmall: number | null;
  readonly calculatorDisplayHeight: number | null;
  readonly calculatorDisplayVisible: boolean | null;
  readonly formFieldCount: number | null;
  readonly tableRowCount: number | null;
  readonly visibleControlCount: number | null;
  readonly dashboardPanelCount: number | null;
  readonly chatMessageCount: number | null;
  readonly rootHasContent: boolean;
  readonly horizontalOverflow: boolean;
}

export interface UiAuditIssueDiagnostic {
  readonly issue: UiAuditIssue;
  readonly reason: string;
  readonly suggestedFix: string;
}

/** User-facing UI audit failure breakdown (raw codes preserved separately). */
export interface UiAuditFailureDiagnostics {
  readonly title: string;
  readonly whatFailed: string;
  readonly reason: string;
  readonly suggestedFix: string;
  readonly issueDetails: readonly UiAuditIssueDiagnostic[];
  readonly rawDetails: string;
  readonly rawIssueCodes: readonly UiAuditIssue[];
  readonly layoutType: UiAuditLayoutType | "unclassified";
  readonly score: number;
}

export type UiAuditTarget = "generated_app" | "studio";

export interface UiAuditResult {
  readonly ok: boolean;
  readonly type: UiAuditLayoutType | "unclassified";
  readonly score: number;
  readonly issues: readonly UiAuditIssue[];
  readonly skipped: boolean;
  readonly skipReason?: string;
  /** Optional advisory failures do not fail the greenfield run when build/preview passed. */
  readonly advisory?: boolean;
  readonly auditTarget?: UiAuditTarget;
  readonly auditLabel?: string;
  readonly strategy?: string;
  readonly details: string;
  readonly classification: UiLayoutClassification;
  readonly metrics?: UiAuditSnapshotMetrics;
}

export interface UiAuditHistoryEntry {
  readonly at: string;
  readonly type: UiAuditLayoutType | "unclassified";
  readonly score: number;
  readonly issues: readonly string[];
  readonly ok: boolean;
  readonly repaired: boolean;
  readonly strategy?: string;
}

export interface UiAuditSnapshotTransport {
  readonly ok: boolean;
  readonly snapshot: UiDomSnapshot | null;
  readonly error?: string;
}
