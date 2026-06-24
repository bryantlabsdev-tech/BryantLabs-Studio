import type { AiCallLogEntry } from "@/core/providers/costControls";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import {
  estimateRunCostUsd,
  splitEstimatedTokens,
} from "@/core/analytics/costEstimates";
import type {
  RepairReasonCategory,
  StudioAnalyticsRecord,
  StudioRunAiCallSummary,
  StudioRunRepairSummary,
  StudioRunVerificationSummary,
} from "@/core/analytics/types";
import type { StudioActionType } from "@/core/studioRun/types";
import { STUDIO_ACTION_LABELS } from "@/core/studioRun/types";
import type { ProviderId } from "@/core/providers/types";
import type { VerificationResult } from "@/types";
import {
  inferOutcomeFromSnapshot,
  type RunOutcome,
} from "@/core/agent/runOutcome";

export interface CurrentRunAnalyticsAccumulator {
  aiCalls: AiCallLogEntry[];
  contextSnapshotId: string | null;
}

export function emptyRunAnalyticsAccumulator(): CurrentRunAnalyticsAccumulator {
  return { aiCalls: [], contextSnapshotId: null };
}

function newRecordId(at: number): string {
  return `analytics-${at}-${Math.random().toString(36).slice(2, 9)}`;
}

function verificationSummary(
  verification: VerificationResult | null | undefined,
  workflow?: { verificationOk?: boolean; typecheckResult?: string | null; buildResult?: string | null },
): StudioRunVerificationSummary | undefined {
  if (verification) {
    return {
      typecheckOk: verification.typecheck.ok,
      buildOk: verification.build.ok,
      testsOk: null,
    };
  }
  if (
    workflow?.typecheckResult != null ||
    workflow?.buildResult != null ||
    workflow?.verificationOk != null
  ) {
    return {
      typecheckOk: workflow.typecheckResult
        ? /pass/i.test(workflow.typecheckResult)
        : workflow.verificationOk ?? null,
      buildOk: workflow.buildResult
        ? /pass/i.test(workflow.buildResult)
        : workflow.verificationOk ?? null,
      testsOk: null,
    };
  }
  return undefined;
}

function classifyRepairReason(text: string): RepairReasonCategory {
  const t = text.toLowerCase();
  if (/typescript|typecheck|tsc|type error/.test(t)) return "typescript";
  if (/build|vite|webpack|rollup|compile/.test(t)) return "build";
  if (/test|jest|vitest|spec/.test(t)) return "test";
  if (/provider|rate.?limit|offline|api key|credit/.test(t)) return "provider_failure";
  return "patch_failure";
}

function repairSummaryFromEntries(
  snapshot: GreenfieldRunSnapshot,
): StudioRunRepairSummary | undefined {
  const autoFixEntries = snapshot.entries.filter((e) => e.stage === "auto_fix");
  if (autoFixEntries.length === 0) {
    return undefined;
  }

  const attempted = autoFixEntries.filter((e) => /attempt/i.test(e.message)).length;
  const successful = autoFixEntries.filter((e) => e.status === "success").length;
  const failed = autoFixEntries.filter((e) => e.status === "failed").length;

  const reasons = new Set<RepairReasonCategory>();
  for (const e of autoFixEntries) {
    reasons.add(classifyRepairReason(`${e.message} ${e.details ?? ""}`));
  }
  if (snapshot.failureReport?.rootCauseLine) {
    reasons.add(classifyRepairReason(snapshot.failureReport.rootCauseLine));
  }

  const repairAttempted = Math.max(attempted, autoFixEntries.length > 0 ? 1 : 0);
  if (repairAttempted === 0 && reasons.size === 0) return undefined;

  return {
    attempted: repairAttempted,
    successful,
    failed,
    reasons: [...reasons],
  };
}

function summarizeAiCalls(
  calls: readonly AiCallLogEntry[],
): {
  aiCalls: number;
  estimatedPromptTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  aiCallLog: StudioRunAiCallSummary[];
} {
  let promptTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const aiCallLog: StudioRunAiCallSummary[] = [];

  for (const call of calls) {
    const split = splitEstimatedTokens(call.estimatedTokens);
    promptTokens += split.promptTokens;
    outputTokens += split.outputTokens;
    cost += estimateRunCostUsd(call.provider, split.promptTokens, split.outputTokens);
    aiCallLog.push({
      stage: call.stage,
      provider: call.provider,
      model: call.model,
      estimatedTokens: call.estimatedTokens,
      durationMs: call.durationMs,
      ok: call.ok,
    });
  }

  return {
    aiCalls: calls.length,
    estimatedPromptTokens: promptTokens,
    estimatedOutputTokens: outputTokens,
    estimatedTotalTokens: promptTokens + outputTokens,
    estimatedCostUsd: Math.round(cost * 10000) / 10000,
    aiCallLog,
  };
}

function coerceProvider(value: string | null | undefined): ProviderId | null {
  if (value === "gemini" || value === "ollama" || value === "anthropic" || value === "groq" || value === "openrouter") {
    return value;
  }
  return null;
}

const SKIPPED_ACTIONS: ReadonlySet<StudioActionType> = new Set([
  "idle",
  "preview",
]);

function analyticsStatusFromSnapshot(
  snapshot: GreenfieldRunSnapshot,
  ok: boolean,
): RunOutcome {
  const inferred = inferOutcomeFromSnapshot(snapshot);
  if (inferred) return inferred;
  return ok ? "success" : "failed";
}

export function buildAnalyticsRecord(opts: {
  snapshot: GreenfieldRunSnapshot;
  ok: boolean;
  message: string;
  detail?: string;
  runAnalytics: CurrentRunAnalyticsAccumulator;
}): StudioAnalyticsRecord | null {
  const { snapshot, ok, message, detail, runAnalytics } = opts;
  const actionType = snapshot.actionType;
  if (SKIPPED_ACTIONS.has(actionType)) return null;

  const at = Date.now();
  const durationMs =
    snapshot.runStartedAt != null ? at - snapshot.runStartedAt : null;

  const tokenStats = summarizeAiCalls(runAnalytics.aiCalls);
  const provider =
    coerceProvider(snapshot.provider) ??
    runAnalytics.aiCalls[0]?.provider ??
    null;
  const model =
    snapshot.model ??
    runAnalytics.aiCalls[0]?.model ??
    null;

  const workflow = snapshot.workflow ?? undefined;
  const prompt = workflow?.prompt;
  const verification = verificationSummary(snapshot.verification, workflow);
  const repair = repairSummaryFromEntries(snapshot);
  const status = analyticsStatusFromSnapshot(snapshot, ok);

  return {
    id: newRecordId(at),
    at,
    projectPath: snapshot.projectPath,
    actionType,
    actionLabel: STUDIO_ACTION_LABELS[actionType] ?? actionType,
    ok: status === "success",
    status,
    durationMs,
    provider,
    model,
    summary: message,
    ...(detail ? { detail } : {}),
    ...(prompt ? { prompt } : {}),
    ...tokenStats,
    ...(runAnalytics.contextSnapshotId
      ? { contextSnapshotId: runAnalytics.contextSnapshotId }
      : {}),
    ...(workflow?.filesWritten?.length
      ? { selectedFiles: workflow.filesWritten }
      : {}),
    ...(verification ? { verification } : {}),
    ...(repair ? { repair } : {}),
    ...(workflow ? { workflow } : {}),
  };
}

export function analyticsRecordKey(record: StudioAnalyticsRecord): string {
  return `${record.projectPath ?? "none"}-${record.actionType}-${record.at}-${record.status}`;
}
