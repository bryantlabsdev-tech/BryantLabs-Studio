import { isAgentRunActive, type AgentRunMutexInput } from "@/core/agent/agentRunMutex";
import { isTerminalRunResult } from "@/core/agent/runOutcome";
import type { AIPlanStatus } from "@/app/orchestration/types";
import type { PlanApplySession } from "@/core/planApply";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";

export interface StaleRunContextInput {
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplySession: PlanApplySession | null;
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly verification: unknown;
  readonly builderSession: unknown;
  readonly executionSession: unknown;
  readonly followUpEscalation: unknown;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly mutex: AgentRunMutexInput;
}

/** True when the workspace is idle after a terminal run that is safe to follow with a new prompt. */
export function isSuccessfulTerminalIdleContext(
  input: StaleRunContextInput,
): boolean {
  if (isAgentRunActive(input.mutex)) return false;
  if (input.mutex.buildRunning || input.mutex.pipelineRunning) return false;
  if (input.planApplySession != null) return false;

  if (input.aiPlanStatus === "error") return false;
  if (Boolean(input.buildError?.trim())) return false;
  if (Boolean(input.planApplyError?.trim())) return false;
  if (Boolean(input.pipelineError?.trim())) return false;
  if (input.followUpEscalation != null) return false;
  if (input.greenfieldRun.failureReport != null) return false;

  const result = input.greenfieldRun.runResult;
  return (
    result === "success" ||
    result === "cancelled" ||
    result === "aborted" ||
    result === "interrupted"
  );
}

/** Leftover workspace state that could conflict with a new run (failed/abandoned/incomplete). */
export function hasAbandonedRunArtifacts(input: StaleRunContextInput): boolean {
  return (
    input.plan != null ||
    input.aiPlan != null ||
    input.planApplySession != null ||
    input.aiPlanStatus === "error" ||
    Boolean(input.buildError?.trim()) ||
    Boolean(input.planApplyError?.trim()) ||
    Boolean(input.pipelineError?.trim()) ||
    input.verification != null ||
    input.builderSession != null ||
    input.executionSession != null ||
    input.followUpEscalation != null ||
    isTerminalRunResult(input.greenfieldRun.runResult) ||
    input.greenfieldRun.failureReport != null
  );
}

export function hasStaleRunContext(input: StaleRunContextInput): boolean {
  if (isAgentRunActive(input.mutex)) return false;
  if (isSuccessfulTerminalIdleContext(input)) return false;
  return hasAbandonedRunArtifacts(input);
}

/** How a leftover field should be treated before a new prompt. */
export type StaleRunArtifactClass =
  | "active_work"
  | "recoverable_pending"
  | "obsolete_diagnostic";

export type StaleRunArtifactField =
  | "plan"
  | "aiPlan"
  | "aiPlanStatus"
  | "planApplySession"
  | "buildError"
  | "planApplyError"
  | "pipelineError"
  | "verification"
  | "builderSession"
  | "executionSession"
  | "followUpEscalation"
  | "greenfieldRun"
  | "mutex";

const ACTIVE_APPLY_PHASES = new Set(["proposing", "applying", "verifying"]);

function classifyPresence(
  present: boolean,
  whenPresent: StaleRunArtifactClass,
): StaleRunArtifactClass {
  return present ? whenPresent : "obsolete_diagnostic";
}

/**
 * Classify every field `hasStaleRunContext` considers.
 * `obsolete_diagnostic` may be cleared only after proven undo/cancel recovery.
 */
