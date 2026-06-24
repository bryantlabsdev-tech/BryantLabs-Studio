import { parseAiCallBudgetFromLogDetails } from "@/core/providers/aiCallBudgetDiagnostics";
import {
  RUN_LOG_STAGE_LABELS,
  type GreenfieldRunLogEntry,
  type RunLogStatus,
} from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { StudioRunSummary } from "@/core/studioRun/summary";

export type RunLogFilter = "all" | "running" | "success" | "warning" | "failed";

export interface RunLogBudgetSnapshot {
  readonly max: number | null;
  readonly used: number | null;
  readonly remaining: number | null;
}

export interface RunLogProviderCallDetails {
  readonly stage: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly tokens: string | null;
  readonly durationMs: string | null;
  readonly ok: boolean | null;
  readonly failureStatus: string | null;
  readonly budget: RunLogBudgetSnapshot | null;
}

export interface RunLogPlannerDiagnostics {
  readonly provider: string | null;
  readonly model: string | null;
  readonly parseFailReason: string | null;
  readonly parseError: string | null;
  readonly rawOutput: string | null;
  readonly error: string | null;
  readonly responseLength: number | null;
  readonly candidateCount: number | null;
  readonly finishReason: string | null;
  readonly safetyBlocked: boolean | null;
  readonly repairAttempted: boolean | null;
  readonly repairSucceeded: boolean | null;
  readonly repairSkippedReason: string | null;
  readonly providerMetadata: string | null;
  readonly providerHttpStatus: number | null;
  readonly providerRequestId: string | null;
  readonly providerLatency: number | null;
  readonly providerEndpoint: string | null;
  readonly generateMethod: string | null;
  readonly requestPayloadBytes: number | null;
  readonly maxOutputTokens: number | null;
  readonly thoughtsTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly tokenStarvationLikely: boolean | null;
  readonly tokenBudgetHint: string | null;
  readonly usageMetadata: string | null;
  readonly responseHeaders: string | null;
  readonly rawGeminiResponse: string | null;
}

export interface RunLogEntryDetails {
  readonly entry: GreenfieldRunLogEntry;
  readonly stageLabel: string;
  readonly providerCall: RunLogProviderCallDetails | null;
  readonly planner: RunLogPlannerDiagnostics | null;
  readonly isProviderFailure: boolean;
}

export interface RunLogSummarySection {
  readonly prompt: string | null;
  readonly filesProposed: number | null;
  readonly filesModified: number | null;
  readonly filesWritten: number;
  readonly commandsRun: readonly string[];
  readonly buildResult: string | null;
  readonly previewResult: string | null;
  readonly typescriptResult: string | null;
  readonly totalAiCalls: number | null;
  readonly budget: RunLogBudgetSnapshot;
}

export const RUN_LOG_SUMMARY_OPEN_KEY = "bryantlabs-studio-run-log-summary-open";

export function isRunLogActive(
  summary: Pick<StudioRunSummary, "runResult">,
): boolean {
  return summary.runResult === "running";
}

