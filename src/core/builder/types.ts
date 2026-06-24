export type BuilderApprovalMode = "manual" | "hybrid" | "autonomous";

export type BuilderRunStatus =
  | "idle"
  | "ready"
  | "running"
  | "paused"
  | "awaiting_approval"
  | "completed"
  | "stopped"
  | "failed";

export type BuilderPhaseStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface BuildGoal {
  readonly rawPrompt: string;
  readonly title: string;
  readonly createdAt: number;
}

export interface BuilderPhase {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly prompt: string;
  /** When true, hybrid mode pauses for approval before this phase. */
  readonly major: boolean;
  status: BuilderPhaseStatus;
  repairAttempts: number;
  filesModified: readonly string[];
  filesCreated: readonly string[];
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

export interface BuilderCompletionReport {
  readonly featuresBuilt: readonly string[];
  readonly filesCreated: readonly string[];
  readonly filesModified: readonly string[];
  readonly verificationOk: boolean;
  readonly durationMs: number;
  readonly phasesCompleted: number;
  readonly phasesTotal: number;
  readonly phaseSummaries: readonly string[];
}

export interface BuilderSession {
  readonly goal: BuildGoal;
  readonly mode: BuilderApprovalMode;
  phases: BuilderPhase[];
  status: BuilderRunStatus;
  currentPhaseId: string | null;
  readonly startedAt: number;
  completedAt: number | null;
  allFilesModified: string[];
  allFilesCreated: string[];
  report: BuilderCompletionReport | null;
  error: string | null;
}

export const MAX_BUILDER_PHASE_REPAIRS = 3;
