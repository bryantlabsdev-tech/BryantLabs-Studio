export type BenchmarkCategory =
  | "app_creation"
  | "feature_addition"
  | "bug_fixing"
  | "refactoring"
  | "requirement_satisfaction"
  | "edit_pipeline"
  | "editor_ai"
  | "platform"
  | "project_index";

export interface BenchmarkCheck {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly expected?: string;
  readonly actual?: string;
}

export interface BenchmarkCaseDefinition {
  readonly id: string;
  readonly category: BenchmarkCategory;
  readonly name: string;
  readonly description: string;
  readonly weight: number;
}

export interface BenchmarkCaseResult extends BenchmarkCaseDefinition {
  readonly passed: boolean;
  readonly durationMs: number;
  readonly checks: readonly BenchmarkCheck[];
  readonly error?: string;
}

export interface BenchmarkCategoryScore {
  readonly category: BenchmarkCategory;
  readonly label: string;
  readonly weight: number;
  readonly casesTotal: number;
  readonly casesPassed: number;
  readonly passRate: number;
  readonly score: number;
}

export interface BenchmarkScorecard {
  readonly version: 1;
  readonly suite: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly gitCommit: string | null;
  readonly overallScore: number;
  readonly overallPass: boolean;
  readonly categories: readonly BenchmarkCategoryScore[];
  readonly cases: readonly BenchmarkCaseResult[];
}

export const CATEGORY_LABELS: Record<BenchmarkCategory, string> = {
  app_creation: "App Creation",
  feature_addition: "Feature Addition",
  bug_fixing: "Bug Fixing",
  refactoring: "Refactoring",
  requirement_satisfaction: "Requirement Satisfaction",
  edit_pipeline: "Edit Pipeline",
  editor_ai: "Editor AI",
  platform: "Platform",
  project_index: "Project Index",
};

const EQUAL_CATEGORY_WEIGHT = 1 / 9;

export const CATEGORY_WEIGHTS: Record<BenchmarkCategory, number> = {
  app_creation: EQUAL_CATEGORY_WEIGHT,
  feature_addition: EQUAL_CATEGORY_WEIGHT,
  bug_fixing: EQUAL_CATEGORY_WEIGHT,
  refactoring: EQUAL_CATEGORY_WEIGHT,
  requirement_satisfaction: EQUAL_CATEGORY_WEIGHT,
  edit_pipeline: EQUAL_CATEGORY_WEIGHT,
  editor_ai: EQUAL_CATEGORY_WEIGHT,
  platform: EQUAL_CATEGORY_WEIGHT,
  project_index: EQUAL_CATEGORY_WEIGHT,
};
