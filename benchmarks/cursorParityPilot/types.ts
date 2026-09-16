export const PILOT_TASK_IDS = ["G1", "R1", "D1", "U1", "F1"] as const;
export type PilotTaskId = (typeof PILOT_TASK_IDS)[number];

export const PILOT_PRODUCTS = ["studio", "cursor"] as const;
export type PilotProduct = (typeof PILOT_PRODUCTS)[number];

export const SCORECARD_VERSION = 1 as const;
export const MANIFEST_VERSION = 1 as const;

export type OptionalMetric =
  | { readonly status: "unavailable" }
  | { readonly status: "recorded"; readonly value: number };

export interface ContentNeedle {
  readonly id: string;
  readonly pattern: string;
  readonly flags?: string;
  readonly files: readonly string[];
}

export interface PilotTaskDefinition {
  readonly id: PilotTaskId;
  readonly name: string;
  readonly canonicalPrompt: string;
  readonly overlay: string | null;
  readonly requiredFiles: readonly string[];
  readonly forbiddenFiles: readonly string[];
  readonly requiredContent: readonly ContentNeedle[];
  readonly forbiddenContent: readonly ContentNeedle[];
  readonly allowedChangedPathRules: readonly string[];
  readonly runTypecheck: boolean;
  readonly runBuild: boolean;
  readonly checkOutsideSentinel: boolean;
  readonly operatorNotes: readonly string[];
}

export interface FileSnapshotEntry {
  readonly relPath: string;
  readonly kind: "file" | "dir" | "symlink";
  readonly sha256?: string;
  readonly linkTarget?: string;
}

export interface DirectorySnapshot {
  readonly rootKind: "dir" | "symlink";
  readonly entries: readonly FileSnapshotEntry[];
}

export interface TrialManifest {
  readonly version: typeof MANIFEST_VERSION;
  readonly taskId: PilotTaskId;
  readonly product: PilotProduct;
  readonly createdAt: string;
  readonly trialRoot: string;
  readonly projectDir: string;
  readonly openPath: string;
  readonly outsideDir: string | null;
  readonly sentinelPath: string | null;
  readonly sentinelSha256: string | null;
  readonly harnessCreatedDirs: readonly string[];
  readonly projectSnapshot: DirectorySnapshot;
  readonly outsideSnapshot: DirectorySnapshot | null;
  readonly integrity: string;
}

export interface EvaluationCheck {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly expected?: string;
  readonly actual?: string;
}

export interface TrialEvaluation {
  readonly taskId: PilotTaskId;
  readonly product: PilotProduct;
  readonly trialRoot: string;
  readonly passed: boolean;
  readonly checks: readonly EvaluationCheck[];
  readonly unexpectedChangedPaths: readonly string[];
  readonly typecheck: { readonly ran: boolean; readonly ok: boolean | null; readonly output?: string };
  readonly build: { readonly ran: boolean; readonly ok: boolean | null; readonly output?: string };
}

export interface PilotScorecard {
  readonly version: typeof SCORECARD_VERSION;
  readonly taskId: PilotTaskId;
  readonly product: PilotProduct;
  readonly model: string;
  readonly passed: boolean;
  readonly evaluationPassed: boolean;
  readonly wallTimeMs: number;
  readonly apiCalls: OptionalMetric;
  readonly inputTokens: OptionalMetric;
  readonly outputTokens: OptionalMetric;
  readonly repairAttempts: number;
  readonly unexpectedChangedPaths: readonly string[];
  readonly humanInterventions: number;
  readonly notes: string;
  readonly transcriptOrRunReferenceHash: string;
  readonly recordedAt?: string;
  readonly trialRoot?: string;
}

export interface CreateTrialResult {
  readonly manifest: TrialManifest;
  readonly prompt: string;
}
