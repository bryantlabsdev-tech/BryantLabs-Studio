export type {
  UiAuditHistoryEntry,
  UiAuditIssue,
  UiAuditIssueDiagnostic,
  UiAuditFailureDiagnostics,
  UiAuditLayoutType,
  UiAuditResult,
  UiAuditSnapshotMetrics,
  UiAuditSnapshotTransport,
  UiDomSnapshot,
  UiLayoutClassification,
} from "@/core/greenfield/uiAudit/types";

export { classifyUiLayout, resolveUiAuditKind } from "@/core/greenfield/uiAudit/classify";
export { buildDomAuditScript } from "@/core/greenfield/uiAudit/domSnapshot";
export {
  buildUiAuditFailureDiagnostics,
  diagnoseUiAuditIssue,
} from "@/core/greenfield/uiAudit/diagnostics";
export { extractUiAuditSnapshotMetrics } from "@/core/greenfield/uiAudit/metrics";
export {
  evaluateUiAudit,
  evaluateUiAuditFromSources,
  buildTransportErrorResult,
  buildSkippedUiAuditResult,
  buildAdvisoryUiAuditResult,
  legacyGridSnapshotToDom,
} from "@/core/greenfield/uiAudit/evaluate";
export {
  GENERATED_APP_UI_AUDIT_LABEL,
  STUDIO_UI_AUDIT_LABEL,
  validateGeneratedAppPreviewAuditUrl,
} from "@/core/greenfield/uiAudit/previewAuditTarget";
export { computeUiAuditScore } from "@/core/greenfield/uiAudit/score";
export { validateUiLayout } from "@/core/greenfield/uiAudit/validate";
export {
  logUiAuditStart,
  logUiAuditResult,
  logUiAuditSkipped,
  formatUiAuditLogLine,
  logUiRepairStart,
  logUiRepairPatchGenerated,
  logUiRepairPatchApplied,
  logRunComplete,
} from "@/core/greenfield/uiAudit/logging";
export {
  appendUiAuditHistory,
  createUiAuditHistoryEntry,
  formatUiAuditHistorySection,
  summarizeUiAuditPatterns,
} from "@/core/greenfield/uiAudit/history";
export {
  buildUiRepairPatches,
  resolveUiRepairStrategy,
} from "@/core/greenfield/uiAudit/repair";
