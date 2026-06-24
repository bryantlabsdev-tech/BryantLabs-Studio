export type MemoryEventKind =
  | "prompt"
  | "plan"
  | "ai_plan"
  | "files_modified"
  | "verification_failure"
  | "auto_fix";

export interface MemoryTimelineEntry {
  readonly id: string;
  readonly at: number;
  readonly kind: MemoryEventKind;
  readonly title: string;
  readonly detail?: string;
}

export interface SessionPromptRecord {
  readonly prompt: string;
  readonly at: number;
}

export interface SessionPlanRecord {
  readonly source: "deterministic" | "ai";
  readonly prompt: string;
  readonly summary: string;
  readonly files: readonly string[];
  readonly at: number;
}

export interface SessionFailureRecord {
  readonly summary: string;
  readonly at: number;
}

export interface SessionAutoFixRecord {
  readonly summary: string;
  readonly files: readonly string[];
  readonly at: number;
}

export interface SessionProviderRecord {
  readonly provider: string;
  readonly model: string;
  readonly operation: string;
  readonly at: number;
}

export interface SessionRunSummary {
  readonly prompt: string;
  readonly ok: boolean;
  readonly filesModified: readonly string[];
  readonly provider: string | null;
  readonly model: string | null;
  readonly durationMs: number;
  readonly summary: string;
  readonly at: number;
}

export interface FollowUpResolution {
  readonly rawPrompt: string;
  readonly effectivePrompt: string;
  readonly inferredSubject: string | null;
  readonly reason: string;
}

export interface SessionMemorySnapshot {
  readonly projectPath: string | null;
  readonly branch: string | null;
  readonly lastPrompt: string | null;
  readonly prompts: readonly SessionPromptRecord[];
  readonly plans: readonly SessionPlanRecord[];
  readonly lastDeterministicPlan: SessionPlanRecord | null;
  readonly lastAiPlan: SessionPlanRecord | null;
  readonly modifiedFiles: readonly string[];
  readonly failures: readonly SessionFailureRecord[];
  readonly autoFixes: readonly SessionAutoFixRecord[];
  readonly timeline: readonly MemoryTimelineEntry[];
  readonly providerHistory: readonly SessionProviderRecord[];
  readonly runSummaries: readonly SessionRunSummary[];
}

export interface SessionMemoryDiagnostics {
  readonly used: boolean;
  readonly previousPrompt: string | null;
  readonly previousModifiedFiles: readonly string[];
  readonly previousPlanSummary: string | null;
  readonly followUp: FollowUpResolution | null;
  readonly lines: readonly string[];
}

export type SessionMemoryClearScope =
  | "all"
  | "prompts"
  | "failures";
