import { useCallback } from "react";
import {
  beginStudioActionOrchestration,
  finishStudioActionOrchestration,
  publishFailureReportOrchestration,
} from "@/app/orchestration";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type {
  GreenfieldRunLogEntry,
} from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { StudioActionType } from "@/core/studioRun/types";
import { studioEventBus } from "@/core/console/studioEventBus";
import { setLastRoutingIntent } from "@/app/workspace/routingIntentStore";
import type { OrchestrationHostRefs } from "@/app/workspace/useOrchestrationHostRefs";

export function useWorkspaceStudioActions(input: {
  readonly orchestrationRefs: Pick<
    OrchestrationHostRefs,
    "studioActionHostRef" | "failureReportHostRef"
  >;
  readonly projectPath: string | undefined;
  readonly settleRunCheckpoint: () => void;
}) {
  const { studioActionHostRef, failureReportHostRef } = input.orchestrationRefs;

  const publishFailureReport = useCallback(
    (report: StudioFailureReport) => {
      publishFailureReportOrchestration(failureReportHostRef.current, report);
      studioEventBus.emit({
        type: "failure.reported",
        timestamp: Date.now(),
        projectPath: input.projectPath ?? null,
        report,
      });
    },
    [failureReportHostRef, input.projectPath],
  );

  const beginStudioAction = useCallback(
    (
      actionType: StudioActionType,
      stage: GreenfieldRunLogEntry["stage"],
      message: string,
      opts?: {
        details?: string;
        patch?: Partial<GreenfieldRunSnapshot>;
      },
    ) => {
      beginStudioActionOrchestration(
        studioActionHostRef.current,
        actionType,
        stage,
        message,
        opts,
      );
      setLastRoutingIntent(opts?.patch?.workflow?.routingIntent);
    },
    [studioActionHostRef],
  );

  const finishStudioAction = useCallback(
    (
      actionType: StudioActionType,
      stage: GreenfieldRunLogEntry["stage"],
      ok: boolean,
      message: string,
      opts?: {
        details?: string;
        patch?: Partial<GreenfieldRunSnapshot>;
      },
    ) => {
      finishStudioActionOrchestration(
        studioActionHostRef.current,
        actionType,
        stage,
        ok,
        message,
        opts,
      );
      setLastRoutingIntent(opts?.patch?.workflow?.routingIntent);
      if (ok) {
        queueMicrotask(() => input.settleRunCheckpoint());
      }
    },
    [studioActionHostRef, input.settleRunCheckpoint],
  );

  return {
    publishFailureReport,
    beginStudioAction,
    finishStudioAction,
  };
}
