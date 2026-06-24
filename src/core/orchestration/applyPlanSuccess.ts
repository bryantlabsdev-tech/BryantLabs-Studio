import {
  appendAgentFeed,
  mergeAgentArtifacts,
  setAgentStatus,
  setTimelineStage,
} from "@/core/agentWorkspace/store";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace/types";
import { setTaskStatus } from "@/core/agentLoop/planner";
import type { AgentLoopSession } from "@/core/agentLoop/types";
import { refreshSessionDiagnostics } from "@/core/execution/diagnostics";
import type { ExecutionSession } from "@/core/execution/types";
import { BRYANTLABS_AGENT_DISPLAY_NAME } from "@/core/studioRun/types";

export interface ApplyPlanSuccessOutcome {
  readonly prompt: string;
  readonly filesWritten: readonly string[];
  readonly typecheckPassed: boolean;
  readonly buildPassed: boolean;
  readonly previewOk: boolean;
}

export function isApplyPlanOrchestrationComplete(
  outcome: ApplyPlanSuccessOutcome,
): boolean {
  return (
    outcome.filesWritten.length > 0 &&
    outcome.typecheckPassed &&
    outcome.buildPassed
  );
}

export function buildApplyPlanSuccessSummary(
  outcome: ApplyPlanSuccessOutcome,
): string {
  const files =
    outcome.filesWritten.length > 0
      ? outcome.filesWritten.join(", ")
      : "(none)";
  return [
    `Apply Plan completed for: ${outcome.prompt}`,
    `Files written: ${files}`,
    `TypeScript: ${outcome.typecheckPassed ? "passed" : "failed"}`,
    `Build: ${outcome.buildPassed ? "passed" : "failed"}`,
    `Preview: ${outcome.previewOk ? "success" : "skipped or failed"}`,
  ].join(" · ");
}

/** Latest-action detail block for the run log / summary UI. */
export function formatApplyPlanSuccessLatestAction(
  outcome: ApplyPlanSuccessOutcome,
): { readonly summary: string; readonly detail: string } {
  const files =
    outcome.filesWritten.length > 0
      ? outcome.filesWritten.join(", ")
      : "(none)";
  return {
    summary: "Apply Plan completed",
    detail: [
      "Action: Apply Plan",
      "Status: success",
      `Files written: ${files}`,
      `TypeScript: ${outcome.typecheckPassed ? "passed" : "failed"}`,
      `Build: ${outcome.buildPassed ? "passed" : "failed"}`,
      `Preview: ${outcome.previewOk ? "success" : "skipped"}`,
    ].join("\n"),
  };
}

export function isNoOpExecutionError(error: string | undefined | null): boolean {
  if (!error?.trim()) return false;
  return /produces no changes|no changes produced|identical content|patch produces no changes/i.test(
    error,
  );
}

/** Track repeated no-op failures per execution step (step id → count). */
export function recordNoChangeFailure(
  guard: Map<string, number>,
  stepId: string,
): number {
  const next = (guard.get(stepId) ?? 0) + 1;
  guard.set(stepId, next);
  return next;
}

export function shouldStopNoChangeRetry(
  guard: Map<string, number>,
  stepId: string,
): boolean {
  return (guard.get(stepId) ?? 0) >= 2;
}

export function executionSessionAfterApplyPlanSuccess(
  session: ExecutionSession,
  filesWritten: readonly string[],
): ExecutionSession {
  const written = new Set(filesWritten);
  const files = session.files.map((f) => {
    if (!written.has(f.relPath)) return f;
    const { error: _e, ...rest } = f;
    return { ...rest, status: "applied" as const };
  });
  const steps = session.steps.map((s) => {
    const { error: _e, ...rest } = s;
    return { ...rest, status: "completed" as const };
  });
  const next: ExecutionSession = {
    ...session,
    phase: "done",
    pausedAtStepId: null,
    currentStepId: null,
    applyError: null,
    files,
    steps,
  };
  return { ...next, diagnostics: refreshSessionDiagnostics(next) };
}

export function completeExecutionStepAsNoOp(
  session: ExecutionSession,
  stepId: string,
  note: string,
): ExecutionSession {
  const steps = session.steps.map((s) => {
    if (s.id !== stepId) return s;
    const { error: _e, ...rest } = s;
    return { ...rest, status: "completed" as const };
  });
  const step = session.steps.find((s) => s.id === stepId);
  const paths = new Set(step?.filePaths ?? []);
  const files = session.files.map((f) => {
    if (
      !paths.has(f.relPath) ||
      f.status === "applied" ||
      f.status === "verified"
    ) {
      return f;
    }
    return { ...f, status: "applied" as const, error: note };
  });
  const next: ExecutionSession = {
    ...session,
    steps,
    files,
    applyError: null,
  };
  return { ...next, diagnostics: refreshSessionDiagnostics(next) };
}

export function agentLoopSessionAfterApplyPlanSuccess(
  session: AgentLoopSession,
  outcome: ApplyPlanSuccessOutcome,
): AgentLoopSession {
  const summary = buildApplyPlanSuccessSummary(outcome);
  let tasks = setTaskStatus(session.dynamicTasks, "Plan", "done");
  tasks = setTaskStatus(tasks, "Apply", "done");
  tasks = setTaskStatus(tasks, "Verify", "done");
  return {
    ...session,
    status: "completed",
    pendingApproval: null,
    dynamicTasks: tasks,
    flags: {
      ...session.flags,
      planCreated: true,
      executionDone: true,
      lastVerificationOk: true,
      completionSummary: summary,
    },
  };
}

export function agentWorkspaceAfterApplyPlanSuccess(
  session: AgentWorkspaceSession,
  outcome: ApplyPlanSuccessOutcome,
): AgentWorkspaceSession {
  const summary = buildApplyPlanSuccessSummary(outcome);
  let n = setAgentStatus(session, "completed");
  n = setTimelineStage(n, "plan", "done");
  n = setTimelineStage(n, "execution", "done");
  n = setTimelineStage(n, "verification", "done");
  n = setTimelineStage(n, "repair", "done");
  n = setTimelineStage(n, "complete", "done");
  n = appendAgentFeed(
    n,
    "completed",
    `${BRYANTLABS_AGENT_DISPLAY_NAME}: completed`,
    summary,
  );
  n = mergeAgentArtifacts(n, {
    filesModified: [...outcome.filesWritten],
    verificationResults: [
      outcome.typecheckPassed ? "TypeScript passed" : "TypeScript failed",
      outcome.buildPassed ? "Build passed" : "Build failed",
      outcome.previewOk ? "Preview started" : "Preview skipped",
    ],
  });
  return n;
}
