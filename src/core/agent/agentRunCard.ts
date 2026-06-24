import type { GreenfieldRunProgress, GreenfieldProgressStepId } from "@/core/agent/greenfieldRunProgress";
import type { RunTimelineSnapshot, RunTimelineStageId } from "@/core/agent/runTimeline";
import type { FollowUpRunStatus } from "@/core/build/followUpRun";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { PlanApplySession } from "@/core/planApply";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import type { ProviderId } from "@/core/providers/types";
import type { ProjectScan } from "@/types";
import { resolveRunVerification } from "@/core/diagnostics/verificationResolution";
import {
  getRunDurationMs,
  resolveRunTerminalState,
} from "@/core/agent/runTerminal";
import { outcomeToOverallStatus } from "@/core/agent/runOutcome";
import {
  deriveAgentRunConfidence,
  deriveAgentRunFailureDiagnosis,
  deriveAgentRunDiagnostics,
  type AgentRunDiagnosticsViewModel,
  deriveAgentRunPatchImpact,
  deriveAgentRunReasoning,
  deriveAgentRunSuccessSummary,
  type AgentRunConfidenceViewModel,
  type AgentRunFailureDiagnosisViewModel,
  type AgentRunPatchImpactViewModel,
  type AgentRunReasoningViewModel,
  type AgentRunSuccessSummaryViewModel,
} from "@/core/agent/agentRunInsight";
import {
  deriveRunFailureDetails,
  type RunFailureDetailsViewModel,
} from "@/core/agent/runFailureDiagnostics";
import {
  deriveAgentRunThoughtStream,
  type AgentRunThoughtEvent,
} from "@/core/agent/agentRunThoughtStream";

export type AgentRunStepId =
  | "understanding"
  | "planning"
  | "editing"
  | "applying"
  | "typescript"
  | "building"
  | "ui_audit"
  | "preview"
  | "complete";

export type AgentRunStepStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "retrying";

export type AgentRunOverallStatus =
  | "running"
  | "complete"
  | "incomplete"
  | "failed"
  | "cancelled"
  | "aborted"
  | "interrupted";

export interface AgentRunStep {
  readonly id: AgentRunStepId;
  readonly label: string;
  readonly status: AgentRunStepStatus;
}

export interface AgentRunVerification {
  readonly typescript: "pending" | "passed" | "failed" | "skipped";
  readonly build: "pending" | "passed" | "failed" | "skipped";
  readonly uiAudit: "pending" | "passed" | "failed" | "skipped" | "advisory";
  readonly preview: "pending" | "ready" | "failed" | "skipped";
}

export type AgentRunFileActivityStatus = "editing" | "written";

export interface AgentRunFileActivity {
  readonly path: string;
  readonly status: AgentRunFileActivityStatus;
}

export interface AgentRunCardViewModel {
  readonly isVisible: boolean;
  readonly title: string;
  readonly overallStatus: AgentRunOverallStatus;
  readonly currentStep: AgentRunStep | null;
  readonly steps: readonly AgentRunStep[];
  readonly progressPercent: number;
  readonly streamRevision: string;
  readonly providerLine: string | null;
  readonly providerIdentityLine: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly aiCallsUsed: number;
  readonly durationMs: number;
  readonly durationLabel: string;
  readonly providerEvents: readonly string[];
  readonly latestProviderEvent: string | null;
  readonly fileActivity: readonly AgentRunFileActivity[];
  readonly filesPlanned: readonly string[];
  readonly filesModified: readonly string[];
  readonly filesWritten: readonly string[];
  readonly verification: AgentRunVerification;
  readonly summary: string | null;
  readonly stuckMessage: string | null;
  readonly showRecoveryActions: boolean;
  readonly reasoning: AgentRunReasoningViewModel;
  readonly confidence: AgentRunConfidenceViewModel;
  readonly patchImpact: AgentRunPatchImpactViewModel;
  readonly failureDiagnosis: AgentRunFailureDiagnosisViewModel | null;
  readonly failureDetails: RunFailureDetailsViewModel | null;
  readonly diagnostics: AgentRunDiagnosticsViewModel;
  readonly successSummary: AgentRunSuccessSummaryViewModel | null;
  readonly thoughtStream: readonly AgentRunThoughtEvent[];
}

export const AGENT_RUN_STEP_DEFS: ReadonlyArray<{ id: AgentRunStepId; label: string }> = [
  { id: "understanding", label: "Understanding project" },
  { id: "planning", label: "Planning changes" },
  { id: "editing", label: "Editing files" },
  { id: "applying", label: "Applying patch" },
  { id: "typescript", label: "Checking TypeScript" },
  { id: "building", label: "Building app" },
  { id: "ui_audit", label: "Running UI audit" },
  { id: "preview", label: "Starting preview" },
  { id: "complete", label: "Complete" },
];