export function classifyStaleRunArtifacts(
  input: StaleRunContextInput,
): Record<StaleRunArtifactField, StaleRunArtifactClass> {
  const mutexActive = isAgentRunActive(input.mutex);
  const phase = input.planApplySession?.phase ?? null;
  const applyActive = Boolean(phase && ACTIVE_APPLY_PHASES.has(phase));
  const pendingReview = phase === "waiting_for_review" || phase === "review";

  const sessionClass: StaleRunArtifactClass = applyActive
    ? "active_work"
    : pendingReview
      ? "recoverable_pending"
      : "obsolete_diagnostic";

  const leftoverClass: StaleRunArtifactClass = mutexActive
    ? "active_work"
    : pendingReview
      ? "recoverable_pending"
      : "obsolete_diagnostic";

  return {
    mutex: mutexActive ? "active_work" : "obsolete_diagnostic",
    planApplySession: input.planApplySession != null ? sessionClass : "obsolete_diagnostic",
    plan: classifyPresence(input.plan != null, leftoverClass),
    aiPlan: classifyPresence(input.aiPlan != null, leftoverClass),
    aiPlanStatus:
      input.aiPlanStatus === "running"
        ? "active_work"
        : leftoverClass,
    buildError: classifyPresence(Boolean(input.buildError?.trim()), leftoverClass),
    planApplyError: classifyPresence(Boolean(input.planApplyError?.trim()), leftoverClass),
    pipelineError: classifyPresence(Boolean(input.pipelineError?.trim()), leftoverClass),
    verification: classifyPresence(input.verification != null, leftoverClass),
    builderSession: classifyPresence(input.builderSession != null, leftoverClass),
    executionSession: classifyPresence(input.executionSession != null, leftoverClass),
    followUpEscalation: classifyPresence(input.followUpEscalation != null, leftoverClass),
    greenfieldRun: mutexActive
      ? "active_work"
      : pendingReview
        ? "recoverable_pending"
        : "obsolete_diagnostic",
  };
}

export type ObsoleteRunRecoveryKind = "successful_undo" | "cancel_unapplied";

export const UNDO_AFTER_VERIFY_FAILURE_MESSAGE =
  "Apply failed verification and was undone.";
export const CANCEL_UNAPPLIED_REVIEW_MESSAGE =
  "Review cancelled before any files were written.";

export interface RecoveredStaleRunState {
  readonly plan: null;
  readonly aiPlan: null;
  readonly aiPlanStatus: "idle";
  readonly planApplySession: null;
  readonly buildError: null;
  readonly planApplyError: null;
  readonly pipelineError: null;
  readonly verification: null;
  readonly builderSession: null;
  readonly executionSession: null;
  readonly followUpEscalation: null;
  readonly greenfieldRunPatch: Partial<GreenfieldRunSnapshot>;
  readonly applyPlanActiveRunId: null;
  readonly applyPlanCompletedRunId: null;
}

export type ObsoleteRunRecoveryResult =
  | { readonly ok: true; readonly next: RecoveredStaleRunState }
  | { readonly ok: false; readonly reason: string; readonly retainStaleProtection: true };

export interface RecoverObsoleteRunArtifactsInput {
  readonly context: StaleRunContextInput;
  readonly kind: ObsoleteRunRecoveryKind;
  readonly recoveredRunId: string | null;
  readonly ownedRunId: string | null;
}

export function ownedApplyRunId(
  activeRunId: string | null,
  completedRunId: string | null,
): string | null {
  return activeRunId ?? completedRunId;
}

export function recoveredGreenfieldPatch(
  prev: GreenfieldRunSnapshot,
  message: string,
): Partial<GreenfieldRunSnapshot> {
  const settleFailedOrRunning =
    prev.runResult === "failed" || prev.runResult === "running";
  return {
    failureReport: null,
    verification: null,
    writeError: null,
    appliedFileDiffs: [],
    filesWritten: [],
    runResult: settleFailedOrRunning ? "idle" : prev.runResult,
    latestAction: {
      status: "success",
      summary: message,
      stage: "apply_plan",
      at: new Date().toISOString(),
    },
  };
}

/**
 * Single state transition that clears obsolete artifacts after a proven recovery.
 * Refuses when a run is active, a review is still pending (unless cancelling it),
 * undo was not fully successful, or the recovered run does not own current artifacts.
 */
