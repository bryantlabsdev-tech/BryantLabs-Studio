import { FAILURE_CLASS_LABELS } from "./failureClassification";
import type { StressSuiteResult } from "./types";

function suiteLabel(result: StressSuiteResult): string {
  if (result.suiteId === "fast") return "Fast validation (5 prompts)";
  if (result.suiteId === "single") return "Single prompt";
  return "Full suite (10 prompts)";
}

function gateLabel(gate: string): string {
  switch (gate) {
    case "passed":
      return "PASS";
    case "failed":
      return "FAIL";
    case "skipped":
      return "SKIP";
    case "advisory":
      return "ADVISORY";
    default:
      return "—";
  }
}

export function formatStressReportMarkdown(
  result: StressSuiteResult,
  previous: StressSuiteResult | null = null,
): string {
  const lines: string[] = [];
  lines.push("# BryantLabs Greenfield Stress Test Report");
  lines.push("");
  lines.push(`**Mode:** ${result.mode}`);
  lines.push(`**Suite:** ${suiteLabel(result)}`);
  if (result.liveOutputRoot) {
    lines.push(`**Live output:** \`${result.liveOutputRoot}\``);
  }
  lines.push(`**Provider:** ${result.provider}`);
  lines.push(`**Model:** ${result.model}`);
  lines.push(`**Started:** ${result.startedAt}`);
  lines.push(`**Finished:** ${result.finishedAt}`);
  lines.push(`**Duration:** ${Math.round(result.durationMs / 1000)}s`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  const passCount = result.runs.filter((r) => r.finalStatus === "success").length;
  const total = result.runs.length;
  const passTarget = result.suiteTarget?.passTarget ?? Math.ceil(total * 0.8);
  const targetRate = result.suiteTarget?.successRateTarget ?? 0.8;

  lines.push(
    `- **Score:** ${passCount}/${total} pass (target ${passTarget}/${total}, ${Math.round(targetRate * 100)}%)`,
  );
  lines.push(`- **Success rate:** ${Math.round(result.successRate * 100)}% (${passCount}/${total})`);
  lines.push(`- **Average duration:** ${result.averageDurationMs}ms`);
  lines.push(`- **Average repair attempts:** ${result.averageRepairAttempts}`);
  lines.push(
    `- **Estimated BryantLabs score change:** ${result.estimatedScoreChange >= 0 ? "+" : ""}${result.estimatedScoreChange} (baseline target ${Math.round(targetRate * 100)}%)`,
  );
  if (previous) {
    const prevRate = Math.round(previous.successRate * 100);
    const curRate = Math.round(result.successRate * 100);
    lines.push(`- **Trend vs previous run:** ${prevRate}% → ${curRate}% (${curRate - prevRate >= 0 ? "+" : ""}${curRate - prevRate}%)`);
  }
  lines.push("");

  if (result.topFailureClasses.length > 0) {
    lines.push("### Top failure classes");
    lines.push("");
    for (const item of result.topFailureClasses) {
      lines.push(`- ${FAILURE_CLASS_LABELS[item.class]}: ${item.count}`);
    }
    lines.push("");
  }

  if (result.topDeterministicOpportunities.length > 0) {
    lines.push("### Top deterministic repair opportunities");
    lines.push("");
    for (const item of result.topDeterministicOpportunities) {
      lines.push(`- ${item.label}: ${item.count}`);
    }
    lines.push("");
  }

  lines.push("## Results");
  lines.push("");
  lines.push(
    "| Prompt | Status | Duration | TS | Build | Smoke | UI Audit | Repairs | Failure Class | Fix Needed |",
  );
  lines.push(
    "|--------|--------|----------|----|-------|-------|----------|---------|---------------|------------|",
  );

  for (const run of result.runs) {
    const failure =
      run.failureClass != null ? FAILURE_CLASS_LABELS[run.failureClass] : "—";
    const fix = (run.fixNeeded ?? "—").replace(/\|/g, "/").slice(0, 80);
    lines.push(
      `| ${run.promptName} | ${run.finalStatus.toUpperCase()} | ${run.durationMs}ms | ${gateLabel(run.typescript)} | ${gateLabel(run.build)} | ${gateLabel(run.runtimeSmoke)} | ${gateLabel(run.uiAudit)} | ${run.repairAttempts.length} | ${failure} | ${fix} |`,
    );
  }
  lines.push("");

  if (result.suiteId === "fast" || (result.suiteTarget?.promptCount ?? 0) <= 5) {
    lines.push("## Per-app gates");
    lines.push("");
    for (const run of result.runs) {
      lines.push(`### ${run.promptName}`);
      lines.push("");
      lines.push(`- **Live status:** ${run.finalStatus}`);
      lines.push(`- **TypeScript:** ${gateLabel(run.typescript)}`);
      lines.push(`- **Build:** ${gateLabel(run.build)}`);
      lines.push(`- **Runtime smoke:** ${gateLabel(run.runtimeSmoke)}`);
      lines.push(`- **UI audit:** ${gateLabel(run.uiAudit)}`);
      lines.push(`- **Repair attempts:** ${run.repairAttempts.length}`);
      lines.push(
        `- **Deterministic passes:** ${run.repairTokenUsage.deterministicPasses}`,
      );
      if (run.failureClass) {
        lines.push(`- **Failure class:** ${FAILURE_CLASS_LABELS[run.failureClass]}`);
      }
      lines.push("");
    }
  }

  if (result.frozenReplay) {
    const frozen = result.frozenReplay;
    lines.push("## Frozen replay corpus (independent)");
    lines.push("");
    lines.push(`- **Corpus:** \`${frozen.corpusRoot}\``);
    lines.push(
      `- **Replay score:** ${frozen.buildPassCount}/${frozen.projects.length} build pass (target ${frozen.passTarget})`,
    );
    lines.push(`- **Target met:** ${frozen.targetMet ? "yes" : "no"}`);
    lines.push(
      "_Frozen replay uses locked snapshots under `stress/replay-frozen/`. Refresh with `npm run greenfield:stress:lock-replay` after capturing live failures._",
    );
    lines.push("");
    if (frozen.projects.length > 0) {
      lines.push("| Project | Replay TS | Replay Build | Passes |");
      lines.push("|---------|-----------|--------------|--------|");
      for (const project of frozen.projects) {
        lines.push(
          `| ${project.id} | ${project.typecheckOk ? "PASS" : "FAIL"} | ${project.buildOk ? "PASS" : "FAIL"} | ${project.deterministicPasses} |`,
        );
      }
      lines.push("");
    }
  }

  if (result.replayGeneralization) {
    const replay = result.replayGeneralization;
    lines.push("## Replay generalization (deprecated)");
    lines.push("");
    lines.push(
      "_This section re-ran repairs on live-failure folders and is misleading when live output overwrites the frozen corpus. Prefer **Frozen replay corpus** above._",
    );
    lines.push("");
    lines.push(
      `- **Live failures:** ${replay.liveFailedCount}`,
    );
    lines.push(
      `- **Recovered by repair-only replay:** ${replay.replayRecoveredCount}/${replay.liveFailedCount}`,
    );
    lines.push(
      `- **Generalized:** ${replay.replayRecoveredCount === replay.liveFailedCount && replay.liveFailedCount > 0 ? "yes — all live failures fixed deterministically on disk" : replay.replayRecoveredCount > 0 ? "partial — some failures need new repair rules or LLM" : replay.liveFailedCount === 0 ? "n/a — live run passed all apps" : "no — replay did not recover live failures"}`,
    );
    lines.push("");
    if (replay.projects.length > 0) {
      lines.push("| Project | Live | Replay TS | Replay Build | Replay passes |");
      lines.push("|---------|------|-----------|--------------|---------------|");
      for (const project of replay.projects) {
        lines.push(
          `| ${project.id} | ${project.liveStatus} | ${project.replayTypecheckOk ? "PASS" : "FAIL"} | ${project.replayBuildOk ? "PASS" : "FAIL"} | ${project.deterministicPasses} |`,
        );
      }
      lines.push("");
    }
  }

  const failures = result.runs.filter((r) => r.finalStatus !== "success");
  if (failures.length > 0) {
    lines.push("## Failure details (not hidden)");
    lines.push("");
    for (const run of failures) {
      lines.push(`### ${run.promptName} (\`${run.promptId}\`)`);
      lines.push("");
      lines.push(`- **Folder:** \`${run.targetFolder}\``);
      lines.push(`- **Files generated:** ${run.filesGenerated}`);
      if (run.primaryErrorLine) {
        lines.push(`- **Primary error:** ${run.primaryErrorLine}`);
      }
      if (run.repairFailureReason) {
        lines.push(`- **Repair failure:** ${run.repairFailureReason}`);
      }
      lines.push(
        `- **Repair tokens (est.):** in=${run.repairTokenUsage.estimatedInputTokens}, out=${run.repairTokenUsage.estimatedOutputTokens}`,
      );
      lines.push("");
      if (run.suggestions.length > 0) {
        lines.push("**Improvement suggestions:**");
        lines.push("");
        for (const s of run.suggestions) {
          lines.push(`- **Root cause:** ${s.rootCause}`);
          if (s.file) lines.push(`  - File: \`${s.file}${s.line != null ? `:${s.line}` : ""}\``);
          if (s.deterministicRepairCandidate) {
            lines.push(`  - Deterministic candidate: ${s.deterministicRepairCandidate}`);
          }
          lines.push(`  - LLM necessary: ${s.llmRepairNecessary ? "yes" : "no"}`);
          lines.push(`  - Studio fix: ${s.recommendedStudioFix}`);
          if (s.whyRepairFailed) lines.push(`  - Why repair failed: ${s.whyRepairFailed}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}
