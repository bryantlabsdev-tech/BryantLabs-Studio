import {
  applyFinishStudioRunPatch,
  PROVIDER_HEALTH_ACTIONS,
} from "@/app/orchestration/studioActionGuards";
import type { StudioActionOrchestrationHost } from "@/app/orchestration/studioActionTypes";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { StudioActionType } from "@/core/studioRun/types";

export function beginStudioActionOrchestration(
  host: StudioActionOrchestrationHost | null,
  actionType: StudioActionType,
  stage: GreenfieldRunLogEntry["stage"],
  message: string,
  opts?: {
    details?: string;
    patch?: Partial<GreenfieldRunSnapshot>;
  },
): void {
  if (!host) return;
  host.updateGreenfieldRun({
    actionType,
    projectPath: host.projectPath,
    targetFolder: host.projectPath,
    runStartedAt: Date.now(),
    runResult: "running",
    endedAt: null,
    durationMs: null,
    failureReport: null,
    finalMessage: null,
    previousSuccessfulRunMessage:
      host.greenfieldRun.runResult === "success" && host.greenfieldRun.finalMessage
        ? host.greenfieldRun.finalMessage
        : host.greenfieldRun.previousSuccessfulRunMessage,
    ...opts?.patch,
  });
  if (!host.pipelineRunActiveRef.current) {
    host.resetAiCallTracker();
  }
  host.appendGreenfieldRunLog(stage, "running", message, opts?.details);
  if (PROVIDER_HEALTH_ACTIONS.has(actionType)) {
    void host.refreshProviderStatus({ logToRun: true });
  }
}

export function finishStudioActionOrchestration(
  host: StudioActionOrchestrationHost | null,
  actionType: StudioActionType,
  stage: GreenfieldRunLogEntry["stage"],
  ok: boolean,
  message: string,
  opts?: {
    details?: string;
    patch?: Partial<GreenfieldRunSnapshot>;
  },
): void {
  if (!host) return;
  const status = ok ? "success" : "failed";
  host.appendGreenfieldRunLog(stage, status, message, opts?.details);
  host.setGreenfieldRun((prev) => {
    const next = applyFinishStudioRunPatch(
      prev,
      actionType,
      ok,
      message,
      stage,
      opts,
    );
    host.persistAnalyticsRecord(next, ok, message, opts?.details);
    if (ok) {
      host.offerMemoryCandidatesFromRun(
        next,
        ok,
        next.workflow?.prompt ?? undefined,
        next.provider,
        next.model,
      );
    }
    return next;
  });
}
