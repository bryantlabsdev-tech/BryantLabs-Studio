import type { StressPromptDefinition } from "./prompts";
import { stressSuiteTarget, type StressSuiteId } from "./promptSelection";
import { STRESS_PROMPTS, stressPromptById } from "./prompts";
import { runStressCase, type GreenfieldStressHost, type StressRunOptions } from "./runStressCase";
import type { StressSuiteResult } from "./types";
import { aggregateDeterministicOpportunities } from "./deterministicRepairCatalog";
import { parseDiagnosticsFromOutput } from "./applyProjectRepairs";

export interface StressSuiteOptions {
  readonly mode: "dry-run" | "live";
  readonly outputRoot: string;
  readonly provider: string;
  readonly model: string;
  readonly promptIds?: readonly string[];
  readonly suiteId?: StressSuiteId;
  readonly host?: GreenfieldStressHost;
}

function aggregateFailureClasses(
  runs: StressSuiteResult["runs"],
): { class: import("./types").StressFailureClass; count: number }[] {
  const counts = new Map<import("./types").StressFailureClass, number>();
  for (const run of runs) {
    if (!run.failureClass) continue;
    counts.set(run.failureClass, (counts.get(run.failureClass) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([cls, count]) => ({ class: cls, count }))
    .sort((a, b) => b.count - a.count);
}

export async function runStressSuite(opts: StressSuiteOptions): Promise<StressSuiteResult> {
  const started = new Date();
  const prompts: StressPromptDefinition[] = opts.promptIds?.length
    ? opts.promptIds
        .map((id) => stressPromptById(id))
        .filter((p): p is StressPromptDefinition => p != null)
    : [...STRESS_PROMPTS];

  const suiteId =
    opts.suiteId ??
    (prompts.length === STRESS_PROMPTS.length
      ? "full"
      : prompts.length === 5
        ? "fast"
        : prompts.length === 1
          ? "single"
          : "full");
  const suiteTarget = stressSuiteTarget(suiteId, prompts.length);

  const runOpts: StressRunOptions = {
    mode: opts.mode,
    outputRoot: opts.outputRoot,
    provider: opts.provider,
    model: opts.model,
    host: opts.host,
  };

  const runs = [];
  for (const prompt of prompts) {
    runs.push(await runStressCase(prompt, runOpts));
  }

  const finished = new Date();
  const successes = runs.filter((r) => r.finalStatus === "success").length;
  const successRate = runs.length === 0 ? 0 : successes / runs.length;
  const averageDurationMs =
    runs.length === 0 ? 0 : Math.round(runs.reduce((s, r) => s + r.durationMs, 0) / runs.length);
  const averageRepairAttempts =
    runs.length === 0
      ? 0
      : Math.round(
          runs.reduce((s, r) => s + r.repairAttempts.length, 0) / runs.length,
        );

  const allDiagnostics = runs.flatMap((r) =>
    r.primaryErrorLine
      ? parseDiagnosticsFromOutput("", r.primaryErrorLine)
      : [],
  );
  const topDeterministicOpportunities = aggregateDeterministicOpportunities(allDiagnostics);

  const estimatedScoreChange = Math.round((successRate - suiteTarget.successRateTarget) * 25);

  return {
    version: 1,
    mode: opts.mode,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    provider: opts.provider,
    model: opts.model,
    runs,
    successRate,
    averageDurationMs,
    averageRepairAttempts,
    topFailureClasses: aggregateFailureClasses(runs),
    topDeterministicOpportunities,
    estimatedScoreChange,
    suiteId,
    suiteTarget: {
      promptCount: suiteTarget.promptCount,
      passTarget: suiteTarget.passTarget,
      successRateTarget: suiteTarget.successRateTarget,
    },
  };
}