export const AGENT_RUN_PROGRESS_BY_STEP: Record<AgentRunStepId, number> = {
  understanding: 10,
  planning: 25,
  editing: 45,
  applying: 60,
  typescript: 72,
  building: 82,
  ui_audit: 90,
  preview: 96,
  complete: 100,
};

export function agentRunProgressPercent(
  currentStep: AgentRunStep | null,
  overallStatus: AgentRunOverallStatus,
): number {
  if (overallStatus === "complete") return 100;
  if (overallStatus === "incomplete") return 100;
  if (!currentStep) return 0;
  return AGENT_RUN_PROGRESS_BY_STEP[currentStep.id] ?? 0;
}

export function formatProviderIdentityLine(
  provider: string | null,
  model: string | null,
): string | null {
  if (!provider && !model) return null;
  if (provider && model) return `Using ${provider} · ${model}`;
  if (provider) return `Using ${provider}`;
  return model;
}

const STEP_ICON: Record<AgentRunStepStatus, string> = {
  pending: "⚪",
  running: "⏳",
  success: "✅",
  failed: "❌",
  skipped: "⚪",
  retrying: "↷",
};

export function agentRunStepIcon(status: AgentRunStepStatus): string {
  return STEP_ICON[status];
}

export function formatAgentRunDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${String(sec).padStart(2, "0")}s`;
}

export function formatAgentRunProviderLine(input: {
  provider: string | null;
  model: string | null;
  aiCallsUsed: number;
  durationMs: number;
}): string | null {
  if (!input.provider && !input.model && input.aiCallsUsed === 0) return null;
  const parts: string[] = [];
  if (input.provider) parts.push(`Using ${input.provider}`);
  if (input.model) parts.push(input.model);
  if (input.aiCallsUsed > 0) {
    parts.push(`${input.aiCallsUsed} AI call${input.aiCallsUsed === 1 ? "" : "s"}`);
  }
  if (input.durationMs > 0) {
    parts.push(formatAgentRunDuration(input.durationMs));
  }
  return parts.join(" · ");
}

const TIMELINE_STAGE_TO_STEP: Partial<Record<RunTimelineStageId, AgentRunStepId>> = {
  audit_start: "understanding",
  audit_complete: "understanding",
  plan_start: "planning",
  plan_complete: "planning",
  coder_start: "editing",
  coder_complete: "editing",
  patch_generated: "editing",
  waiting_for_review: "applying",
  apply_start: "applying",
  apply_complete: "applying",
  typescript_start: "typescript",
  typescript_complete: "typescript",
  build_start: "building",
  build_complete: "building",
  preview_start: "preview",
  preview_complete: "preview",
  run_complete: "complete",
};

const GREENFIELD_STEP_TO_AGENT: Partial<Record<GreenfieldProgressStepId, AgentRunStepId>> = {
  routing: "understanding",
  generating: "planning",
  parsing: "editing",
  review: "editing",
  writing: "applying",
  npm: "building",
  typescript: "typescript",
  build: "building",
  preview: "preview",
};

const GREENFIELD_STATUS_MAP: Record<
  GreenfieldRunProgress["steps"][number]["status"],
  AgentRunStepStatus
> = {
  pending: "pending",
  running: "running",
  done: "success",
  failed: "failed",
};

function providerDisplay(id: string | null): string | null {
  if (!id) return null;
  return id in PROVIDER_DISPLAY_LABELS
    ? PROVIDER_DISPLAY_LABELS[id as ProviderId]
    : id;
}

function parseFilesFromDetail(detail: string | null | undefined): string[] {
  if (!detail?.trim()) return [];
  const filesMatch = detail.match(/files=([^,]+(?:,[^,]+)*)/);
  if (filesMatch?.[1]) {
    return filesMatch[1].split(",").map((f) => f.trim()).filter(Boolean);
  }
  if (detail.includes("/") || detail.includes(".")) {
    return detail.split(",").map((f) => f.trim()).filter(Boolean);
  }
  return [];
}

function detailIndicatesFailure(detail: string | null): boolean {
  if (!detail) return false;
  return /fail|error|timeout|cancel/i.test(detail) && !/passed/i.test(detail);
}

function detailIndicatesSkipped(detail: string | null): boolean {
  return Boolean(detail && /skip/i.test(detail));
}

function stageDetail(
  timeline: RunTimelineSnapshot | null,
  stage: RunTimelineStageId,
): string | null {
  const record = timeline?.stages.find((s) => s.stage === stage);
  return record?.detail ?? null;
}

function hasStage(timeline: RunTimelineSnapshot | null, stage: RunTimelineStageId): boolean {
  return Boolean(timeline?.stages.some((s) => s.stage === stage));
}

function deriveStepStatusFromTimeline(
  stepId: AgentRunStepId,
  timeline: RunTimelineSnapshot | null,
  runActive: boolean,
): AgentRunStepStatus {
  if (!timeline) return "pending";

  const stagesForStep = timeline.stages.filter(
    (s) => TIMELINE_STAGE_TO_STEP[s.stage] === stepId,
  );
  if (stagesForStep.length === 0) return "pending";

  const completeStage = (() => {
    switch (stepId) {
      case "understanding":
        return "audit_complete";
      case "planning":
        return "plan_complete";
      case "editing":
        return stagesForStep.some((s) => s.stage === "patch_generated")
          ? "patch_generated"
          : "coder_complete";
      case "applying":
        return "apply_complete";
      case "typescript":
        return "typescript_complete";
      case "building":
        return "build_complete";
      case "preview":
        return "preview_complete";
      case "complete":
        return "run_complete";
      default:
        return null;
    }
  })();

  if (stepId === "complete") {
    if (hasStage(timeline, "run_complete")) {
      return timeline.status === "failed" ? "failed" : "success";
    }
    return runActive ? "pending" : "pending";
  }

  if (stepId === "ui_audit") {
    return "skipped";
  }

  const startStage = (() => {
    switch (stepId) {
      case "understanding":
        return "audit_start";
      case "planning":
        return "plan_start";
      case "editing":
        return "coder_start";
      case "applying":
        return "apply_start";
      case "typescript":
        return "typescript_start";
      case "building":
        return "build_start";
      case "preview":
        return "preview_start";
      default:
        return null;
    }
  })();

  const hasComplete = completeStage ? hasStage(timeline, completeStage) : false;
  const hasStart = startStage ? hasStage(timeline, startStage) : false;

  if (hasComplete) {
    const detail = stageDetail(timeline, completeStage!);
    if (detailIndicatesSkipped(detail)) return "skipped";
    if (detailIndicatesFailure(detail)) return "failed";
    if (stepId === "planning" && detail === "failed") return "failed";
    return "success";
  }

  if (hasStart || stagesForStep.length > 0) {
    if (!runActive && timeline.status === "failed") {
      return "failed";
    }
    return "running";
  }

  return "pending";
}

function deriveStepsFromGreenfieldProgress(
  progress: GreenfieldRunProgress,
  entries: readonly GreenfieldRunLogEntry[],
  runActive: boolean,
): AgentRunStep[] {
  const byAgentStep = new Map<AgentRunStepId, AgentRunStepStatus>();

  for (const step of progress.steps) {
    const agentId = GREENFIELD_STEP_TO_AGENT[step.id];
    if (!agentId) continue;
    const mapped = GREENFIELD_STATUS_MAP[step.status];
    const existing = byAgentStep.get(agentId);
    if (!existing || statusRank(mapped) > statusRank(existing)) {
      byAgentStep.set(agentId, mapped);
    }
  }

  const uiAuditEntries = entries.filter((e) => e.stage === "ui_audit");
  if (uiAuditEntries.some((e) => e.status === "failed")) {
    byAgentStep.set("ui_audit", "failed");
  } else if (uiAuditEntries.some((e) => e.status === "success")) {
    byAgentStep.set("ui_audit", "success");
  } else if (uiAuditEntries.some((e) => e.status === "running")) {
    byAgentStep.set("ui_audit", "running");
  } else if (!runActive) {
    byAgentStep.set("ui_audit", "skipped");
  }

  if (!runActive && progress.currentStage === "preview") {
    const previewStep = progress.steps.find((s) => s.id === "preview");
    if (previewStep?.status === "done") {
      byAgentStep.set("complete", "success");
    }
  }

  return AGENT_RUN_STEP_DEFS.map(({ id, label }) => ({
    id,
    label,
    status: byAgentStep.get(id) ?? "pending",
  }));
}

function statusRank(status: AgentRunStepStatus): number {
  switch (status) {
    case "failed":
      return 5;
    case "success":
      return 4;
    case "running":
      return 3;
    case "retrying":
      return 2;
    case "skipped":
      return 1;
    default:
      return 0;
  }
}

function deriveStepsFromTimeline(
  timeline: RunTimelineSnapshot | null,
  entries: readonly GreenfieldRunLogEntry[],
  runActive: boolean,
): AgentRunStep[] {
  const steps = AGENT_RUN_STEP_DEFS.map(({ id, label }) => ({
    id,
    label,
    status: deriveStepStatusFromTimeline(id, timeline, runActive),
  }));

  const uiAuditEntries = entries.filter((e) => e.stage === "ui_audit");
  const uiIdx = steps.findIndex((s) => s.id === "ui_audit");
  if (uiIdx >= 0) {
    let uiStatus: AgentRunStepStatus = "skipped";
    if (uiAuditEntries.some((e) => e.status === "failed")) uiStatus = "failed";
    else if (uiAuditEntries.some((e) => e.status === "success")) uiStatus = "success";
    else if (uiAuditEntries.some((e) => e.status === "running")) uiStatus = "running";
    else if (uiAuditEntries.length === 0 && runActive) uiStatus = "pending";
    steps[uiIdx] = { ...steps[uiIdx]!, status: uiStatus };
  }

  return steps;
}

function countAiCalls(entries: readonly GreenfieldRunLogEntry[]): number {
  return entries.filter((e) => e.stage === "ai_call" && e.status === "success").length;
}

function extractFilePath(text: string): string | null {
  const m =
    text.match(/(?:Updating|Updated|Applying changes to|Wrote|Generating changes for)\s+(\S+)/i) ??
    text.match(/\b((?:src\/|\.\/)?[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|css|json|html))\b/);
  return m?.[1] ?? null;
}

function collectFilesFromEntries(entries: readonly GreenfieldRunLogEntry[]): {
  planned: string[];
  modified: string[];
  written: string[];
} {
  const planned = new Set<string>();
  const modified = new Set<string>();
  const written = new Set<string>();

  for (const entry of entries) {
    const fromDetail = parseFilesFromDetail(entry.details ?? entry.message);
    for (const f of fromDetail) {
      if (entry.stage === "ai_plan" || entry.stage === "pipeline_planner") planned.add(f);
    }

    const path = extractFilePath(entry.message);
    if (!path) continue;

    if (
      entry.stage === "apply_plan" ||
      entry.stage === "pipeline_coder" ||
      entry.stage === "ai_plan"
    ) {
      planned.add(path);
    }
    if (entry.stage === "write" && entry.status === "success") {
      modified.add(path);
      written.add(path);
    }
    if (entry.stage === "apply_plan" && entry.status === "success") {
      modified.add(path);
    }
  }

  return {
    planned: [...planned],
    modified: [...modified],
    written: [...written],
  };
}

function collectFilesFromTimeline(timeline: RunTimelineSnapshot | null): string[] {
  if (!timeline) return [];
  const files: string[] = [];
  for (const stage of timeline.stages) {
    if (stage.stage === "patch_generated" || stage.stage === "plan_complete") {
      files.push(...parseFilesFromDetail(stage.detail));
    }
  }
  return files;
}

function collectFilesFromPlanSession(session: PlanApplySession | null): {
  planned: string[];
  modified: string[];
} {
  if (!session) return { planned: [], modified: [] };
  const planned = session.files.map((f) => f.relPath);
  const modified = session.files
    .filter((f) => f.status === "ready")
    .map((f) => f.relPath);
  return { planned, modified };
}

export function formatProviderEventMessage(entry: GreenfieldRunLogEntry): string | null {
  const text = `${entry.message} ${entry.details ?? ""}`.trim();
  if (entry.stage === "provider_fallback") {
    if (/selected|switch/i.test(text)) {
      const provider = entry.details?.match(/(\w+)/)?.[1];
      const label = provider ? providerDisplay(provider) ?? provider : "backup provider";
      return `Switching to ${label} backup…`;
    }
    return null;
  }
  if (
    entry.stage === "provider_call" &&
    entry.status === "success" &&
    /\[provider_call\]\s*success/i.test(text)
  ) {
    return "Provider recovered.";
  }
  if (entry.message.includes("provider_retry") || /\[provider_retry\]/i.test(text)) {
    const providerMatch = text.match(/provider[=:\s]+(\w+)/i);
    const label = providerMatch ? providerDisplay(providerMatch[1]!) ?? providerMatch[1] : "Provider";
    if (/rate|429|demand|busy|exhausted/i.test(text)) {
      return `${label} is busy. Retrying…`;
    }
    if (/timeout|timed out/i.test(text)) {
      return "Patch proposal timed out.";
    }
    return `${label} encountered an issue. Retrying…`;
  }
  if (/rate limit|429|high demand|resource exhausted/i.test(text)) {
    return "The provider is under high demand. Retrying…";
  }
  if (/timed out|timeout/i.test(text) && /patch|propos/i.test(text)) {
    return "Patch proposal timed out.";
  }
  if (/Switching to|Retrying with/i.test(text)) {
    return text.replace(/\[.*?\]\s*/g, "").trim();
  }
  if (/recovered|back online|retry succeeded/i.test(text)) {
    return "Provider recovered.";
  }
  return null;
}

function collectFileActivity(
  entries: readonly GreenfieldRunLogEntry[],
  planApplySession: PlanApplySession | null,
  timeline: RunTimelineSnapshot | null,
  currentStep: AgentRunStep | null,
): AgentRunFileActivity[] {
  const activity = new Map<string, AgentRunFileActivityStatus>();

  for (const path of collectFilesFromTimeline(timeline)) {
    activity.set(path, "editing");
  }

  for (const f of planApplySession?.files ?? []) {
    if (f.status === "proposing" || f.status === "pending" || f.status === "ready") {
      activity.set(f.relPath, "editing");
    }
  }

  for (const entry of entries) {
    const path = extractFilePath(entry.message);
    if (!path) {
      for (const f of parseFilesFromDetail(entry.details ?? entry.message)) {
        if (
          entry.stage === "apply_plan" ||
          entry.stage === "pipeline_coder" ||
          entry.stage === "ai_plan"
        ) {
          activity.set(f, "editing");
        }
      }
      continue;
    }

    if (
      entry.stage === "apply_plan" ||
      entry.stage === "pipeline_coder" ||
      entry.stage === "ai_plan"
    ) {
      if (entry.status === "running") activity.set(path, "editing");
    }
    if (entry.stage === "write") {
      if (entry.status === "running") activity.set(path, "editing");
      if (entry.status === "success") activity.set(path, "written");
    }
  }

  const showActivity =
    currentStep?.id === "editing" ||
    currentStep?.id === "applying" ||
    currentStep?.id === "planning" ||
    [...activity.values()].some((s) => s === "written");

  if (!showActivity && activity.size === 0) return [];

  return [...activity.entries()]
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => {
      if (a.status === b.status) return a.path.localeCompare(b.path);
      return a.status === "written" ? 1 : -1;
    });
}

function hasActiveProviderRetry(entries: readonly GreenfieldRunLogEntry[]): boolean {
  let lastRetryIdx = -1;
  let lastSuccessAfterRetry = -1;
  entries.forEach((entry, idx) => {
    const text = `${entry.message} ${entry.details ?? ""}`;
    if (/\[provider_retry\]|provider_retry/i.test(text)) lastRetryIdx = idx;
    if (
      lastRetryIdx >= 0 &&
      idx > lastRetryIdx &&
      entry.stage === "provider_call" &&
      entry.status === "success"
    ) {
      lastSuccessAfterRetry = idx;
    }
  });
  return lastRetryIdx >= 0 && lastSuccessAfterRetry < lastRetryIdx;
}

function applyRetryingStepStatus(
  steps: AgentRunStep[],
  entries: readonly GreenfieldRunLogEntry[],
): AgentRunStep[] {
  if (!hasActiveProviderRetry(entries)) return steps;
  const retrySteps = new Set<AgentRunStepId>(["planning", "editing"]);
  return steps.map((step) =>
    step.status === "running" && retrySteps.has(step.id)
      ? { ...step, status: "retrying" as const }
      : step,
  );
}

function collectProviderEvents(
  entries: readonly GreenfieldRunLogEntry[],
  escalationNote: string | null,
  provider: string | null,
  model: string | null,
): string[] {
  const events: string[] = [];
  const identity = formatProviderIdentityLine(provider, model);
  if (identity) events.push(identity);
  if (escalationNote?.trim()) events.push(escalationNote.trim());

  const seen = new Set<string>();
  let pendingRetry = false;

  for (const entry of entries) {
    const text = `${entry.message} ${entry.details ?? ""}`.trim();
    const isProviderEntry =
      entry.stage === "provider_call" ||
      entry.stage === "provider_fallback" ||
      entry.stage === "provider";

    if (/\[provider_retry\]|provider_retry/i.test(text)) {
      pendingRetry = true;
    }

    if (pendingRetry && entry.stage === "provider_call" && entry.status === "success") {
      const recovery = "Provider recovered.";
      if (!seen.has(recovery)) {
        seen.add(recovery);
        events.push(recovery);
      }
      pendingRetry = false;
      continue;
    }

    if (!isProviderEntry) continue;

    const msg = formatProviderEventMessage(entry);
    if (msg && !seen.has(msg) && msg !== identity) {
      seen.add(msg);
      events.push(msg);
    }
  }

  return events;
}

function buildStreamRevision(
  timeline: RunTimelineSnapshot | null,
  entries: readonly GreenfieldRunLogEntry[],
  currentStep: AgentRunStep | null,
): string {
  return [
    timeline?.runId ?? "none",
    timeline?.stages.length ?? 0,
    timeline?.lastStage ?? "none",
    timeline?.status ?? "none",
    entries.length,
    currentStep?.id ?? "none",
    currentStep?.status ?? "none",
  ].join(":");
}

function finalLogStageOutcome(
  entries: readonly GreenfieldRunLogEntry[],
  stage: GreenfieldRunLogEntry["stage"],
): "passed" | "failed" | "pending" {
  let outcome: "passed" | "failed" | "pending" = "pending";
  for (const entry of entries) {
    if (entry.stage !== stage) continue;
    if (entry.status === "success") outcome = "passed";
    if (entry.status === "failed") outcome = "failed";
  }
  return outcome;
}

function applyResolvedVerification(
  legacy: AgentRunVerification,
  run: GreenfieldRunSnapshot,
): AgentRunVerification {
  const resolved = resolveRunVerification({ run, cardVerification: legacy });
  const mapStatus = (
    value: typeof resolved.typescript,
    preview = false,
  ): AgentRunVerification[keyof AgentRunVerification] => {
    if (preview && value === "passed") return "ready";
    if (
      value === "passed" ||
      value === "failed" ||
      value === "skipped" ||
      value === "advisory" ||
      value === "pending"
    ) {
      return value;
    }
    return "pending";
  };

  return {
    typescript: mapStatus(resolved.typescript) as AgentRunVerification["typescript"],
    build: mapStatus(resolved.build) as AgentRunVerification["build"],
    uiAudit: mapStatus(resolved.uiAudit) as AgentRunVerification["uiAudit"],
    preview: mapStatus(resolved.preview, true) as AgentRunVerification["preview"],
  };
}

function deriveVerification(
  steps: readonly AgentRunStep[],
  entries: readonly GreenfieldRunLogEntry[],
  run: GreenfieldRunSnapshot,
  timeline: RunTimelineSnapshot | null,
): AgentRunVerification {
  const tsDetail = stageDetail(timeline, "typescript_complete");
  const buildDetail = stageDetail(timeline, "build_complete");
  const previewDetail = stageDetail(timeline, "preview_complete");

  const tsFromLog = finalLogStageOutcome(entries, "typescript");
  const buildFromLog = finalLogStageOutcome(entries, "build");
  const previewFromLog = finalLogStageOutcome(entries, "preview");
  const uiFromLog = finalLogStageOutcome(entries, "ui_audit");

  const wfTypecheck =
    run.workflow?.typecheckResult === "passed"
      ? "passed"
      : run.workflow?.typecheckResult?.includes("failed")
        ? "failed"
        : null;
  const wfBuild =
    run.workflow?.buildResult === "passed"
      ? "passed"
      : run.workflow?.buildResult?.includes("failed")
        ? "failed"
        : null;

  const typescript = ((): AgentRunVerification["typescript"] => {
    const step = steps.find((s) => s.id === "typescript");
    if (step?.status === "skipped") return "skipped";
    if (tsDetail) {
      if (detailIndicatesSkipped(tsDetail)) return "skipped";
      if (detailIndicatesFailure(tsDetail)) return "failed";
      return "passed";
    }
    if (wfTypecheck === "passed" || tsFromLog === "passed") return "passed";
    if (wfTypecheck === "failed" || tsFromLog === "failed") return "failed";
    if (step?.status === "success") return "passed";
    if (step?.status === "failed") return "failed";
    return "pending";
  })();

  const build = ((): AgentRunVerification["build"] => {
    const step = steps.find((s) => s.id === "building");
    if (step?.status === "skipped") return "skipped";
    if (buildDetail) {
      if (detailIndicatesSkipped(buildDetail)) return "skipped";
      if (detailIndicatesFailure(buildDetail)) return "failed";
      return "passed";
    }
    if (wfBuild === "passed" || buildFromLog === "passed") return "passed";
    if (wfBuild === "failed" || buildFromLog === "failed") return "failed";
    if (step?.status === "success") return "passed";
    if (step?.status === "failed") return "failed";
    return "pending";
  })();

  const uiAudit = ((): AgentRunVerification["uiAudit"] => {
    if (run.uiAuditResult?.advisory) return "advisory";
    if (run.uiAuditResult?.skipped) return "skipped";
    if (run.uiAuditResult?.ok === true) return "passed";
    if (run.runResult === "success" && run.uiAuditResult?.ok === false) return "skipped";
    if (run.uiAuditResult?.ok === false && !run.uiAuditResult.skipped) return "failed";
    if (uiFromLog === "passed") return "passed";
    if (uiFromLog === "failed") return "failed";
    const step = steps.find((s) => s.id === "ui_audit");
    if (step?.status === "skipped") return "skipped";
    if (step?.status === "success") return "passed";
    if (step?.status === "failed") return "failed";
    return "pending";
  })();

  const preview = ((): AgentRunVerification["preview"] => {
    if (previewDetail) {
      if (detailIndicatesSkipped(previewDetail)) return "skipped";
      if (detailIndicatesFailure(previewDetail)) return "failed";
      return "ready";
    }
    if (previewFromLog === "passed") return "ready";
    if (previewFromLog === "failed") return "failed";
    const step = steps.find((s) => s.id === "preview");
    if (step?.status === "success") return "ready";
    if (step?.status === "failed") return "failed";
    return "pending";
  })();

  return applyResolvedVerification({ typescript, build, uiAudit, preview }, run);
}

function buildFailureSummary(
  failureDetails: RunFailureDetailsViewModel | null,
  timeline: RunTimelineSnapshot | null,
  run: GreenfieldRunSnapshot,
): string {
  if (failureDetails?.summaryLine) return failureDetails.summaryLine;
  const rawDetail =
    timeline?.failureDetail?.trim() ||
    run.finalMessage?.trim() ||
    null;
  if (rawDetail) return rawDetail;
  return "Run failed — see Failure Details below.";
}

function resolveCurrentStep(steps: readonly AgentRunStep[]): AgentRunStep | null {
  const running = steps.find((s) => s.status === "running" || s.status === "retrying");
  if (running) return running;
  const failed = steps.find((s) => s.status === "failed");
  if (failed) return failed;
  const lastDone = [...steps].reverse().find((s) => s.status === "success");
  if (lastDone) {
    const idx = steps.findIndex((s) => s.id === lastDone.id);
    const next = steps[idx + 1];
    return next ?? lastDone;
  }
  return steps[0] ?? null;
}

function deriveStepsFromPhase(phase: FollowUpRunStatus["phase"], runActive: boolean): AgentRunStep[] {
  const phaseToStep: Partial<Record<FollowUpRunStatus["phase"], AgentRunStepId>> = {
    auditing: "understanding",
    thinking: "planning",
    planning: "planning",
    generating: "editing",
    editing: "editing",
    reviewing: "applying",
    applying: "applying",
    typescript: "typescript",
    building: "building",
    previewing: "preview",
    auto_repair: "typescript",
    done: "complete",
    failed: "complete",
  };

  if (!runActive && phase === "done") {
    return AGENT_RUN_STEP_DEFS.map(({ id, label }) => ({
      id,
      label,
      status: "success" as AgentRunStepStatus,
    }));
  }

  const activeStep = phaseToStep[phase];
  const activeIdx = activeStep
    ? AGENT_RUN_STEP_DEFS.findIndex((s) => s.id === activeStep)
    : -1;

  return AGENT_RUN_STEP_DEFS.map(({ id, label }, idx) => {
    if (!runActive && phase === "failed") {
      if (id === "complete") return { id, label, status: "failed" as const };
      if (activeIdx >= 0 && idx < activeIdx) return { id, label, status: "success" as const };
      if (idx === activeIdx) return { id, label, status: "failed" as const };
      return { id, label, status: "pending" as const };
    }
    if (activeIdx < 0) return { id, label, status: "pending" as const };
    if (idx < activeIdx) return { id, label, status: "success" as const };
    if (idx === activeIdx) return { id, label, status: "running" as const };
    return { id, label, status: "pending" as const };
  });
}

export interface DeriveAgentRunCardInput {
  readonly runStatus: FollowUpRunStatus;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly planApplySession: PlanApplySession | null;
  readonly plan?: Plan | null;
  readonly aiPlan?: AIPlanResult | null;
  readonly scan?: ProjectScan | null;
  readonly prompt?: string | null;
  readonly now?: number;
}

export function deriveAgentRunCard(input: DeriveAgentRunCardInput): AgentRunCardViewModel {
  const { runStatus, greenfieldRun, planApplySession } = input;
  const now = input.now ?? Date.now();
  const terminal = resolveRunTerminalState(greenfieldRun, now);
  const timeline = greenfieldRun.runTimeline;
  const entries = greenfieldRun.entries;
  const runActive = !terminal.isTerminal && runStatus.isActive;
  const greenfieldProgress =
    !terminal.isTerminal && runStatus.greenfieldProgress?.isActive
      ? runStatus.greenfieldProgress
      : null;

  const isGreenfield = Boolean(greenfieldProgress?.isActive);
  const isVisible =
    runActive ||
    runStatus.phase === "done" ||
    runStatus.phase === "failed" ||
    Boolean(
      timeline &&
        (timeline.status === "complete" || timeline.status === "failed"),
    );

  const steps = applyRetryingStepStatus(
    (() => {
      if (greenfieldProgress?.isActive) {
        return deriveStepsFromGreenfieldProgress(greenfieldProgress, entries, runActive);
      }
      if (timeline?.stages.length) {
        return deriveStepsFromTimeline(timeline, entries, runActive);
      }
      if (runActive || runStatus.phase === "done" || runStatus.phase === "failed") {
        return deriveStepsFromPhase(runStatus.phase, runActive);
      }
      return deriveStepsFromTimeline(timeline, entries, runActive);
    })(),
    entries,
  );

  const currentStep = resolveCurrentStep(steps);

  let overallStatus: AgentRunOverallStatus = "running";
  if (terminal.isTerminal && terminal.outcome) {
    overallStatus = outcomeToOverallStatus(terminal.outcome);
  } else if (timeline?.status === "complete" || (!runActive && runStatus.phase === "done")) {
    overallStatus = "complete";
  } else if (timeline?.status === "failed" || runStatus.phase === "failed") {
    overallStatus = "failed";
  } else if (steps.some((s) => s.status === "failed")) {
    overallStatus = runActive ? "running" : "failed";
  }

  const progressPercent = agentRunProgressPercent(currentStep, overallStatus);

  const durationMs = getRunDurationMs(greenfieldRun, now);

  const provider =
    runStatus.provider ??
    (greenfieldRun.provider ? providerDisplay(greenfieldRun.provider) : null);
  const model = runStatus.model ?? greenfieldRun.model;
  const aiCallsUsed = countAiCalls(entries);
  const providerIdentityLine = formatProviderIdentityLine(provider, model);

  const providerLine = formatAgentRunProviderLine({
    provider,
    model,
    aiCallsUsed,
    durationMs,
  });

  const fromEntries = collectFilesFromEntries(entries);
  const fromTimeline = collectFilesFromTimeline(timeline);
  const fromPlan = collectFilesFromPlanSession(planApplySession);

  const filesPlanned = [...new Set([...fromTimeline, ...fromPlan.planned, ...fromEntries.planned])];
  const filesModified = [
    ...new Set([
      ...fromPlan.modified,
      ...fromEntries.modified,
      ...greenfieldRun.filesWritten,
    ]),
  ];
  const filesWritten = [
    ...new Set([...fromEntries.written, ...greenfieldRun.filesWritten]),
  ];

  const providerEvents = collectProviderEvents(
    entries,
    runStatus.escalationNote,
    provider,
    model,
  );
  const latestProviderEvent =
    providerEvents.filter((e) => e !== providerIdentityLine).at(-1) ?? null;
  const fileActivity = collectFileActivity(entries, planApplySession, timeline, currentStep);
  const streamRevision = buildStreamRevision(timeline, entries, currentStep);
  const verification = deriveVerification(steps, entries, greenfieldRun, timeline);

  const failureDetails =
    overallStatus === "failed" && !runActive
      ? deriveRunFailureDetails({
          greenfieldRun,
          failureReport: greenfieldRun.failureReport,
          durationMs,
          provider,
          model,
          filesModified,
          overallFailed: true,
        })
      : null;

  let summary: string | null = null;
  let successSummary: AgentRunSuccessSummaryViewModel | null = null;
  if (overallStatus === "complete") {
    successSummary = deriveAgentRunSuccessSummary({
      filesModified,
      verification,
      plan: input.plan ?? null,
      aiPlan: input.aiPlan ?? null,
      planApplySession,
      greenfieldRun,
    });
    summary = successSummary.summaryLine;
  } else if (overallStatus === "incomplete" && !runActive) {
    summary =
      greenfieldRun.finalMessage?.trim() ||
      "Build completed but one or more prompt requirements were not met.";
  } else if (overallStatus === "cancelled" && !runActive) {
    summary =
      greenfieldRun.finalMessage?.trim() || "Run cancelled. You can try again.";
  } else if (overallStatus === "aborted" && !runActive) {
    summary =
      greenfieldRun.finalMessage?.trim() ||
      greenfieldRun.latestAction?.summary?.trim() ||
      "Run aborted before completion.";
  } else if (overallStatus === "interrupted" && !runActive) {
    summary =
      greenfieldRun.finalMessage?.trim() ||
      greenfieldRun.latestAction?.summary?.trim() ||
      "Run interrupted — you can try again.";
  } else if (overallStatus === "failed" && !runActive) {
    summary = buildFailureSummary(failureDetails, timeline, greenfieldRun);
  }

  const insightInput = {
    prompt: input.prompt ?? planApplySession?.prompt ?? null,
    plan: input.plan ?? null,
    aiPlan: input.aiPlan ?? null,
    scan: input.scan ?? null,
    planApplySession,
    greenfieldRun,
    verification,
    filesModified,
    runActive,
    currentStepId: currentStep?.id ?? null,
  };

  const reasoning = deriveAgentRunReasoning(insightInput);
  const confidence = deriveAgentRunConfidence(insightInput);
  const patchImpact = deriveAgentRunPatchImpact(insightInput);
  const failureDiagnosis = deriveAgentRunFailureDiagnosis(
    greenfieldRun.failureReport,
    greenfieldRun,
    overallStatus === "failed",
  );
  const diagnostics = deriveAgentRunDiagnostics(
    greenfieldRun.failureReport,
    greenfieldRun,
    overallStatus === "failed",
  );

  const thoughtStream = deriveAgentRunThoughtStream({
    entries,
    timeline,
    scan: input.scan ?? null,
    currentStep,
    fileActivity,
  });

  const stuckMessage = greenfieldProgress?.stuckMessage ?? null;
  const showRecoveryActions =
    greenfieldProgress?.stuckLevel === "waiting_120" ||
    greenfieldProgress?.stuckLevel === "waiting_180" ||
    greenfieldProgress?.stuckLevel === "possibly_stuck_5m";

  return {
    isVisible,
    title: isGreenfield ? "Creating app" : "Agent run",
    overallStatus,
    currentStep,
    steps,
    progressPercent,
    streamRevision,
    providerLine,
    providerIdentityLine,
    provider,
    model,
    aiCallsUsed,
    durationMs,
    durationLabel: formatAgentRunDuration(durationMs),
    providerEvents,
    latestProviderEvent,
    fileActivity,
    filesPlanned,
    filesModified,
    filesWritten,
    verification,
    summary,
    stuckMessage,
    showRecoveryActions,
    reasoning,
    confidence,
    patchImpact,
    failureDiagnosis,
    failureDetails,
    diagnostics,
    successSummary,
    thoughtStream,
  };
}
