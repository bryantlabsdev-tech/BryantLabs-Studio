import type { RunOutcome } from "@/core/agent/runOutcome";
import type { StudioActionType, StudioWorkflowDetails } from "@/core/studioRun/types";
import type { ProviderId } from "@/core/providers/types";

export type AnalyticsRunStatus = RunOutcome;

export type RepairReasonCategory =
  | "typescript"
  | "build"
  | "test"
  | "patch_failure"
  | "provider_failure";

export interface StudioRunVerificationSummary {
  readonly typecheckOk: boolean | null;
  readonly buildOk: boolean | null;
  readonly testsOk: boolean | null;
}

export interface StudioRunRepairSummary {
  readonly attempted: number;
  readonly successful: number;
  readonly failed: number;
  readonly reasons: readonly RepairReasonCategory[];
}

export interface StudioRunAiCallSummary {
  readonly stage: string;
  readonly provider: ProviderId;
  readonly model: string;
  readonly estimatedTokens: number;
  readonly durationMs: number;
  readonly ok: boolean;
}

/** Persisted rollup for one completed Studio action (per project, capped at 500). */
export interface StudioAnalyticsRecord {
  readonly id: string;
  readonly at: number;
  readonly projectPath: string | null;
  readonly actionType: StudioActionType;
  readonly actionLabel: string;
  readonly ok: boolean;
  readonly status: AnalyticsRunStatus;
  readonly durationMs: number | null;
  readonly provider: ProviderId | null;
  readonly model: string | null;
  readonly summary: string;
  readonly detail?: string;
  readonly prompt?: string;
  readonly aiCalls: number;
  readonly estimatedPromptTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedTotalTokens: number;
  readonly estimatedCostUsd: number;
  readonly contextSnapshotId?: string;
  readonly selectedFiles?: readonly string[];
  readonly verification?: StudioRunVerificationSummary;
  readonly repair?: StudioRunRepairSummary;
  readonly workflow?: StudioWorkflowDetails;
  readonly aiCallLog?: readonly StudioRunAiCallSummary[];
}

export interface DashboardSummaryCards {
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly successRatePercent: number;
  readonly averageRunDurationMs: number | null;
  readonly totalAiCalls: number;
  readonly repairSuccessRatePercent: number | null;
  readonly estimatedTotalCostUsd: number;
}

export interface ProviderAnalyticsRow {
  readonly provider: ProviderId;
  readonly model: string;
  readonly runs: number;
  readonly successPercent: number;
  readonly avgDurationMs: number | null;
  readonly estimatedCostUsd: number;
  readonly aiCalls: number;
}

export interface RepairAnalyticsSummary {
  readonly attempted: number;
  readonly successful: number;
  readonly failed: number;
  readonly byReason: Readonly<Record<RepairReasonCategory, number>>;
}

export interface CostPeriodSummary {
  readonly promptTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly runs: number;
}

export interface AgentPerformanceHighlights {
  readonly fastestProvider: { provider: ProviderId; model: string; avgDurationMs: number } | null;
  readonly mostSuccessfulProvider: { provider: ProviderId; successPercent: number } | null;
  readonly mostUsedProvider: { provider: ProviderId; runs: number } | null;
  readonly mostSuccessfulModel: { provider: ProviderId; model: string; successPercent: number } | null;
}

export interface ProviderHealthRow {
  readonly provider: ProviderId;
  readonly label: string;
  readonly model: string;
  readonly tone: "green" | "yellow" | "red";
  readonly statusNote: string;
  readonly lastCheckedAt: string | null;
}

export type CostPeriod = "today" | "7d" | "30d" | "all";
