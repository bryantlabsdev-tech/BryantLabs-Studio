import type { BenchmarkCategory, BenchmarkCaseResult, BenchmarkScorecard } from "../types";
import { CATEGORY_LABELS, CATEGORY_WEIGHTS } from "../types";

export function buildScorecard(input: {
  suite: string;
  startedAt: Date;
  finishedAt: Date;
  cases: readonly BenchmarkCaseResult[];
  gitCommit?: string | null;
}): BenchmarkScorecard {
  const categories = (Object.keys(CATEGORY_LABELS) as BenchmarkCategory[]).map((category) => {
    const categoryCases = input.cases.filter((c) => c.category === category);
    const casesPassed = categoryCases.filter((c) => c.passed).length;
    const casesTotal = categoryCases.length;
    const passRate = casesTotal === 0 ? 0 : casesPassed / casesTotal;
    const weight = CATEGORY_WEIGHTS[category];
    return {
      category,
      label: CATEGORY_LABELS[category],
      weight,
      casesTotal,
      casesPassed,
      passRate,
      score: Math.round(passRate * 100),
    };
  });

  const overallScore = Math.round(
    categories.reduce((sum, c) => sum + c.score * c.weight, 0),
  );
  const overallPass = input.cases.every((c) => c.passed);

  return {
    version: 1,
    suite: input.suite,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    gitCommit: input.gitCommit ?? null,
    overallScore,
    overallPass,
    categories,
    cases: input.cases,
  };
}

export function formatScorecardMarkdown(scorecard: BenchmarkScorecard): string {
  const lines: string[] = [];
  lines.push("# BryantLabs Studio Benchmark Scorecard");
  lines.push("");
  lines.push(`**Suite:** ${scorecard.suite}`);
  lines.push(`**Finished:** ${scorecard.finishedAt}`);
  lines.push(`**Duration:** ${scorecard.durationMs}ms`);
  if (scorecard.gitCommit) {
    lines.push(`**Git commit:** \`${scorecard.gitCommit.slice(0, 12)}\``);
  }
  lines.push("");
  lines.push(`## Overall: ${scorecard.overallScore}/100 ${scorecard.overallPass ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("| Category | Score | Pass Rate | Cases |");
  lines.push("|----------|------:|----------:|------:|");
  for (const cat of scorecard.categories) {
    lines.push(
      `| ${cat.label} | ${cat.score} | ${cat.casesPassed}/${cat.casesTotal} (${Math.round(cat.passRate * 100)}%) | ${cat.casesTotal} |`,
    );
  }
  lines.push("");
  lines.push("## Case Results");
  lines.push("");
  for (const c of scorecard.cases) {
    const status = c.passed ? "PASS" : "FAIL";
    lines.push(`### ${status} — ${c.name} (\`${c.id}\`)`);
    lines.push(`*${c.description}*`);
    lines.push("");
    if (c.error) {
      lines.push(`**Error:** ${c.error}`);
      lines.push("");
    }
    lines.push("| Check | Result |");
    lines.push("|-------|--------|");
    for (const chk of c.checks) {
      const detail =
        chk.expected !== undefined
          ? `${chk.passed ? "pass" : "fail"} (expected ${chk.expected}, got ${chk.actual ?? "n/a"})`
          : chk.passed
            ? "pass"
            : "fail";
      lines.push(`| ${chk.label} | ${detail} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export interface ScorecardDelta {
  readonly previousScore: number;
  readonly currentScore: number;
  readonly scoreDelta: number;
  readonly improvedCases: readonly string[];
  readonly regressedCases: readonly string[];
}

export function compareScorecards(
  previous: BenchmarkScorecard,
  current: BenchmarkScorecard,
): ScorecardDelta {
  const prevById = new Map(previous.cases.map((c) => [c.id, c.passed]));
  const improvedCases: string[] = [];
  const regressedCases: string[] = [];
  for (const c of current.cases) {
    const prev = prevById.get(c.id);
    if (prev === false && c.passed) improvedCases.push(c.id);
    if (prev === true && !c.passed) regressedCases.push(c.id);
  }
  return {
    previousScore: previous.overallScore,
    currentScore: current.overallScore,
    scoreDelta: current.overallScore - previous.overallScore,
    improvedCases,
    regressedCases,
  };
}

export function formatDeltaMarkdown(delta: ScorecardDelta): string {
  const sign = delta.scoreDelta >= 0 ? "+" : "";
  const lines = [
    "## Trend vs Previous Run",
    "",
    `- **Score:** ${delta.previousScore} → ${delta.currentScore} (${sign}${delta.scoreDelta})`,
  ];
  if (delta.improvedCases.length > 0) {
    lines.push(`- **Improved:** ${delta.improvedCases.join(", ")}`);
  }
  if (delta.regressedCases.length > 0) {
    lines.push(`- **Regressed:** ${delta.regressedCases.join(", ")}`);
  }
  if (delta.improvedCases.length === 0 && delta.regressedCases.length === 0) {
    lines.push("- **Case changes:** none");
  }
  return lines.join("\n");
}
