import type { AgentStage } from "@/core/providers/orchestration";
import type { ProviderId } from "@/core/providers/types";
import type { VerificationResult } from "@/types";

/** Multi-agent pipeline lifecycle (Phase 26). */
export type PipelineRunStatus =
  | "queued"
  | "planning"
  | "coding"
  | "verifying"
  | "repairing"
  | "awaiting_review"
  | "completed"
  | "failed"
  | "cancelled";

export type PipelineStageId =
  | "planner"
  | "coder"
  | "verifier"
  | "repair"
  | "complete";

export const PIPELINE_STAGE_ORDER: readonly PipelineStageId[] = [
  "planner",
  "coder",
  "verifier",
  "repair",
  "complete",
] as const;

export type PipelineStageStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export interface PlannerOutput {
  readonly goal: string;
  readonly intent: string;
  readonly selectedFiles: readonly { path: string; reason: string }[];
  readonly selectedSymbols: readonly string[];
  readonly risks: readonly string[];
  readonly verificationPlan: string;
  readonly executionSteps: readonly string[];
  readonly summary: string;
}

export interface PipelineStageRecord {
  readonly id: PipelineStageId;
  status: PipelineStageStatus;
  readonly provider: ProviderId | "local";
  model: string;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  estimatedTokens: number;
  summary: string;
  error: string | null;
  contextSnapshotId: string | null;
}

export interface PipelineSession {
  readonly runId: string;
  readonly prompt: string;
  readonly startedAt: number;
  status: PipelineRunStatus;
  readonly stages: PipelineStageRecord[];
  plannerOutput: PlannerOutput | null;
  verification: VerificationResult | null;
  repairAttempts: number;
  error: string | null;
}

export interface PipelineAnalyticsSummary {
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly successRatePercent: number;
  readonly repairSuccessRatePercent: number | null;
  readonly averageDurationMs: number | null;
  readonly averageStageDurationMs: Readonly<Partial<Record<PipelineStageId, number>>>;
}

export function newPipelineRunId(): string {
  return `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function agentStageForPipelineStage(
  stage: PipelineStageId,
): AgentStage | null {
  switch (stage) {
    case "planner":
      return "planner";
    case "coder":
      return "coder";
    case "verifier":
      return "verifier";
    case "repair":
      return "repair";
    default:
      return null;
  }
}
