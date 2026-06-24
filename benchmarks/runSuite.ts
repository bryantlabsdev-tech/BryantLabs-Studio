import { execSync } from "node:child_process";
import { runAllAppCreationCases } from "./cases/app-creation";
import { runAllFeatureAdditionCases } from "./cases/feature-addition";
import { runAllBugFixingCases } from "./cases/bug-fixing";
import { runAllRefactoringCases } from "./cases/refactoring";
import { runAllRequirementSatisfactionCases } from "./cases/requirement-satisfaction";
import { runAllEditPipelineCases } from "./cases/edit-pipeline";
import { runAllEditorAiCases } from "./cases/editor-ai";
import { runAllPlatformCases } from "./cases/platform";
import { runAllProjectIndexCases } from "./cases/project-index";
import {
  buildScorecard,
  compareScorecards,
  formatDeltaMarkdown,
  formatScorecardMarkdown,
} from "./reporters/scorecard";
import { readPreviousScorecard, writeScorecardArtifacts } from "./reporters/history";
import type { BenchmarkCaseResult, BenchmarkCategory } from "./types";

export type BenchmarkSuiteName =
  | "all"
  | "app_creation"
  | "feature_addition"
  | "bug_fixing"
  | "refactoring"
  | "requirement_satisfaction"
  | "edit_pipeline"
  | "editor_ai"
  | "platform"
  | "project_index";

const SUITE_RUNNERS: Record<
  Exclude<BenchmarkSuiteName, "all">,
  () => Promise<BenchmarkCaseResult[]>
> = {
  app_creation: runAllAppCreationCases,
  feature_addition: runAllFeatureAdditionCases,
  bug_fixing: runAllBugFixingCases,
  refactoring: runAllRefactoringCases,
  requirement_satisfaction: runAllRequirementSatisfactionCases,
  edit_pipeline: runAllEditPipelineCases,
  editor_ai: runAllEditorAiCases,
  platform: runAllPlatformCases,
  project_index: runAllProjectIndexCases,
};

function resolveGitCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export async function runBenchmarkSuite(suite: BenchmarkSuiteName): Promise<{
  scorecard: ReturnType<typeof buildScorecard>;
  markdown: string;
  jsonPath: string;
  markdownPath: string;
}> {
  const startedAt = new Date();
  let cases: BenchmarkCaseResult[] = [];

  if (suite === "all") {
    for (const runner of Object.values(SUITE_RUNNERS)) {
      cases = cases.concat(await runner());
    }
  } else {
    cases = await SUITE_RUNNERS[suite]();
  }

  const finishedAt = new Date();
  const scorecard = buildScorecard({
    suite,
    startedAt,
    finishedAt,
    cases,
    gitCommit: resolveGitCommit(),
  });

  let markdown = formatScorecardMarkdown(scorecard);
  const previous = await readPreviousScorecard();
  if (previous && previous.suite === suite) {
    const delta = compareScorecards(previous, scorecard);
    markdown = `${markdown}\n${formatDeltaMarkdown(delta)}\n`;
  }

  const paths = await writeScorecardArtifacts(scorecard, markdown);
  return { scorecard, markdown, ...paths };
}

export function listSuiteCategories(suite: BenchmarkSuiteName): BenchmarkCategory[] {
  if (suite === "all") {
    return Object.keys(SUITE_RUNNERS) as BenchmarkCategory[];
  }
  return [suite];
}
