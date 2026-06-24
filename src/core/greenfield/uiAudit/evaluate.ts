import { isPuzzleGridSource } from "@/core/domain/classify";
import { classifyUiLayout } from "@/core/greenfield/uiAudit/classify";
import { extractUiAuditSnapshotMetrics } from "@/core/greenfield/uiAudit/metrics";
import {
  GENERATED_APP_UI_AUDIT_LABEL,
  STUDIO_UI_AUDIT_LABEL,
} from "@/core/greenfield/uiAudit/previewAuditTarget";
import { computeUiAuditScore } from "@/core/greenfield/uiAudit/score";
import type {
  UiAuditLayoutType,
  UiAuditResult,
  UiAuditTarget,
  UiDomSnapshot,
  UiLayoutClassification,
} from "@/core/greenfield/uiAudit/types";
import { validateUiLayout } from "@/core/greenfield/uiAudit/validate";

function defaultAuditMeta(
  target: UiAuditTarget = "generated_app",
): Pick<UiAuditResult, "auditTarget" | "auditLabel"> {
  return {
    auditTarget: target,
    auditLabel: target === "studio" ? STUDIO_UI_AUDIT_LABEL : GENERATED_APP_UI_AUDIT_LABEL,
  };
}

export function evaluateUiAudit(
  type: UiAuditLayoutType | "unclassified",
  snapshot: UiDomSnapshot,
  classification: UiLayoutClassification,
  auditTarget: UiAuditTarget = "generated_app",
  puzzleGrid = false,
): UiAuditResult {
  const issues = validateUiLayout(type, snapshot, { puzzleGrid });
  const score = computeUiAuditScore(issues);
  const ok = issues.length === 0;
  const details = ok
    ? `${type} layout score=${score}`
    : `${type} score=${score} issues=${issues.join(",")}`;

  return {
    ok,
    type,
    score,
    issues,
    skipped: false,
    details,
    classification,
    metrics: extractUiAuditSnapshotMetrics(snapshot, puzzleGrid),
    ...defaultAuditMeta(auditTarget),
  };
}

export function buildSkippedUiAuditResult(
  reason: string,
  auditTarget: UiAuditTarget = "generated_app",
): UiAuditResult {
  return {
    ok: true,
    type: "unclassified",
    score: 100,
    issues: [],
    skipped: true,
    skipReason: reason,
    details: reason,
    classification: { type: "unclassified", confidence: 0, signals: [] },
    ...defaultAuditMeta(auditTarget),
  };
}

/** Non-blocking UI audit failure when TypeScript, build, and preview already passed. */
export function buildAdvisoryUiAuditResult(audit: UiAuditResult): UiAuditResult {
  const label = audit.auditLabel ?? GENERATED_APP_UI_AUDIT_LABEL;
  return {
    ...audit,
    skipped: true,
    advisory: true,
    skipReason: `${label} advisory: ${audit.details}`,
    details: `${label} advisory: ${audit.details}`,
    auditTarget: audit.auditTarget ?? "generated_app",
    auditLabel: label,
  };
}

export function buildTransportErrorResult(
  error: string,
  classification: UiLayoutClassification,
  auditTarget: UiAuditTarget = "generated_app",
): UiAuditResult {
  return {
    ok: false,
    type: classification.type,
    score: 0,
    issues: ["audit_transport_error"],
    skipped: false,
    details: error,
    classification,
    ...defaultAuditMeta(auditTarget),
  };
}

export function evaluateUiAuditFromSources(
  prompt: string,
  appSource: string | null,
  cssSource: string | null,
  snapshot: UiDomSnapshot,
): UiAuditResult {
  const classification = classifyUiLayout(prompt, appSource, cssSource, snapshot);
  const puzzleGrid = isPuzzleGridSource(appSource, cssSource);
  return evaluateUiAudit(classification.type, snapshot, classification, "generated_app", puzzleGrid);
}

/** Map legacy sudoku snapshot to unified snapshot. */
export function legacyGridSnapshotToDom(snapshot: {
  board: { width: number; height: number } | null;
  cells: readonly { width: number; height: number }[];
  cellCount: number;
  controls: readonly { width: number; height: number; visible: boolean }[];
  hasRowWrappers: boolean;
}): UiDomSnapshot {
  return {
    viewport: { width: 900, height: 900 },
    controls: snapshot.controls.map((c) => ({
      ...c,
      top: 0,
      left: 0,
      tag: "button",
    })),
    grid: snapshot.board
      ? {
          width: snapshot.board.width,
          height: snapshot.board.height,
          cellCount: snapshot.cellCount,
          cells: snapshot.cells,
          hasRowWrappers: snapshot.hasRowWrappers,
        }
      : null,
    form: null,
    table: null,
    chat: null,
    calculator: null,
    dashboardPanels: [],
    horizontalOverflow: false,
    rootHasContent: true,
  };
}
