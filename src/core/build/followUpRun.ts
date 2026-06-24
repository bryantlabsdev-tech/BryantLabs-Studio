import type { AutoFixSession } from "@/core/autoFix";
import type { BuildLoopPhase } from "./types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { PlanApplyPhase, PlanApplySession } from "@/core/planApply/types";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import type { ProviderId } from "@/core/providers/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import {
  getRunDurationMs,
  resolveRunTerminalState,
} from "@/core/agent/runTerminal";
import {
  AGENT_PIPELINE_UNDERSTANDING,
  AGENT_UX_STAGE_LABELS,
} from "@/core/agent/agentUxLabels";
import { explicitWaitingLabel } from "./waitingStates";

/** Detailed follow-up run phases for Build V2 status bar. */
export type FollowUpRunPhase =
  | "idle"
  | "auditing"
  | "thinking"
  | "generating"
  | "planning"
  | "editing"
  | "reviewing"
  | "applying"
  | "typescript"
  | "building"
  | "previewing"
  | "auto_repair"
  | "done"
  | "failed";

export const FOLLOWUP_RUN_PHASE_LABELS = AGENT_UX_STAGE_LABELS;

/** Internal phase-to-percent map for legacy follow-up status; UI must use agentRunCard.progressPercent. */
const PROGRESS_BY_PHASE: Record<FollowUpRunPhase, number> = {
  idle: 0,
  auditing: 8,
  thinking: 10,
  generating: 22,
  planning: 20,
  editing: 40,
  reviewing: 50,
  applying: 58,
  typescript: 72,
  building: 84,
  previewing: 94,
  auto_repair: 76,
  done: 100,
  failed: 0,
};

const NEXT_STEP_BY_PHASE: Partial<Record<FollowUpRunPhase, string>> = {
  thinking: "Planning file changes",
  generating: "Review generated files",
  planning: "Generating edits",
  editing: "Review or apply changes",
  reviewing: "Apply changes",
  applying: "TypeScript verification",
  typescript: "Production build",
  building: "Starting preview",
  previewing: "Finishing up",
  auto_repair: "Re-running verification",
};

export interface FollowUpActivityItem {
  readonly id: string;
  readonly message: string;
  readonly status: "running" | "success" | "failed";
  readonly timestamp: number;
}

export interface FollowUpRunStatus {
  readonly phase: FollowUpRunPhase;
  readonly progressPercent: number;
  readonly currentLabel: string;
  readonly waitingLabel: string;
  readonly nextLabel: string | null;
  readonly elapsedMs: number;
  readonly provider: string | null;
  readonly model: string | null;
  readonly currentFile: string | null;
  readonly isActive: boolean;
  readonly activity: readonly FollowUpActivityItem[];
  readonly escalationNote: string | null;
  readonly greenfieldProgress?: import("@/core/agent/greenfieldRunProgress").GreenfieldRunProgress | null;
}

export interface FollowUpSuccessSnapshot {
  readonly prompt: string;
  readonly filesModified: readonly string[];
  readonly provider: string | null;
  readonly model: string | null;
  readonly durationMs: number;
  readonly previewReady: boolean;
  readonly completedAt: number;
  readonly summary: string;
  readonly typecheckPassed: boolean;
  readonly buildPassed: boolean;
  readonly suggestedNextSteps: readonly string[];
}

export function formatElapsedDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function followUpRunProgress(phase: FollowUpRunPhase): number {
  return PROGRESS_BY_PHASE[phase] ?? 0;
}

function extractFilePath(text: string): string | null {
  const m =
    text.match(/(?:Updating|Updated|Applying changes to|Wrote|Generating changes for)\s+(\S+)/i) ??
    text.match(/\b((?:src\/|\.\/)?[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|css|json|html))\b/);
  return m?.[1] ?? null;
}

function phaseFromRunningLog(entry: GreenfieldRunLogEntry): FollowUpRunPhase | null {
  if (
    entry.stage === "pipeline" &&
    /(?:auditing|understanding)\s+project/i.test(entry.message)
  ) {
    return "auditing";
  }
  switch (entry.stage) {
    case "ai_plan":
    case "pipeline_planner":
      return "thinking";
    case "apply_plan":
    case "pipeline_coder":
      return "editing";
    case "write":
      return "applying";
    case "typescript":
      return "typescript";
    case "build":
      return "building";
    case "preview":
      return "previewing";
    case "auto_fix":
    case "pipeline_repair":
      return "auto_repair";
    case "review":
      return "reviewing";
    default:
      return null;
  }
}

