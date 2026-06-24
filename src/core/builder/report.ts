import type {
  BuilderCompletionReport,
  BuilderSession,
} from "@/core/builder/types";
import { countPhasesByStatus } from "@/core/builder/orchestrator";

export function buildCompletionReport(
  session: BuilderSession,
  lastVerificationOk: boolean,
): BuilderCompletionReport {
  const completed = countPhasesByStatus(session.phases, "completed");
  const durationMs =
    (session.completedAt ?? Date.now()) - session.startedAt;

  const featuresBuilt = session.phases
    .filter((p) => p.status === "completed")
    .map((p) => `Phase ${p.index + 1}: ${p.title}`);

  const phaseSummaries = session.phases.map(
    (p) =>
      `${p.title}: ${p.status}${
        p.filesModified.length
          ? ` (${p.filesModified.length} file(s))`
          : ""
      }`,
  );

  return {
    featuresBuilt,
    filesCreated: [...session.allFilesCreated],
    filesModified: [...session.allFilesModified],
    verificationOk: lastVerificationOk,
    durationMs,
    phasesCompleted: completed,
    phasesTotal: session.phases.length,
    phaseSummaries,
  };
}

export function formatCompletionReportLines(
  report: BuilderCompletionReport,
): string[] {
  const sec = Math.round(report.durationMs / 1000);
  return [
    "Completion Report",
    `Features built: ${report.featuresBuilt.join("; ") || "—"}`,
    `Files created: ${report.filesCreated.length ? report.filesCreated.join(", ") : "—"}`,
    `Files modified: ${report.filesModified.length ? report.filesModified.join(", ") : "—"}`,
    `Verification: ${report.verificationOk ? "passed" : "issues remain"}`,
    `Duration: ${sec}s`,
    `Phases: ${report.phasesCompleted} / ${report.phasesTotal} completed`,
  ];
}
