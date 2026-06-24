import {
  estimateRunCostUsd,
  splitEstimatedTokens,
} from "@/core/analytics/costEstimates";
import { isRunFailureOutcome } from "@/core/agent/runOutcome";
import type {
  AgentPerformanceHighlights,
  CostPeriod,
  CostPeriodSummary,
  DashboardSummaryCards,
  ProviderAnalyticsRow,
  RepairAnalyticsSummary,
  RepairReasonCategory,
  StudioAnalyticsRecord,
} from "@/core/analytics/types";
import type { ProviderId } from "@/core/providers/types";

const REPAIR_REASONS: readonly RepairReasonCategory[] = [
  "typescript",
  "build",
  "test",
  "patch_failure",
  "provider_failure",
];

function periodStart(period: CostPeriod, now = Date.now()): number {
  const day = 24 * 60 * 60 * 1000;
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "7d":
      return now - 7 * day;
    case "30d":
      return now - 30 * day;
    default:
      return 0;
  }
}

export function filterRecordsByPeriod(
  records: readonly StudioAnalyticsRecord[],
  period: CostPeriod,
  now = Date.now(),
): StudioAnalyticsRecord[] {
  const start = periodStart(period, now);
  return records.filter((r) => r.at >= start);
}

export function computeDashboardSummary(
  records: readonly StudioAnalyticsRecord[],
): DashboardSummaryCards {
  const totalRuns = records.length;
  const successfulRuns = records.filter((r) => r.status === "success").length;
  const failedRuns = records.filter((r) => isRunFailureOutcome(r.status)).length;
  const measuredRuns = successfulRuns + failedRuns;
  const successRatePercent =
    measuredRuns > 0 ? (successfulRuns / measuredRuns) * 100 : 0;

  const durations = records
    .map((r) => r.durationMs)
    .filter((d): d is number => d != null && d >= 0);
  const averageRunDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  const totalAiCalls = records.reduce((n, r) => n + r.aiCalls, 0);

  const repairRecords = records.filter((r) => r.repair && r.repair.attempted > 0);
  let repairSuccessRatePercent: number | null = null;
  if (repairRecords.length > 0) {
    const success = repairRecords.filter((r) => r.ok && r.repair!.successful > 0).length;
    repairSuccessRatePercent = (success / repairRecords.length) * 100;
  }

  const estimatedTotalCostUsd = records.reduce(
    (sum, r) => sum + r.estimatedCostUsd,
    0,
  );

  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    successRatePercent,
    averageRunDurationMs,
    totalAiCalls,
    repairSuccessRatePercent,
    estimatedTotalCostUsd: Math.round(estimatedTotalCostUsd * 10000) / 10000,
  };
}

export function computeCostPeriodSummary(
  records: readonly StudioAnalyticsRecord[],
  period: CostPeriod,
): CostPeriodSummary {
  const filtered = filterRecordsByPeriod(records, period);
  return {
    promptTokens: filtered.reduce((n, r) => n + r.estimatedPromptTokens, 0),
    outputTokens: filtered.reduce((n, r) => n + r.estimatedOutputTokens, 0),
    estimatedCostUsd: Math.round(
      filtered.reduce((n, r) => n + r.estimatedCostUsd, 0) * 10000,
    ) / 10000,
    runs: filtered.length,
  };
}

export function computeProviderAnalytics(
  records: readonly StudioAnalyticsRecord[],
): ProviderAnalyticsRow[] {
  const map = new Map<
    string,
    {
      provider: ProviderId;
      model: string;
      runs: number;
      successes: number;
      durationTotal: number;
      durationCount: number;
      cost: number;
      aiCalls: number;
    }
  >();

  for (const record of records) {
    const provider = record.provider ?? "ollama";
    const model = record.model ?? "unknown";
    const key = `${provider}::${model}`;
    const row = map.get(key) ?? {
      provider,
      model,
      runs: 0,
      successes: 0,
      durationTotal: 0,
      durationCount: 0,
      cost: 0,
      aiCalls: 0,
    };
    row.runs += 1;
    if (record.ok) row.successes += 1;
    if (record.durationMs != null) {
      row.durationTotal += record.durationMs;
      row.durationCount += 1;
    }
    row.cost += record.estimatedCostUsd;
    row.aiCalls += record.aiCalls;
    map.set(key, row);
  }

  return [...map.values()]
    .map((row) => ({
      provider: row.provider,
      model: row.model,
      runs: row.runs,
      successPercent: row.runs > 0 ? (row.successes / row.runs) * 100 : 0,
      avgDurationMs:
        row.durationCount > 0
          ? Math.round(row.durationTotal / row.durationCount)
          : null,
      estimatedCostUsd: Math.round(row.cost * 10000) / 10000,
      aiCalls: row.aiCalls,
    }))
    .sort((a, b) => b.runs - a.runs);
}