export function deriveFollowUpRunPhase(input: {
  buildPhase: BuildLoopPhase;
  planApplyPhase: PlanApplyPhase | null;
  autoFixPhase: AutoFixSession["phase"] | null;
  buildRunning: boolean;
  pipelineRunning: boolean;
  recentLogs: readonly GreenfieldRunLogEntry[];
  hasError: boolean;
}): FollowUpRunPhase {
  const {
    buildPhase,
    planApplyPhase,
    autoFixPhase,
    buildRunning,
    pipelineRunning,
    recentLogs,
    hasError,
  } = input;

  if (hasError || buildPhase === "failed") return "failed";
  if (buildPhase === "completed" || planApplyPhase === "done") return "done";

  const active = buildRunning || pipelineRunning;
  if (
    !active &&
    planApplyPhase !== "review" &&
    planApplyPhase !== "waiting_for_review" &&
    autoFixPhase !== "awaiting_approval" &&
    autoFixPhase !== "proposing"
  ) {
    return "idle";
  }

  if (
    autoFixPhase === "proposing" ||
    autoFixPhase === "awaiting_approval"
  ) {
    return "auto_repair";
  }

  const lastRunning = [...recentLogs].reverse().find((e) => e.status === "running");
  if (lastRunning) {
    const fromLog = phaseFromRunningLog(lastRunning);
    if (fromLog) return fromLog;
  }

  if (planApplyPhase === "proposing") return "editing";
  if (planApplyPhase === "applying") return "applying";
  if (planApplyPhase === "verifying") {
    const lastTs = [...recentLogs].reverse().find((e) => e.stage === "typescript");
    const lastBuild = [...recentLogs].reverse().find((e) => e.stage === "build");
    if (lastBuild?.status === "running") return "building";
    if (lastTs?.status === "running" || lastTs?.status === "failed") return "typescript";
    return "typescript";
  }
  if (planApplyPhase === "review" || planApplyPhase === "waiting_for_review") {
    return "reviewing";
  }

  switch (buildPhase) {
    case "planning":
      return "planning";
    case "coding":
      return "editing";
    case "applying":
      return "applying";
    case "review":
      return "reviewing";
    case "verifying":
      return "typescript";
    case "repairing":
      return "auto_repair";
    default:
      return active ? "thinking" : "idle";
  }
}

function buildCurrentLabel(phase: FollowUpRunPhase): string {
  return FOLLOWUP_RUN_PHASE_LABELS[phase];
}

export function buildFollowUpActivityStream(
  entries: readonly GreenfieldRunLogEntry[],
  _planApplySession: PlanApplySession | null,
): FollowUpActivityItem[] {
  const items: FollowUpActivityItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.stage === "pipeline" && /\[build\] started/i.test(entry.message)) continue;
    const msg = formatActivityMessage(entry);
    if (!msg || seen.has(msg)) continue;
    seen.add(msg);
    items.push({
      id: entry.id,
      message: msg,
      status:
        entry.status === "success"
          ? "success"
          : entry.status === "failed"
            ? "failed"
            : "running",
      timestamp: Date.parse(entry.timestamp) || Date.now(),
    });
  }

  return items.slice(-12);
}

function formatActivityMessage(entry: GreenfieldRunLogEntry): string | null {
  const file = extractFilePath(entry.message);
  switch (entry.stage) {
    case "write":
      return entry.status === "success"
        ? `${AGENT_UX_STAGE_LABELS.applying}\n✓ Saved`
        : AGENT_UX_STAGE_LABELS.applying;
    case "typescript":
      return entry.status === "success"
        ? "Testing changes\n✓ Passed"
        : entry.status === "failed"
          ? "Testing changes\n✗ Failed"
          : "Testing changes";
    case "build":
      return entry.status === "success"
        ? "Testing changes\n✓ Passed"
        : entry.status === "failed"
          ? "Testing changes\n✗ Failed"
          : "Testing changes";
    case "preview":
      return entry.status === "success"
        ? "Preview ready"
        : entry.status === "running"
          ? "Starting preview"
          : "Preview";
    case "apply_plan":
    case "pipeline_coder": {
      if (/propos/i.test(entry.message) || file) {
        return AGENT_UX_STAGE_LABELS.editing;
      }
      return null;
    }
    case "pipeline":
      if (/(?:auditing|understanding)\s+project/i.test(entry.message)) {
        return entry.status === "success"
          ? `${AGENT_PIPELINE_UNDERSTANDING}\n✓ Ready`
          : AGENT_PIPELINE_UNDERSTANDING;
      }
      return null;
    case "ai_plan":
    case "pipeline_planner":
      return AGENT_UX_STAGE_LABELS.planning;
    case "auto_fix":
    case "pipeline_repair":
      return entry.status === "success" ? "Auto repair completed" : "Fixing issues automatically…";
    default:
      if (looksInternalActivity(entry.message)) return null;
      if (entry.message.trim()) return entry.message.trim();
      return null;
  }
}

function looksInternalActivity(text: string): boolean {
  return (
    /@@FILE/i.test(text) ||
    /\bapply_plan\b/i.test(text) ||
    /\[apply_plan\]/i.test(text) ||
    /proposing patches/i.test(text)
  );
}

