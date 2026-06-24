import type { AutoFixSession } from "@/core/autoFix";
import type { BuildLoopPhase } from "@/core/build/types";
import {
  deriveFollowUpRunStatus,
  type FollowUpRunPhase,
  type FollowUpRunStatus,
} from "@/core/build/followUpRun";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { PlanApplySession } from "@/core/planApply";
import type { ProviderId } from "@/core/providers/types";
import type { StudioIntentKind } from "@/core/agent/classifyStudioIntent";
import { deriveGreenfieldRunProgress } from "@/core/agent/greenfieldRunProgress";
import {
  getRunDurationMs,
  resolveRunTerminalState,
} from "@/core/agent/runTerminal";
import { buildFollowUpActivityStream } from "@/core/build/followUpRun";

export interface AgentRunStatusInput {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly greenfieldPanelActive: boolean;
  readonly agentIntent: StudioIntentKind | null;
  readonly buildPhase: BuildLoopPhase;
  readonly planApplyPhase: PlanApplySession["phase"] | null;
  readonly planApplySession: PlanApplySession | null;
  readonly autoFixPhase: AutoFixSession["phase"] | null;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly recentLogs: readonly GreenfieldRunLogEntry[];
  readonly runStartedAt: number | null;
  readonly provider: ProviderId | string | null;
  readonly model: string | null;
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly escalationNote?: string | null;
  readonly now?: number;
}

function greenfieldPhase(run: GreenfieldRunSnapshot, panelActive: boolean): FollowUpRunPhase | null {
  if (run.genStatus === "running") return "generating";
  if (
    run.genStatus === "done" &&
    run.writeStatus === "idle" &&
    run.setupStatus === "idle"
  ) {
    return "reviewing";
  }
  if (run.writeStatus === "writing") return "applying";
  if (run.setupStatus === "running" || run.setupStatus === "repairing") return "building";
  if (run.setupStatus === "repair_needed") return "failed";
  const last = run.entries[run.entries.length - 1];
  if (last?.stage === "preview" && last.status === "running") return "previewing";
  if (panelActive && run.genStatus !== "done" && run.runResult !== "success") return "generating";
  return null;
}

export function deriveAgentRunStatus(input: AgentRunStatusInput): FollowUpRunStatus {
  const terminal = resolveRunTerminalState(input.greenfieldRun, input.now ?? Date.now());
  const gfProgress = deriveGreenfieldRunProgress(
    input.greenfieldRun,
    input.greenfieldPanelActive,
    input.now ?? Date.now(),
  );
  if (gfProgress?.isActive && !terminal.isTerminal) {
    const gfPhase = greenfieldPhase(input.greenfieldRun, input.greenfieldPanelActive) ?? "generating";
    const stepIndex = gfProgress.steps.findIndex((s) => s.id === gfProgress.currentStage);
    const progressPercent = Math.min(
      95,
      Math.max(8, Math.round(((stepIndex + 1) / gfProgress.steps.length) * 100)),
    );
    const activity = buildFollowUpActivityStream(input.greenfieldRun.entries, null);
    return {
      phase: gfPhase,
      progressPercent,
      currentLabel: gfProgress.currentStageLabel,
      waitingLabel: gfProgress.composerLabel,
      nextLabel: gfProgress.steps.find((s) => s.status === "pending")?.label ?? null,
      elapsedMs: gfProgress.elapsedMs,
      provider: gfProgress.provider ?? input.greenfieldRun.provider,
      model: gfProgress.model ?? input.greenfieldRun.model,
      currentFile: null,
      isActive: true,
      activity,
      escalationNote: input.escalationNote ?? null,
      greenfieldProgress: gfProgress,
    };
  }

  const base = deriveFollowUpRunStatus({
    buildPhase: input.buildPhase,
    planApplyPhase: input.planApplyPhase,
    planApplySession: input.planApplySession,
    autoFixPhase: input.autoFixPhase,
    buildRunning: input.buildRunning,
    pipelineRunning: input.pipelineRunning,
    recentLogs: input.recentLogs,
    runStartedAt: input.runStartedAt,
    provider: input.provider,
    model: input.model,
    buildError: input.buildError,
    planApplyError: input.planApplyError,
    pipelineError: input.pipelineError,
    greenfieldRun: input.greenfieldRun,
    ...(input.escalationNote !== undefined
      ? { escalationNote: input.escalationNote }
      : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  });

  if (terminal.isTerminal) {
    const phase = terminal.outcome === "success" ? "done" : "failed";
    return {
      ...base,
      phase,
      progressPercent: terminal.outcome === "success" ? 100 : base.progressPercent,
      isActive: false,
      elapsedMs: getRunDurationMs(input.greenfieldRun, input.now ?? Date.now()),
    };
  }

  if (base.phase === "auditing") {
    return base;
  }
  if (input.agentIntent === "repair" && base.phase === "auto_repair") {
    return base;
  }
  if (input.agentIntent === "audit" && base.isActive) {
    return base;
  }

  return base;
}
