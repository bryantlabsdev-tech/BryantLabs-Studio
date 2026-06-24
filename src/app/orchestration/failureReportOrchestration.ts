import type { FailureReportOrchestrationHost } from "@/app/orchestration/failureReportTypes";
import { failureReportToRunLogEntries } from "@/core/diagnostics/failureReport";
import { createLatestAction } from "@/core/greenfield/runLog";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";

export function publishFailureReportOrchestration(
  host: FailureReportOrchestrationHost | null,
  report: StudioFailureReport,
): void {
  if (!host) return;
  for (const entry of failureReportToRunLogEntries(report)) {
    host.appendGreenfieldRunLog(entry.stage, entry.status, entry.message, {
      ...(entry.detail ? { details: entry.detail } : {}),
      ...(entry.failureRole ? { failureRole: entry.failureRole } : {}),
    });
  }
  host.updateGreenfieldRun({
    failureReport: report,
    latestAction: createLatestAction("failed", report.rootCauseLine, {
      detail: report.rootCauseLine,
    }),
  });
}
