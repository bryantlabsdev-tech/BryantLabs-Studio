import { failRunTimeline } from "@/core/agent/runTimeline";
import type { RunLogStage } from "@/core/greenfield/runLog";
import {
  finalizeDanglingRunningLogEntries,
  type GreenfieldRunSnapshot,
} from "@/core/greenfield/runState";

export type GreenfieldRunUpdate =
  | Partial<GreenfieldRunSnapshot>
  | ((prev: GreenfieldRunSnapshot) => Partial<GreenfieldRunSnapshot>);

export function buildFollowUpRunFailurePatch(
  prev: GreenfieldRunSnapshot,
  message: string,
): Partial<GreenfieldRunSnapshot> {
  const endedAt = Date.now();
  const trimmed = message.trim();
  const workflowErrors = prev.workflow?.errors?.filter((e) => e?.trim()) ?? [];
  const errors =
    trimmed && !workflowErrors.includes(trimmed)
      ? [...workflowErrors, trimmed]
      : workflowErrors;

  return {
    runResult: "failed",
    finalMessage: trimmed || prev.finalMessage,
    endedAt,
    durationMs:
      prev.runStartedAt != null ? Math.max(0, endedAt - prev.runStartedAt) : null,
    entries: finalizeDanglingRunningLogEntries(prev.entries, trimmed, prev.runStartedAt),
    workflow: {
      ...(prev.workflow ?? {}),
      errors,
    },
  };
}

export interface FollowUpRunFailureHost {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly updateGreenfieldRun: (patch: GreenfieldRunUpdate) => void;
  readonly appendGreenfieldRunLog: (
    stage: RunLogStage,
    status: "failed",
    message: string,
    details?: string,
  ) => void;
  readonly recordFollowUpFailureMessage?: (text: string) => void;
}

export function recordFollowUpRunFailure(
  host: FollowUpRunFailureHost,
  message: string,
  stage: RunLogStage = "pipeline",
  details?: string,
): void {
  const trimmed = message.trim();
  if (!trimmed) return;

  host.updateGreenfieldRun((prev) => buildFollowUpRunFailurePatch(prev, trimmed));
  host.appendGreenfieldRunLog(stage, "failed", trimmed, details);
  failRunTimeline(trimmed);
  host.recordFollowUpFailureMessage?.(trimmed);
}
