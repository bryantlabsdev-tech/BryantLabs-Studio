/**
 * Bounded multi-phase edit timings.
 * Hard ceilings — never use 10–15 minute single provider calls.
 */
export const EDIT_PHASE_TIMING_MS = {
  /** Provider must start returning bytes within this window. */
  firstByte: 60_000,
  /** One generation call for a single phase. */
  generation: 180_000,
  /** Parse + stage + atomic write for a phase. */
  parseAndApply: 30_000,
  /** Fast or full verification after a phase. */
  verification: 120_000,
  /** One focused repair attempt. */
  repair: 180_000,
} as const;

/** Soft estimate: chars ≈ tokens / 4 for budgeting. */
export const CHARS_PER_TOKEN = 4;

/** Keep phase generation under this estimated output token budget. */
export const SAFE_PHASE_OUTPUT_TOKEN_BUDGET = 6_000;

/** Prefer this many files per generation phase. */
export const MAX_FILES_PER_EDIT_PHASE = 3;

/** Hard cap on repair attempts after a failed phase verification. */
export const MAX_PHASE_REPAIR_ATTEMPTS = 1;

export type EditPhaseStatus =
  | "pending"
  | "generating"
  | "staging"
  | "applying"
  | "verifying"
  | "repairing"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export type EditPhaseFileRole =
  | "required"
  | "optional"
  | "discovered_dependency"
  | "rejected_or_missing";

export interface EditPhaseFileAssignment {
  readonly relPath: string;
  readonly role: EditPhaseFileRole;
  readonly reason: string;
  readonly acceptanceCriteria?: string;
}

export interface EditPhaseSpec {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly summary: string;
  readonly dependsOn: readonly string[];
  readonly files: readonly EditPhaseFileAssignment[];
  readonly acceptanceCriteria: readonly string[];
  readonly estimatedOutputTokens: number;
}

export interface EditPhaseRuntimeState {
  readonly id: string;
  readonly status: EditPhaseStatus;
  readonly attempt: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly elapsedMs: number;
  readonly error: string | null;
  readonly beforeHashes: Readonly<Record<string, string>>;
  readonly afterHashes: Readonly<Record<string, string>>;
  readonly rolledBack: boolean;
  readonly filesChanged: readonly string[];
  readonly providerCalls: number;
  readonly repairAttempts: number;
}

export interface EditPhasePlan {
  readonly planId: string;
  readonly prompt: string;
  readonly createdAt: number;
  readonly phases: readonly EditPhaseSpec[];
  readonly currentPhaseId: string | null;
  readonly status: "planning" | "running" | "paused" | "completed" | "failed" | "cancelled";
  readonly phaseStates: Readonly<Record<string, EditPhaseRuntimeState>>;
  readonly pausedReason: string | null;
}

export interface PatchCompletenessEntry {
  readonly relPath: string;
  readonly role: EditPhaseFileRole;
  readonly hasPatch: boolean;
  readonly reason: string;
}

export interface PatchCompletenessResult {
  readonly ok: boolean;
  readonly entries: readonly PatchCompletenessEntry[];
  readonly missingRequired: readonly string[];
  readonly optionalUnchanged: readonly string[];
  readonly discoveredDependencies: readonly string[];
  readonly truncatedResponse: boolean;
  readonly error: string | null;
}

export interface PhaseTransactionResult {
  readonly ok: boolean;
  readonly applied: readonly string[];
  readonly beforeHashes: Readonly<Record<string, string>>;
  readonly afterHashes: Readonly<Record<string, string>>;
  readonly rolledBack: boolean;
  readonly rollbackOk: boolean;
  readonly error: string | null;
  readonly claimedSuccess: boolean;
}

export interface PersistedEditPhaseCheckpoint {
  readonly version: 1;
  readonly plan: EditPhasePlan;
  readonly projectPath: string;
  readonly updatedAt: number;
}
