import type { BuildLoopPhase } from "@/core/build/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import { isGreenfieldRunActive } from "@/core/agent/agentRunMutex";
import { isRunTerminal } from "@/core/agent/runTerminal";

export type AgentRunLifecyclePhase =
  | "idle"
  | "queued"
  | "starting"
  | "scanning"
  | "planning"
  | "editing"
  | "installing"
  | "running"
  | "finished"
  | "failed";

export type AgentTimelineTone = "info" | "success" | "error" | "warn";

export interface AgentTimelineEvent {
  readonly id: string;
  readonly at: number;
  readonly label: string;
  readonly detail: string | null;
  readonly tone: AgentTimelineTone;
}

const LOG_STAGE_LABELS: Partial<
  Record<GreenfieldRunLogEntry["stage"], string>
> = {
  folder: "Repo selected",
  provider: "Provider ready",
  prompt: "Prompt submitted",
  generation: "Generation started",
  provider_response: "Provider responded",
  parser: "Files parsed",
  review: "Review / auto-write",
  approve: "Generation approved",
  write: "Files changed",
  npm_install: "Commands run — npm install",
  typescript: "TypeScript check",
  build: "Commands run — build",
  preview: "Preview started",
  ui_audit: "UI audit",
  ui_repair: "UI repair",
  greenfield_repair: "Greenfield repair",
  pipeline: "Agent pipeline",
};

function parseEntryTime(entry: GreenfieldRunLogEntry): number {
  const parsed = Date.parse(entry.timestamp);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function toneForLogStatus(
  status: GreenfieldRunLogEntry["status"],
): AgentTimelineTone {
  if (status === "failed") return "error";
  if (status === "success") return "success";
  if (status === "running") return "info";
  return "info";
}

export function deriveAgentRunLifecyclePhase(input: {
  readonly submissionPending: boolean;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly greenfieldPanelActive: boolean;
  readonly buildRunning: boolean;
  readonly buildPhase: BuildLoopPhase;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly now?: number;
}): AgentRunLifecyclePhase {
  const now = input.now ?? Date.now();
  const run = input.greenfieldRun;

  if (input.submissionPending) return "queued";

  if (run.setupStatus === "error" || run.genStatus === "error" || run.runResult === "failed") {
    return "failed";
  }
  if (run.runResult === "cancelled" || run.runResult === "interrupted") {
    return "failed";
  }
  if (isRunTerminal(run, now) && run.runResult === "success") {
    return "finished";
  }

  if (input.scanStatus === "scanning") return "scanning";

  if (
    run.setupStatus === "running" ||
    run.setupStatus === "repairing" ||
    run.entries.some((e) => e.stage === "npm_install" && e.status === "running")
  ) {
    return "installing";
  }

  if (
    input.buildPhase === "planning" ||
    input.buildPhase === "review" ||
    run.entries.some((e) => e.stage === "pipeline" && e.message.includes("plan"))
  ) {
    return "planning";
  }

  if (
    input.buildPhase === "applying" ||
    run.writeStatus === "writing" ||
    run.entries.some((e) => e.stage === "write" && e.status === "running")
  ) {
    return "editing";
  }

  if (
    run.genStatus === "running" ||
    isGreenfieldRunActive(run, input.greenfieldPanelActive) ||
    input.greenfieldPanelActive
  ) {
    if (run.entries.length === 0 && run.genStatus !== "running") {
      return "starting";
    }
    return "running";
  }

  if (input.buildRunning) return "running";

  return "idle";
}

export function buildAgentTimelineEvents(input: {
  readonly submissionAt: number | null;
  readonly submissionPromptLength: number | null;
  readonly activeRunId: string | null;
  readonly projectPath: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly timeline: RunTimelineSnapshot | null;
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
}): AgentTimelineEvent[] {
  const events: AgentTimelineEvent[] = [];

  if (input.submissionAt !== null) {
    events.push({
      id: "submission",
      at: input.submissionAt,
      label: "Prompt submitted",
      detail:
        input.submissionPromptLength !== null
          ? `${input.submissionPromptLength.toLocaleString()} characters`
          : null,
      tone: "info",
    });
  }

  if (input.activeRunId) {
    events.push({
      id: "run-created",
      at: input.submissionAt ?? Date.now(),
      label: "Run created",
      detail: input.activeRunId,
      tone: "info",
    });
  }

  if (input.projectPath) {
    events.push({
      id: "repo",
      at: input.submissionAt ?? Date.now(),
      label: "Repo selected",
      detail: input.projectPath,
      tone: "info",
    });
  }

  if (input.timeline) {
    for (const stage of input.timeline.stages) {
      const label =
        stage.stage === "audit_start" || stage.stage === "audit_complete"
          ? "Files scanned"
          : stage.stage === "plan_start" || stage.stage === "plan_complete"
            ? "Plan generated"
            : stage.stage === "apply_start" || stage.stage === "apply_complete"
              ? "Files changed"
              : stage.stage === "typescript_start" || stage.stage === "build_start"
                ? "Commands run"
                : stage.stage === "run_complete"
                  ? "Completion"
                  : stage.stage.replace(/_/g, " ");
      events.push({
        id: `tl-${stage.stage}-${stage.at}`,
        at: stage.at,
        label,
        detail: stage.detail,
        tone: stage.stage.includes("complete") ? "success" : "info",
      });
    }
    if (input.timeline.status === "failed" && input.timeline.failureDetail) {
      events.push({
        id: "tl-failure",
        at: input.timeline.completedAt ?? Date.now(),
        label: "Errors",
        detail: input.timeline.failureDetail,
        tone: "error",
      });
    }
  }

  for (const entry of input.greenfieldRun.entries) {
    const label = LOG_STAGE_LABELS[entry.stage] ?? entry.stage.replace(/_/g, " ");
    events.push({
      id: entry.id,
      at: parseEntryTime(entry),
      label,
      detail: entry.details ?? entry.message,
      tone: toneForLogStatus(entry.status),
    });
  }

  const error =
    input.buildError ?? input.planApplyError ?? input.pipelineError ?? input.greenfieldRun.finalMessage;
  if (error) {
    events.push({
      id: "surface-error",
      at: Date.now(),
      label: "Errors",
      detail: error,
      tone: "error",
    });
  }

  return events.sort((a, b) => a.at - b.at);
}

export function lifecyclePhaseLabel(phase: AgentRunLifecyclePhase): string {
  switch (phase) {
    case "idle":
      return "Idle";
    case "queued":
      return "Queued";
    case "starting":
      return "Starting";
    case "scanning":
      return "Scanning";
    case "planning":
      return "Planning";
    case "editing":
      return "Editing";
    case "installing":
      return "Installing";
    case "running":
      return "Running";
    case "finished":
      return "Finished";
    case "failed":
      return "Failed";
  }
}
