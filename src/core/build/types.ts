/** Unified Build loop (Level Up) — one entry point for single + pipeline modes. */

export type BuildLoopMode = "single" | "pipeline";

export type BuildLoopPhase =
  | "idle"
  | "planning"
  | "coding"
  | "review"
  | "applying"
  | "verifying"
  | "repairing"
  | "completed"
  | "failed";

export interface BuildLoopStatus {
  readonly mode: BuildLoopMode;
  readonly phase: BuildLoopPhase;
  readonly running: boolean;
  readonly prompt: string | null;
  readonly error: string | null;
}

export function deriveBuildPhase(input: {
  mode: BuildLoopMode;
  buildRunning: boolean;
  pipelineRunning: boolean;
  pipelineStatus: string | null;
  aiPlanStatus: string;
  planApplyPhase: string | null;
  autoFixPhase: string | null;
}): BuildLoopPhase {
  if (input.pipelineRunning || input.buildRunning) {
    if (input.mode === "pipeline") {
      switch (input.pipelineStatus) {
        case "planning":
          return "planning";
        case "coding":
          return "coding";
        case "awaiting_review":
          return "review";
        case "verifying":
          return "verifying";
        case "repairing":
          return "repairing";
        default:
          return "planning";
      }
    }
    if (input.aiPlanStatus === "running") return "planning";
    if (
      input.planApplyPhase === "review" ||
      input.planApplyPhase === "waiting_for_review"
    ) {
      return "review";
    }
    if (input.planApplyPhase === "proposing") return "coding";
    if (input.planApplyPhase === "applying") return "applying";
    if (input.planApplyPhase === "verifying") return "verifying";
    return "planning";
  }

  if (input.mode === "pipeline" && input.pipelineStatus === "awaiting_review") {
    return "review";
  }
  if (
    input.planApplyPhase === "review" ||
    input.planApplyPhase === "waiting_for_review"
  ) {
    return "review";
  }
  if (input.autoFixPhase === "awaiting_approval") return "repairing";
  if (input.pipelineStatus === "completed") return "completed";
  if (input.pipelineStatus === "failed" || input.pipelineStatus === "cancelled") {
    return "failed";
  }
  if (input.planApplyPhase === "done") return "completed";
  return "idle";
}

export const BUILD_PHASE_LABELS: Record<BuildLoopPhase, string> = {
  idle: "Ready",
  planning: "Planning",
  coding: "Generating patches",
  review: "Awaiting your review",
  applying: "Applying changes",
  verifying: "Verifying",
  repairing: "Repairing",
  completed: "Completed",
  failed: "Failed",
};