export function computeRepairAnalytics(
  records: readonly StudioAnalyticsRecord[],
): RepairAnalyticsSummary {
  const byReason: Record<RepairReasonCategory, number> = {
    typescript: 0,
    build: 0,
    test: 0,
    patch_failure: 0,
    provider_failure: 0,
  };
  let attempted = 0;
  let successful = 0;
  let failed = 0;

  for (const record of records) {
    const repair = record.repair;
    if (!repair) continue;
    attempted += repair.attempted;
    successful += repair.successful;
    failed += repair.failed;
    for (const reason of repair.reasons) {
      byReason[reason] += 1;
    }
  }

  return { attempted, successful, failed, byReason };
}

export function computeAgentPerformance(
  records: readonly StudioAnalyticsRecord[],
): AgentPerformanceHighlights {
  const providerRows = computeProviderAnalytics(records);
  const byProvider = new Map<
    ProviderId,
    { runs: number; successes: number; durationTotal: number; durationCount: number }
  >();

  for (const row of providerRows) {
    const agg = byProvider.get(row.provider) ?? {
      runs: 0,
      successes: 0,
      durationTotal: 0,
      durationCount: 0,
    };
    agg.runs += row.runs;
    agg.successes += Math.round((row.successPercent / 100) * row.runs);
    if (row.avgDurationMs != null) {
      agg.durationTotal += row.avgDurationMs * row.runs;
      agg.durationCount += row.runs;
    }
    byProvider.set(row.provider, agg);
  }

  let fastestProvider: AgentPerformanceHighlights["fastestProvider"] = null;
  for (const row of providerRows) {
    if (row.avgDurationMs == null) continue;
    if (
      !fastestProvider ||
      row.avgDurationMs < fastestProvider.avgDurationMs
    ) {
      fastestProvider = {
        provider: row.provider,
        model: row.model,
        avgDurationMs: row.avgDurationMs,
      };
    }
  }

  let mostSuccessfulProvider: AgentPerformanceHighlights["mostSuccessfulProvider"] =
    null;
  let mostUsedProvider: AgentPerformanceHighlights["mostUsedProvider"] = null;
  for (const [provider, agg] of byProvider) {
    const successPercent = agg.runs > 0 ? (agg.successes / agg.runs) * 100 : 0;
    if (
      !mostSuccessfulProvider ||
      successPercent > mostSuccessfulProvider.successPercent
    ) {
      mostSuccessfulProvider = { provider, successPercent };
    }
    if (!mostUsedProvider || agg.runs > mostUsedProvider.runs) {
      mostUsedProvider = { provider, runs: agg.runs };
    }
  }

  let mostSuccessfulModel: AgentPerformanceHighlights["mostSuccessfulModel"] =
    null;
  for (const row of providerRows) {
    if (
      !mostSuccessfulModel ||
      row.successPercent > mostSuccessfulModel.successPercent
    ) {
      mostSuccessfulModel = {
        provider: row.provider,
        model: row.model,
        successPercent: row.successPercent,
      };
    }
  }

  return {
    fastestProvider,
    mostSuccessfulProvider,
    mostUsedProvider,
    mostSuccessfulModel,
  };
}

export function repairReasonLabel(reason: RepairReasonCategory): string {
  switch (reason) {
    case "typescript":
      return "TypeScript";
    case "build":
      return "Build";
    case "test":
      return "Test";
    case "patch_failure":
      return "Patch Failure";
    case "provider_failure":
      return "Provider Failure";
  }
}

export { REPAIR_REASONS };

/** Re-estimate cost when aggregating token-only partial records. */
export function estimateRecordCost(record: StudioAnalyticsRecord): number {
  if (record.estimatedCostUsd > 0) return record.estimatedCostUsd;
  const split = splitEstimatedTokens(record.estimatedTotalTokens);
  return estimateRunCostUsd(
    record.provider,
    split.promptTokens,
    split.outputTokens,
  );
}
