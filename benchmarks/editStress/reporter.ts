import type { EditStressSuiteResult } from "./runEditStressSuite";
import type { EditStressProviderSuiteResult } from "./runEditStressProvider";

export function formatEditStressReportMarkdown(result: EditStressSuiteResult): string {
  const lines = [
    "# Brownfield edit stress report (dry-run)",
    "",
    `- **Started:** ${result.startedAt}`,
    `- **Finished:** ${result.finishedAt}`,
    `- **Score:** ${result.passed}/${result.total} (${Math.round(result.successRate * 100)}%)`,
    `- **Target met:** ${result.targetMet ? "yes" : "no"}`,
    "",
    "| Case | Fixture | Route | Submit | Plan | Result |",
    "|------|---------|-------|--------|------|--------|",
  ];

  for (const run of result.runs) {
    lines.push(
      `| ${run.name} | ${run.fixtureId} | ${run.routeExecution} | ${run.submitAction} | ${run.planPaths.slice(0, 2).join(", ") || "—"} | ${run.ok ? "PASS" : `FAIL${run.reason ? ` (${run.reason})` : ""}`} |`,
    );
  }

  lines.push(
    "",
    "_Dry-run validates routing, submit action, and deterministic planner file selection — no live provider calls._",
  );
  return lines.join("\n");
}

export function formatEditStressProviderReportMarkdown(
  result: EditStressProviderSuiteResult,
): string {
  const lines = [
    "# Brownfield edit stress report (mock provider pipeline)",
    "",
    `- **Started:** ${result.startedAt}`,
    `- **Finished:** ${result.finishedAt}`,
    `- **Dry-run:** ${result.passed}/${result.total}`,
    `- **Provider pipeline:** ${result.providerPassed}/${result.total}`,
    `- **Target met:** ${result.providerTargetMet ? "yes" : "no"}`,
    "",
    "| Case | Fixture | Ready | Apply | Verify | Result |",
    "|------|---------|-------|-------|--------|--------|",
  ];

  for (const run of result.runs) {
    lines.push(
      `| ${run.name} | ${run.fixtureId} | ${run.validReady} | ${run.applyOk ? "yes" : "no"} | ${run.verifyOk ? "yes" : "no"} | ${run.providerOk ? "PASS" : `FAIL${run.providerReason ? ` (${run.providerReason})` : ""}`} |`,
    );
  }

  lines.push(
    "",
    "_Runs propose → auto-apply → verify with deterministic mock provider patches (no API key)._",
  );
  return lines.join("\n");
}
