import type { AIPatchProposal, AIPatchResult } from "@/core/planner/aiTypes";
import type { VerificationResult } from "@/types";

export type PlanApplyPhase =
  | "idle"
  | "proposing"
  | "review"
  | "waiting_for_review"
  | "applying"
  | "verifying"
  | "done";

export type PlanApplyFileStatus =
  | "pending"
  | "proposing"
  | "ready"
  | "error"
  | "skipped";

export type PlanApplyFileDecision = "pending" | "approved" | "rejected";

export interface PlanApplyDiffStats {
  readonly added: number;
  readonly removed: number;
  readonly changed: boolean;
}

import type { PlanApplyTargetAction } from "@/core/planApply/createFileTargets";

export interface PlanApplyFileEntry {
  readonly relPath: string;
  readonly absPath: string;
  readonly action?: PlanApplyTargetAction;
  /** Why Apply Plan selected this file (shown before patch proposal). */
  readonly selectionReason: string;
  readonly planReason: string;
  /** Deterministic plan relevance score when available. */
  relevanceScore?: number;
  /** Symbol names on this file that matched the plan context. */
  symbolMatches?: readonly string[];
  status: PlanApplyFileStatus;
  decision: PlanApplyFileDecision;
  basisContent?: string;
  proposal?: AIPatchProposal;
  patch?: AIPatchResult;
  error?: string;
  /** Explicit rejection from proposal validation (shown in diagnostics). */
  rejectionReason?: string;
  /** Model returned patch content (may still fail quality checks). */
  patchGenerated?: boolean;
  diffStats?: PlanApplyDiffStats;
}

export interface PlanApplyTotals {
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly filesApproved: number;
  readonly filesApplied: number;
}

/** Batch Apply Plan patch result from the main process. */
export interface ApplyPlanBatchPatchResult {
  readonly ok: boolean;
  readonly provider: import("@/core/providers/types").ProviderId;
  readonly model: string;
  readonly raw: unknown;
  readonly rawText?: string;
  readonly latencyMs: number;
  readonly error?: string;
  readonly errorCode?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly missingPaths?: readonly string[];
  readonly repairAttempted?: boolean;
  readonly directRewrite?: boolean;
  readonly lastModelRawText?: string;
}

export interface PlanApplySession {
  /** Correlates propose/apply async work; stale results must not update UI. */
  readonly applyRunId: string;
  readonly prompt: string;
  readonly planSummary: string;
  readonly planSource: "ai" | "deterministic";
  /** Patch targets sent to the model (excludes plan-only skipped rows). */
  readonly applyTargetCount: number;
  /** Plan paths excluded by allowlist / policy (shown as skipped rows). */
  readonly applySkippedCount: number;
  /** Show direct rewrite when format repair did not produce proposals. */
  directRewriteAvailable?: boolean;
  /** Last model text after failed parse (diagnostics). */
  lastModelRawText?: string | null;
  files: PlanApplyFileEntry[];
  phase: PlanApplyPhase;
  selectedRelPath: string | null;
  applyError: string | null;
  verification: VerificationResult | null;
  totals: PlanApplyTotals | null;
}
