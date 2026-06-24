import type { AIPatchProposal, AIPatchResult } from "@/core/planner/aiTypes";
import type { VerificationResult } from "@/types";

export type ExecutionPhase =
  | "idle"
  | "planning"
  | "ready"
  | "running"
  | "paused"
  | "verifying"
  | "done";

export type ExecutionFileStatus =
  | "pending"
  | "proposing"
  | "proposed"
  | "approved"
  | "applied"
  | "verified"
  | "skipped"
  | "error";

export type ExecutionStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface ExecutionFileEntry {
  readonly relPath: string;
  readonly absPath: string;
  readonly stepId: string;
  readonly planReason: string;
  readonly selectionReason: string;
  /** True when the path is planned but not yet in the project index. */
  readonly isNewFile: boolean;
  status: ExecutionFileStatus;
  basisContent?: string;
  proposal?: AIPatchProposal;
  patch?: AIPatchResult;
  error?: string;
  rejectionReason?: string;
  crossFileOk?: boolean;
  crossFileIssues?: readonly string[];
}

export interface ExecutionStep {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly filePaths: readonly string[];
  readonly dependsOn: readonly string[];
  status: ExecutionStepStatus;
  error?: string;
}

export interface CrossFileIssue {
  readonly file: string;
  readonly message: string;
}

export interface CrossFileValidationSummary {
  readonly ok: boolean;
  readonly issues: readonly CrossFileIssue[];
}

export interface ExecutionDiagnostics {
  readonly executionPlanLines: readonly string[];
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly filesModified: readonly string[];
  readonly validationSummary: CrossFileValidationSummary | null;
}

export interface ExecutionSession {
  readonly prompt: string;
  readonly planSummary: string;
  readonly planSource: "ai" | "deterministic";
  steps: ExecutionStep[];
  files: ExecutionFileEntry[];
  phase: ExecutionPhase;
  currentStepId: string | null;
  pausedAtStepId: string | null;
  applyError: string | null;
  verification: VerificationResult | null;
  diagnostics: ExecutionDiagnostics;
}

export interface TaskGraphNode {
  readonly stepId: string;
  readonly title: string;
  readonly files: readonly string[];
  readonly dependsOn: readonly string[];
  status: ExecutionStepStatus;
}

export interface TaskGraph {
  readonly nodes: readonly TaskGraphNode[];
}
