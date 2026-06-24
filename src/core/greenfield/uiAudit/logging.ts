import { GENERATED_APP_UI_AUDIT_LABEL } from "@/core/greenfield/uiAudit/previewAuditTarget";
import type { UiAuditResult } from "@/core/greenfield/uiAudit/types";

export function logUiAuditStart(label: string = GENERATED_APP_UI_AUDIT_LABEL): void {
  console.log(`[ui:audit:start] target=${label}`);
}

export function formatUiAuditLogLine(result: UiAuditResult): string {
  const issuePart =
    result.issues.length > 0 ? result.issues.join(",") : "none";
  return `[ui:audit]\ntype=${result.type}\nscore=${result.score}\nissues=${issuePart}`;
}

export function logUiAuditResult(result: UiAuditResult): void {
  console.log(formatUiAuditLogLine(result));
  if (result.ok) {
    console.log(`[ui:audit:passed] ${result.details}`);
  } else if (!result.skipped) {
    console.log(`[ui:audit:failed] ${result.details}`);
  }
}

export function logUiAuditSkipped(reason: string): void {
  console.log(`[ui:audit:skipped] ${reason}`);
}

export function logUiRepairStart(strategy: string): void {
  console.log(`[ui:repair:start] strategy=${strategy}`);
}

export function logUiRepairPatchGenerated(paths: readonly string[]): void {
  console.log(`[ui:repair:patch_generated] ${paths.join(", ")}`);
}

export function logUiRepairPatchApplied(paths: readonly string[]): void {
  console.log(`[ui:repair:patch_applied] ${paths.join(", ")}`);
}

export function logRunComplete(success: boolean): void {
  console.log(`[run:complete] success=${success}`);
}