export function recoverObsoleteRunArtifacts(
  input: RecoverObsoleteRunArtifactsInput,
): ObsoleteRunRecoveryResult {
  const { context, kind, recoveredRunId, ownedRunId } = input;
  if (!recoveredRunId?.trim() || !ownedRunId?.trim()) {
    return {
      ok: false,
      reason: "Recovery refused — missing run ownership.",
      retainStaleProtection: true,
    };
  }
  if (recoveredRunId !== ownedRunId) {
    return {
      ok: false,
      reason: "Recovery refused — run ownership does not match.",
      retainStaleProtection: true,
    };
  }

  const classified = classifyStaleRunArtifacts(context);
  if (classified.mutex === "active_work") {
    return {
      ok: false,
      reason: "Recovery refused — a run is still active.",
      retainStaleProtection: true,
    };
  }

  const pendingReview =
    classified.planApplySession === "recoverable_pending";
  if (pendingReview && kind !== "cancel_unapplied") {
    return {
      ok: false,
      reason: "Recovery refused — a review is still pending.",
      retainStaleProtection: true,
    };
  }
  if (classified.planApplySession === "active_work") {
    return {
      ok: false,
      reason: "Recovery refused — apply is still in progress.",
      retainStaleProtection: true,
    };
  }

  const message =
    kind === "successful_undo"
      ? UNDO_AFTER_VERIFY_FAILURE_MESSAGE
      : CANCEL_UNAPPLIED_REVIEW_MESSAGE;

  return {
    ok: true,
    next: {
      plan: null,
      aiPlan: null,
      aiPlanStatus: "idle",
      planApplySession: null,
      buildError: null,
      planApplyError: null,
      pipelineError: null,
      verification: null,
      builderSession: null,
      executionSession: null,
      followUpEscalation: null,
      greenfieldRunPatch: recoveredGreenfieldPatch(context.greenfieldRun, message),
      applyPlanActiveRunId: null,
      applyPlanCompletedRunId: null,
    },
  };
}

export function applyObsoleteRunRecoveryToContext(
  input: StaleRunContextInput,
  next: RecoveredStaleRunState,
): StaleRunContextInput {
  const greenfieldRun = {
    ...input.greenfieldRun,
    ...next.greenfieldRunPatch,
  };
  return {
    plan: next.plan,
    aiPlan: next.aiPlan,
    aiPlanStatus: next.aiPlanStatus,
    planApplySession: next.planApplySession,
    buildError: next.buildError,
    planApplyError: next.planApplyError,
    pipelineError: next.pipelineError,
    verification: next.verification,
    builderSession: next.builderSession,
    executionSession: next.executionSession,
    followUpEscalation: next.followUpEscalation,
    greenfieldRun,
    mutex: {
      ...input.mutex,
      greenfieldRun,
      greenfieldPanelActive: false,
      buildRunning: false,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplyPhase: null,
      autoFixPhase: null,
    },
  };
}

export function hashPrompt(prompt: string): string {
  const text = prompt.trim();
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function promptPreview(prompt: string, max = 120): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export interface RunSubmitDebugContext {
  readonly prompt: string;
  readonly runId: string | null;
  readonly previousRunId: string | null;
  readonly route: string | null;
  readonly provider: string | null;
  readonly model: string | null;
}

export function logRunSubmitDebug(context: RunSubmitDebugContext): void {
  console.info(
    [
      "[agent:submit:debug]",
      `prompt="${promptPreview(context.prompt)}"`,
      `hash=${hashPrompt(context.prompt)}`,
      context.runId ? `runId=${context.runId}` : null,
      context.previousRunId ? `previousRunId=${context.previousRunId}` : null,
      context.route ? `route=${context.route}` : null,
      context.provider ? `provider=${context.provider}` : null,
      context.model ? `model=${context.model}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

export function greenfieldFailureReport(
  run: GreenfieldRunSnapshot,
): StudioFailureReport | null {
  return run.failureReport ?? null;
}
