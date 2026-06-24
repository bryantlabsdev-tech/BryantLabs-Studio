import type {
  CrossFileValidationSummary,
  ExecutionDiagnostics,
  ExecutionSession,
  ExecutionStep,
} from "@/core/execution/types";
import { executionPlanSummaryLines } from "@/core/execution/executionPlan";

export function buildExecutionDiagnostics(
  steps: readonly ExecutionStep[],
  filesModified: readonly string[],
  validation: CrossFileValidationSummary | null,
): ExecutionDiagnostics {
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  return {
    executionPlanLines: executionPlanSummaryLines(steps),
    completedSteps,
    totalSteps: steps.length,
    filesModified,
    validationSummary: validation,
  };
}

export function formatExecutionDiagnosticsSummary(
  session: ExecutionSession,
): string[] {
  const lines: string[] = [];
  const d = session.diagnostics;
  lines.push(...d.executionPlanLines);
  lines.push(
    `Completed Steps: ${d.completedSteps} / ${d.totalSteps}`,
  );
  if (d.filesModified.length > 0) {
    lines.push(`Files Modified: ${d.filesModified.join(", ")}`);
  }
  if (d.validationSummary) {
    lines.push(
      `Validation Results: ${
        d.validationSummary.ok ? "passed" : "failed"
      } (${d.validationSummary.issues.length} issue(s))`,
    );
    for (const issue of d.validationSummary.issues.slice(0, 6)) {
      lines.push(`  · ${issue.file}: ${issue.message}`);
    }
  }
  return lines;
}

export function refreshSessionDiagnostics(
  session: ExecutionSession,
): ExecutionDiagnostics {
  const modified = session.files
    .filter((f) => f.status === "applied" || f.status === "verified")
    .map((f) => f.relPath);
  const validation =
    session.files.some((f) => f.crossFileOk === false)
      ? {
          ok: false,
          issues: session.files.flatMap((f) =>
            (f.crossFileIssues ?? []).map((message) => ({
              file: f.relPath,
              message,
            })),
          ),
        }
      : session.diagnostics.validationSummary;

  return buildExecutionDiagnostics(session.steps, modified, validation);
}