export function deriveFollowUpRunStatus(input: {
  buildPhase: BuildLoopPhase;
  planApplyPhase: PlanApplyPhase | null;
  planApplySession: PlanApplySession | null;
  autoFixPhase: AutoFixSession["phase"] | null;
  buildRunning: boolean;
  pipelineRunning: boolean;
  recentLogs: readonly GreenfieldRunLogEntry[];
  runStartedAt: number | null;
  provider: ProviderId | string | null;
  model: string | null;
  buildError: string | null;
  planApplyError: string | null;
  pipelineError: string | null;
  greenfieldRun?: GreenfieldRunSnapshot | null;
  escalationNote?: string | null;
  now?: number;
}): FollowUpRunStatus {
  const now = input.now ?? Date.now();
  const terminal = input.greenfieldRun
    ? resolveRunTerminalState(input.greenfieldRun, now)
    : null;

  const hasError = Boolean(
    input.buildError ?? input.planApplyError ?? input.pipelineError,
  );
  let phase = deriveFollowUpRunPhase({
    buildPhase: input.buildPhase,
    planApplyPhase: input.planApplyPhase,
    autoFixPhase: input.autoFixPhase,
    buildRunning: input.buildRunning,
    pipelineRunning: input.pipelineRunning,
    recentLogs: input.recentLogs,
    hasError,
  });

  if (terminal?.isTerminal) {
    phase = terminal.outcome === "success" ? "done" : "failed";
  }

  const lastRunning = [...input.recentLogs].reverse().find((e) => e.status === "running") ?? null;
  const proposingFile =
    input.planApplySession?.files.find(
      (f) => f.status === "proposing" || f.status === "pending",
    )?.relPath ?? null;
  const applyingFile =
    input.planApplySession?.files.find((f) => f.decision === "approved" && f.status === "ready")
      ?.relPath ?? null;
  const currentFile =
    extractFilePath(lastRunning?.message ?? "") ??
    proposingFile ??
    applyingFile ??
    input.planApplySession?.selectedRelPath ??
    null;

  const startedAt = input.runStartedAt ?? Date.parse(input.recentLogs[0]?.timestamp ?? "") ?? null;
  const elapsedMs =
    input.greenfieldRun != null
      ? getRunDurationMs(input.greenfieldRun, now)
      : startedAt && phase !== "idle"
        ? Math.max(
            0,
            (terminal?.isTerminal ? (terminal.endedAtMs ?? now) : now) - startedAt,
          )
        : 0;

  const providerLabel =
    input.provider && input.provider in PROVIDER_DISPLAY_LABELS
      ? PROVIDER_DISPLAY_LABELS[input.provider as ProviderId]
      : input.provider;

  return {
    phase,
    progressPercent: followUpRunProgress(phase),
    currentLabel: buildCurrentLabel(phase),
    waitingLabel: explicitWaitingLabel(phase, {
      escalationNote: input.escalationNote ?? null,
    }),
    nextLabel: NEXT_STEP_BY_PHASE[phase] ?? null,
    elapsedMs: Math.max(0, elapsedMs),
    provider: providerLabel,
    model: input.model,
    currentFile,
    isActive: terminal?.isTerminal
      ? false
      : input.buildRunning ||
        input.pipelineRunning ||
        phase === "reviewing" ||
        phase === "auto_repair",
    activity: buildFollowUpActivityStream(input.recentLogs, input.planApplySession),
    escalationNote: input.escalationNote ?? null,
  };
}

export function buildFollowUpSuccessSnapshot(input: {
  prompt: string;
  filesModified: readonly string[];
  provider: string | null;
  model: string | null;
  runStartedAt: number | null;
  planSummary: string | null;
  previewReady: boolean;
  typecheckPassed?: boolean;
  buildPassed?: boolean;
  suggestedNextSteps?: readonly string[];
  completedAt?: number;
}): FollowUpSuccessSnapshot {
  const completedAt = input.completedAt ?? Date.now();
  const durationMs = input.runStartedAt ? completedAt - input.runStartedAt : 0;
  const summary =
    input.planSummary?.trim() ||
    (input.filesModified.length > 0
      ? `Updated ${input.filesModified.length} file${input.filesModified.length === 1 ? "" : "s"}.`
      : "Changes applied successfully.");

  return {
    prompt: input.prompt,
    filesModified: input.filesModified,
    provider: input.provider,
    model: input.model,
    durationMs: Math.max(0, durationMs),
    previewReady: input.previewReady,
    completedAt,
    summary,
    typecheckPassed: input.typecheckPassed ?? false,
    buildPassed: input.buildPassed ?? false,
    suggestedNextSteps: input.suggestedNextSteps ?? [],
  };
}
