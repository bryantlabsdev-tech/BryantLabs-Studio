import type { AgentRunOverallStatus } from "@/core/agent/agentRunCard";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { RunFinalStatus } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

/**
 * Migration notes (stored run history + analytics):
 * - v1 artifacts used runResult "failed" + cancel summary; normalizeStoredOutcome reclassifies to "cancelled".
 * - Stale mutex clears now persist runResult "interrupted" (was "failed").
 * - Provider/timeouts persist runResult "aborted" when message matches AbortError patterns.
 * - Analytics failedRuns counts only status "failed"; cancelled/aborted/interrupted are excluded.
 */
export type RunOutcome =
  | "success"
  | "incomplete"
  | "failed"
  | "cancelled"
  | "aborted"
  | "interrupted";

export const RUN_OUTCOMES: readonly RunOutcome[] = [
  "success",
  "incomplete",
  "failed",
  "cancelled",
  "aborted",
  "interrupted",
];

const EXPLICIT_TERMINAL_RUN_RESULTS: ReadonlySet<RunFinalStatus> = new Set([
  "success",
  "failed",
  "cancelled",
  "aborted",
  "interrupted",
]);

const CANCEL_SUMMARY_RE =
  /run cancelled(?: by user)?|cancelled by user/i;
const INTERRUPT_SUMMARY_RE =
  /stale greenfield run cleared|interrupted while active|run interrupted/i;
const ABORT_TEXT_RE =
  /AbortError|operation was aborted|this operation was aborted|\baborted\b/i;

export function isRunFailureOutcome(outcome: RunOutcome): boolean {
  return outcome === "failed";
}

export function isRunNeutralOutcome(outcome: RunOutcome): boolean {
  return outcome === "cancelled" || outcome === "aborted" || outcome === "interrupted";
}

export function isTerminalRunResult(runResult: RunFinalStatus): boolean {
  return EXPLICIT_TERMINAL_RUN_RESULTS.has(runResult);
}

export function runResultFromOutcome(outcome: RunOutcome): RunFinalStatus {
  if (outcome === "incomplete") return "success";
  return outcome;
}

export function outcomeLabel(outcome: RunOutcome): string {
  switch (outcome) {
    case "success":
      return "Complete";
    case "incomplete":
      return "Incomplete";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "aborted":
      return "Aborted";
    case "interrupted":
      return "Interrupted";
    default:
      return "Unknown";
  }
}

export function overallStatusLabel(status: AgentRunOverallStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "incomplete":
      return "Incomplete";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "aborted":
      return "Aborted";
    case "interrupted":
      return "Interrupted";
    default:
      return "Unknown";
  }
}

export function outcomeToOverallStatus(outcome: RunOutcome): AgentRunOverallStatus {
  switch (outcome) {
    case "success":
      return "complete";
    case "incomplete":
      return "incomplete";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "aborted":
      return "aborted";
    case "interrupted":
      return "interrupted";
    default:
      return "failed";
  }
}

export function overallStatusCssSuffix(
  status: AgentRunOverallStatus,
): AgentRunOverallStatus | "running" {
  return status;
}

function isCancelText(text: string | null | undefined): boolean {
  return Boolean(text && CANCEL_SUMMARY_RE.test(text));
}

function isInterruptText(text: string | null | undefined): boolean {
  return Boolean(text && INTERRUPT_SUMMARY_RE.test(text));
}

function isAbortText(text: string | null | undefined): boolean {
  return Boolean(text && ABORT_TEXT_RE.test(text));
}

function isLikelyActiveRun(run: GreenfieldRunSnapshot): boolean {
  if (run.genStatus === "running") return true;
  if (run.writeStatus === "writing") return true;
  if (
    run.setupStatus === "running" ||
    run.setupStatus === "repairing" ||
    run.setupStatus === "repair_needed"
  ) {
    return true;
  }
  if (run.runResult !== "running") return false;
  return run.entries.some(
    (entry) =>
      entry.status === "running" &&
      !(entry.stage === "generation" && run.genStatus === "done"),
  );
}

