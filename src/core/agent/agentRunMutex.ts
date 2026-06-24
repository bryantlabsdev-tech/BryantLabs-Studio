import { isTerminalRunResult } from "@/core/agent/runOutcome";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { AIPlanStatus } from "@/app/orchestration/types";

export interface AgentRunMutexInput {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  /** Agent panel is showing the embedded greenfield wizard. */
  readonly greenfieldPanelActive: boolean;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplyPhase: string | null;
  readonly autoFixPhase: string | null;
}

const ACTIVE_PLAN_APPLY_PHASES = new Set([
  "proposing",
  "applying",
  "verifying",
  "waiting_for_review",
]);

const ACTIVE_AUTO_FIX_PHASES = new Set(["running", "proposing"]);

export function isGreenfieldRunActive(
  run: GreenfieldRunSnapshot,
  _greenfieldPanelActive: boolean,
): boolean {
  if (run.genStatus === "running") return true;
  if (run.writeStatus === "writing") return true;
  if (
    run.setupStatus === "running" ||
    run.setupStatus === "repairing" ||
    run.setupStatus === "repair_needed"
  ) {
    return true;
  }

  // Terminal outcomes must not stay busy because of stale log rows.
  if (isTerminalRunResult(run.runResult)) {
    return false;
  }

  const last = run.entries[run.entries.length - 1];
  if (last?.stage === "preview" && last.status === "running") return true;

  if (run.runResult === "running") {
    return run.entries.some(
      (entry) =>
        entry.status === "running" &&
        !(entry.stage === "generation" && run.genStatus === "done"),
    );
  }

  return false;
}

export function isFollowUpRunActive(input: AgentRunMutexInput): boolean {
  if (input.buildRunning || input.pipelineRunning) return true;
  if (input.aiPlanStatus === "running") return true;
  if (input.planApplyPhase && ACTIVE_PLAN_APPLY_PHASES.has(input.planApplyPhase)) {
    return true;
  }
  if (input.autoFixPhase && ACTIVE_AUTO_FIX_PHASES.has(input.autoFixPhase)) {
    return true;
  }
  return false;
}

export function isAgentRunActive(input: AgentRunMutexInput): boolean {
  return (
    isGreenfieldRunActive(input.greenfieldRun, input.greenfieldPanelActive) ||
    isFollowUpRunActive(input)
  );
}

/** Shown when Raw Greenfield sidebar / palette entry is blocked by an active Agent run. */
export const RAW_GREENFIELD_MUTEX_MESSAGE =
  "Agent is running a workflow. Use the Agent panel on the left, or cancel the active run before opening Raw Greenfield.";

/** True when One Agent owns the workflow — blocks parallel Raw Greenfield UI. */
export function isAgentWorkflowBusy(input: AgentRunMutexInput): boolean {
  return input.greenfieldPanelActive || isAgentRunActive(input);
}

export function getAgentRunBlockReason(input: AgentRunMutexInput): string | null {
  if (!isAgentRunActive(input)) return null;

  if (isGreenfieldRunActive(input.greenfieldRun, input.greenfieldPanelActive)) {
    if (input.greenfieldRun.genStatus === "running") {
      return "Greenfield generation is already running. Wait for it to finish or cancel.";
    }
    if (input.greenfieldRun.writeStatus === "writing") {
      return "Writing generated files. Wait for setup to finish.";
    }
    if (
      input.greenfieldRun.setupStatus === "running" ||
      input.greenfieldRun.setupStatus === "repairing"
    ) {
      return "Project setup is running. Wait for verification to finish.";
    }
    if (input.greenfieldRun.setupStatus === "repair_needed") {
      return "Greenfield setup needs repair before starting another run.";
    }
    return "A greenfield run is still active. Wait for it to finish.";
  }

  if (input.aiPlanStatus === "running") {
    return "AI Plan is running. Wait for it to finish.";
  }
  if (input.planApplyPhase === "waiting_for_review") {
    return "Review pending — approve, reject, or regenerate patches before starting another run.";
  }
  if (input.planApplyPhase === "proposing") {
    return "Apply Plan is generating patches. Wait for proposals to finish.";
  }
  if (input.planApplyPhase === "applying") {
    return "Applying plan changes. Wait for writes to finish.";
  }
  if (input.planApplyPhase === "verifying") {
    return "Verification is running. Wait for it to finish.";
  }
  if (input.autoFixPhase === "running" || input.autoFixPhase === "proposing") {
    return "Auto-fix repair is running. Wait for it to finish.";
  }
  if (input.buildRunning || input.pipelineRunning) {
    return "A follow-up run is already in progress. Wait for it to finish or cancel.";
  }

  return "Another Agent run is already in progress.";
}