export function readRunLogSummaryOpenPreference(runActive: boolean): boolean {
  try {
    const raw = sessionStorage.getItem(RUN_LOG_SUMMARY_OPEN_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return !runActive;
}

export function persistRunLogSummaryOpenPreference(open: boolean): void {
  try {
    sessionStorage.setItem(RUN_LOG_SUMMARY_OPEN_KEY, open ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function formatRunLogSummaryCompact(section: RunLogSummarySection): string {
  const prompt = section.prompt?.trim();
  const promptPreview = prompt
    ? prompt.length > 72
      ? `${prompt.slice(0, 72)}…`
      : prompt
    : "—";
  const ts = section.typescriptResult ?? "—";
  const build = section.buildResult ?? "—";
  const aiCalls = section.totalAiCalls ?? "—";
  const budgetUsed = section.budget.used ?? "—";
  const budgetMax = section.budget.max ?? "—";
  const budgetRemaining = section.budget.remaining;
  const budget =
    budgetRemaining != null
      ? `${budgetUsed}/${budgetMax} (${budgetRemaining} left)`
      : `${budgetUsed}/${budgetMax}`;

  return [
    `Prompt: ${promptPreview}`,
    `Files written: ${section.filesWritten}`,
    `TS: ${ts}`,
    `Build: ${build}`,
    `AI calls: ${aiCalls}`,
    `Budget: ${budget}`,
  ].join(" · ");
}

function readDetailMap(details: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of details.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx < 0) continue;
    map.set(line.slice(0, idx).trim(), line.slice(idx + 2).trim());
  }
  return map;
}

function parseProviderCallLine(details: string): RunLogProviderCallDetails | null {
  if (!details.includes("stage=") && !details.includes("provider=")) return null;
  const firstLine = details.split("\n")[0] ?? details;
  const read = (key: string): string | null => {
    const m = firstLine.match(new RegExp(`${key}=([^·]+)`));
    return m?.[1]?.trim() ?? null;
  };
  const tokensMatch = firstLine.match(/tokens≈(\S+)/);
  const durationMatch = firstLine.match(/(\d+)ms/);
  const budget = parseAiCallBudgetFromLogDetails(details);
  return {
    stage: read("stage"),
    provider: read("provider"),
    model: read("model"),
    tokens: tokensMatch?.[1] ?? null,
    durationMs: durationMatch?.[1] ?? null,
    ok: firstLine.includes("success") ? true : firstLine.includes("failure") ? false : null,
    failureStatus: read("status"),
    budget: budget
      ? {
          max: budget.maxCalls ?? null,
          used: budget.usedCalls ?? null,
          remaining: budget.remainingCalls ?? null,
        }
      : null,
  };
}

export function parsePlannerDiagnosticsFromDetails(
  details: string | null | undefined,
  fallbackProvider: string | null,
  fallbackModel: string | null,
): RunLogPlannerDiagnostics | null {
  if (!details?.trim()) return null;
  const map = readDetailMap(details);
  const parseFailReason = map.get("parseFailReason") ?? null;
  const parseError = map.get("parseError") ?? null;
  const rawResponse =
    map.get("rawResponsePreview") ?? map.get("rawResponse") ?? null;
  const error = map.get("error") ?? null;
  const responseLengthRaw = map.get("responseLength");
  const candidateCountRaw = map.get("candidateCount");
  const repairAttemptedRaw = map.get("repairAttempted");
  const repairSucceededRaw = map.get("repairSucceeded");
  const safetyBlockedRaw = map.get("safetyBlocked");
  if (
    !parseFailReason &&
    !parseError &&
    !rawResponse &&
    !error &&
    !responseLengthRaw
  ) {
    return null;
  }
  const rawFromPreview = parseError?.match(/raw preview:\s*(.+?)(?:…)?$/i)?.[1] ?? null;
  return {
    provider: fallbackProvider,
    model: fallbackModel,
    parseFailReason,
    parseError,
    rawOutput: rawResponse ?? rawFromPreview,
    error,
    responseLength: responseLengthRaw ? Number(responseLengthRaw) : null,
    candidateCount: candidateCountRaw ? Number(candidateCountRaw) : null,
    finishReason: map.get("finishReason") ?? null,
    safetyBlocked:
      safetyBlockedRaw === "true"
        ? true
        : safetyBlockedRaw === "false"
          ? false
          : null,
    repairAttempted:
      repairAttemptedRaw === "true"
        ? true
        : repairAttemptedRaw === "false"
          ? false
          : null,
    repairSucceeded:
      repairSucceededRaw === "true"
        ? true
        : repairSucceededRaw === "false"
          ? false
          : null,
    repairSkippedReason: map.get("repairSkippedReason") ?? null,
    providerMetadata: map.get("providerMetadata") ?? map.get("rawGeminiResponse") ?? null,
    providerHttpStatus: map.get("providerHttpStatus")
      ? Number(map.get("providerHttpStatus"))
      : null,
    providerRequestId: map.get("providerRequestId") ?? null,
    providerLatency: map.get("providerLatency")
      ? Number(map.get("providerLatency"))
      : null,
    providerEndpoint: map.get("providerEndpoint") ?? null,
    generateMethod: map.get("generateMethod") ?? null,
    requestPayloadBytes: map.get("requestPayloadBytes")
      ? Number(map.get("requestPayloadBytes"))
      : null,
    maxOutputTokens: map.get("maxOutputTokens")
      ? Number(map.get("maxOutputTokens"))
      : null,
    thoughtsTokenCount: map.get("thoughtsTokenCount")
      ? Number(map.get("thoughtsTokenCount"))
      : null,
    candidatesTokenCount: map.get("candidatesTokenCount")
      ? Number(map.get("candidatesTokenCount"))
      : null,
    tokenStarvationLikely:
      map.get("tokenStarvationLikely") === "true"
        ? true
        : map.get("tokenStarvationLikely") === "false"
          ? false
          : null,
    tokenBudgetHint: map.get("tokenBudgetHint") ?? null,
    usageMetadata: map.get("usageMetadata") ?? null,
    responseHeaders: map.get("responseHeaders") ?? null,
    rawGeminiResponse: map.get("rawGeminiResponse") ?? null,
  };
}

export function extractLatestBudget(
  entries: readonly GreenfieldRunLogEntry[],
): RunLogBudgetSnapshot {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const budget = parseAiCallBudgetFromLogDetails(entries[i]?.details ?? "");
    if (budget) {
      return {
        max: budget.maxCalls ?? null,
        used: budget.usedCalls ?? null,
        remaining: budget.remainingCalls ?? null,
      };
    }
  }
  return { max: null, used: null, remaining: null };
}

export function countAiCallLogEntries(entries: readonly GreenfieldRunLogEntry[]): number {
  return entries.filter(
    (e) =>
      e.stage === "ai_call" ||
      e.stage === "provider_call" ||
      (e.details?.includes("stage=") && e.details.includes("provider=")),
  ).length;
}

export function buildRunLogSummarySection(
  snapshot: GreenfieldRunSnapshot,
  summary: StudioRunSummary,
): RunLogSummarySection {
  const filesModified = new Set(summary.filesAffected);
  return {
    prompt: summary.workflowPrompt ?? snapshot.workflow?.prompt ?? null,
    filesProposed: summary.filesProposed,
    filesModified: filesModified.size > 0 ? filesModified.size : null,
    filesWritten: summary.filesWritten.length,
    commandsRun: summary.commandsRun,
    buildResult: summary.buildResult,
    previewResult: summary.previewResult,
    typescriptResult: summary.typescriptResult,
    totalAiCalls: countAiCallLogEntries(snapshot.entries),
    budget: extractLatestBudget(snapshot.entries),
  };
}

export function parseRunLogEntryDetails(
  entry: GreenfieldRunLogEntry,
  summary: StudioRunSummary,
): RunLogEntryDetails {
  const providerCall = entry.details ? parseProviderCallLine(entry.details) : null;
  const planner =
    entry.stage === "ai_plan" && entry.status === "failed"
      ? parsePlannerDiagnosticsFromDetails(
          entry.details,
          summary.provider,
          summary.model,
        ) ?? {
          provider: summary.provider,
          model: summary.model,
          parseFailReason: entry.message.toLowerCase().includes("empty response")
            ? "empty_response"
            : entry.message.toLowerCase().includes("json")
              ? "no_json"
              : null,
          parseError: entry.details ?? entry.message,
          rawOutput: entry.details?.match(/rawResponse:\s*([\s\S]+)/)?.[1]?.trim() ?? null,
          error: entry.message,
          responseLength: null,
          candidateCount: null,
          finishReason: null,
          safetyBlocked: null,
          repairAttempted: null,
          repairSucceeded: null,
          repairSkippedReason: null,
          providerMetadata: null,
          providerHttpStatus: null,
          providerRequestId: null,
          providerLatency: null,
          providerEndpoint: null,
          generateMethod: null,
          requestPayloadBytes: null,
          maxOutputTokens: null,
          thoughtsTokenCount: null,
          candidatesTokenCount: null,
          tokenStarvationLikely: null,
          tokenBudgetHint: null,
          usageMetadata: null,
          responseHeaders: null,
          rawGeminiResponse: null,
        }
      : null;

  const isProviderFailure =
    entry.status === "failed" &&
    (entry.stage === "ai_call" ||
      entry.stage === "provider_call" ||
      entry.stage === "provider" ||
      entry.stage === "generation" ||
      Boolean(providerCall));

  return {
    entry,
    stageLabel: RUN_LOG_STAGE_LABELS[entry.stage] ?? entry.stage,
    providerCall,
    planner,
    isProviderFailure,
  };
}

export function filterRunLogEntries(
  entries: readonly GreenfieldRunLogEntry[],
  filter: RunLogFilter,
  search: string,
): readonly GreenfieldRunLogEntry[] {
  const q = search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter !== "all") {
      if (filter === "warning" && entry.status !== "pending") return false;
      if (filter === "running" && entry.status !== "running") return false;
      if (filter === "success" && entry.status !== "success") return false;
      if (filter === "failed" && entry.status !== "failed") return false;
    }
    if (!q) return true;
    const haystack = [
      entry.message,
      entry.details ?? "",
      RUN_LOG_STAGE_LABELS[entry.stage] ?? entry.stage,
      entry.status,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function runStatusBadgeClass(status: RunLogStatus | StudioRunSummary["runResult"]): string {
  if (status === "running") return "studio-run-log__badge--running";
  if (status === "success") return "studio-run-log__badge--success";
  if (status === "failed") return "studio-run-log__badge--failed";
  if (status === "pending") return "studio-run-log__badge--warning";
  if (status === "cancelled" || status === "aborted" || status === "interrupted") {
    return "studio-run-log__badge--warning";
  }
  return "studio-run-log__badge--neutral";
}

export function formatRunLogTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}