function outcomeFromLatestAction(
  action: GreenfieldRunSnapshot["latestAction"],
): RunOutcome | null {
  if (!action) return null;
  if (action.status === "success") return "success";
  if (isCancelText(action.summary) || isCancelText(action.detail)) return "cancelled";
  if (isInterruptText(action.summary) || isInterruptText(action.detail)) {
    return "interrupted";
  }
  if (isAbortText(action.summary) || isAbortText(action.detail)) return "aborted";
  if (action.status === "failed") return "failed";
  return null;
}

export function resolveFailureRunResult(
  message: string,
  detail?: string | null,
): Extract<RunOutcome, "failed" | "aborted"> {
  const text = `${message} ${detail ?? ""}`;
  return isAbortText(text) ? "aborted" : "failed";
}

/** Resolve terminal outcome from a live or historical greenfield snapshot. */
export function inferOutcomeFromSnapshot(run: GreenfieldRunSnapshot): RunOutcome | null {
  if (
    run.runResult === "cancelled" ||
    run.runResult === "aborted" ||
    run.runResult === "interrupted" ||
    run.runResult === "success" ||
    run.runResult === "failed"
  ) {
    if (run.runResult === "failed") {
      if (isCancelText(run.finalMessage) || isCancelText(run.latestAction?.summary)) {
        return "cancelled";
      }
      if (isInterruptText(run.finalMessage) || isInterruptText(run.latestAction?.summary)) {
        return "interrupted";
      }
      if (
        isAbortText(run.finalMessage) ||
        isAbortText(run.latestAction?.summary) ||
        isAbortText(run.latestAction?.detail)
      ) {
        return "aborted";
      }
      return "failed";
    }
    if (run.runResult === "success") return "success";
    return run.runResult;
  }

  if (run.latestAction && isCancelText(run.latestAction.summary)) {
    return "cancelled";
  }

  if (run.runResult === "running") {
    return null;
  }

  const timeline = run.runTimeline;
  if (
    timeline &&
    timeline.status === "running" &&
    !timeline.stages.some((stage) => stage.stage === "run_complete")
  ) {
    return null;
  }

  if (timeline?.status === "complete") return "success";
  if (timeline?.status === "failed") return "failed";
  if (timeline?.stages.some((stage) => stage.stage === "run_complete")) {
    return timeline.failureDetail ? "failed" : "success";
  }

  if (run.failureReport && !isLikelyActiveRun(run)) return "failed";

  if (isLikelyActiveRun(run)) return null;

  if (run.latestAction?.status === "success" || run.latestAction?.status === "failed") {
    const fromAction = outcomeFromLatestAction(run.latestAction);
    if (fromAction) return fromAction;
  }

  if (run.endedAt != null && run.runResult !== "idle") {
    return run.runResult === "success" ? "success" : "failed";
  }

  return null;
}

export function normalizeOutcomeToken(value: string): RunOutcome | null {
  const token = value.trim().toLowerCase();
  if (token === "complete") return "success";
  if (RUN_OUTCOMES.includes(token as RunOutcome)) return token as RunOutcome;
  return null;
}

export function normalizeStoredOutcome(
  outcome: RunOutcome | "success" | "failed" | "cancelled" | string,
  artifact?: Pick<AgentRunArtifact, "card" | "logEntries">,
): RunOutcome {
  if (RUN_OUTCOMES.includes(outcome as RunOutcome)) {
    const typed = outcome as RunOutcome;
    if (typed !== "failed") return typed;
  }

  const summary =
    artifact?.card.summary ??
    artifact?.card.failureDiagnosis?.reason ??
    artifact?.logEntries?.at(-1)?.message ??
    null;

  if (isCancelText(summary) || artifact?.card.overallStatus === "cancelled") {
    return "cancelled";
  }
  if (isInterruptText(summary) || artifact?.card.overallStatus === "interrupted") {
    return "interrupted";
  }
  if (isAbortText(summary) || artifact?.card.overallStatus === "aborted") {
    return "aborted";
  }

  if (outcome === "success" || artifact?.card.overallStatus === "complete") {
    return "success";
  }

  return "failed";
}
