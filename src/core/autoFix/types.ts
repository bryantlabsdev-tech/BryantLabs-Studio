import type { VerificationResult } from "@/types";

export type AutoFixMode = "off" | "ask" | "automatic";

export const AUTO_FIX_MODE_DEFAULT: AutoFixMode = "ask";

export const MAX_AUTO_FIX_ATTEMPTS = 3;

export type FailureKind =
  | "typescript"
  | "build"
  | "vite"
  | "import"
  | "jsx"
  | "unused";

export interface FailureDiagnostic {
  readonly kind: FailureKind;
  readonly file: string;
  readonly line: number | null;
  readonly column: number | null;
  readonly message: string;
  readonly code?: string;
  readonly raw?: string;
}

export interface AutoFixContext {
  readonly originalRequest: string;
  readonly planSummary: string;
  readonly planSource: string;
  readonly modifiedFiles: readonly string[];
  readonly diagnostics: readonly FailureDiagnostic[];
  readonly primaryFailure: FailureDiagnostic;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly intelligenceBlock?: string;
  readonly strictFormat?: boolean;
  /** Relevant interface/type snippets for compact greenfield repair prompts. */
  readonly relatedTypeDefinitions?: string;
}

export type AutoFixPhase =
  | "idle"
  | "proposing"
  | "awaiting_approval"
  | "applying"
  | "verifying"
  | "success"
  | "failed";

export interface AutoFixAttemptLog {
  readonly attempt: number;
  readonly headline: string;
  readonly detail: string;
  readonly filesTouched: readonly string[];
  readonly outcome: "failed" | "passed" | "skipped";
}

export interface AutoFixPendingRepair {
  readonly relPath: string;
  readonly absPath: string;
  readonly basisContent: string;
  readonly newContent: string;
  readonly summary: string;
}

export interface AutoFixSession {
  readonly verification: VerificationResult;
  readonly originalFailureLine: string;
  readonly context: AutoFixContext;
  phase: AutoFixPhase;
  attempts: AutoFixAttemptLog[];
  pendingRepair: AutoFixPendingRepair | null;
  filesChanged: string[];
  finalOutcome: "repaired" | "exhausted" | "cancelled" | null;
  error: string | null;
}
