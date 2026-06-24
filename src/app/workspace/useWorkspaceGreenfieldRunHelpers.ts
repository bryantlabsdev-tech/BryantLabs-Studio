import { useCallback, useEffect } from "react";
import { bindRunTimelinePersistence } from "@/core/agent/runTimeline";
import {
  appendGreenfieldRunEntry,
  type GreenfieldRunSnapshot,
} from "@/core/greenfield/runState";
import type {
  GreenfieldRunLogEntry,
  RunLogEntryOptions,
} from "@/core/greenfield/runLog";
import { studioEventBus } from "@/core/console/studioEventBus";
import {
  configureGreenfieldCallReservations,
  configureMultiPhaseGreenfieldCallReservations,
} from "@/core/providers/greenfieldCallBudget";
import type { ProviderSettings } from "@/core/providers/types";
import type { AiCallGatePurpose } from "@/core/providers/costControls";
import type { AgentStage } from "@/core/providers/orchestration";
import {
  cancelGreenfieldRunPatch,
  reconcileStaleGreenfieldRun,
} from "@/core/agent/greenfieldRunLifecycle";
import { emitGreenfieldConsoleEvent } from "@/core/console/greenfieldConsoleEvents";
import type { CenterTab } from "@/core/layout/types";
import type { OrchestrationHostRefs } from "@/app/workspace/useOrchestrationHostRefs";

export function useWorkspaceGreenfieldRunHelpers(input: {
  readonly projectPath: string | undefined;
  readonly agentGreenfieldPanelActive: boolean;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly setGreenfieldRun: React.Dispatch<React.SetStateAction<GreenfieldRunSnapshot>>;
  readonly setCenterTab: React.Dispatch<React.SetStateAction<CenterTab>>;
  readonly setAgentGreenfieldPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  readonly greenfieldRunControlRef: React.MutableRefObject<{
    cancel: () => void;
    runRepair?: () => Promise<void>;
  } | null>;
  readonly providerInvokeHostRef: OrchestrationHostRefs["providerInvokeHostRef"];
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly persistAnalyticsRecord: (
    run: GreenfieldRunSnapshot,
    ok: boolean,
    message: string,
    details?: string,
  ) => void;
  readonly recordAgentActivityMessage: (text: string) => void;
}) {
  useEffect(() => {
    bindRunTimelinePersistence((timeline) => {
      input.updateGreenfieldRun({ runTimeline: timeline });
    });
    return () => bindRunTimelinePersistence(null);
  }, [input.updateGreenfieldRun]);

  const appendGreenfieldRunLog = useCallback(
    (
      stage: GreenfieldRunLogEntry["stage"],
      status: GreenfieldRunLogEntry["status"],
      message: string,
      detailsOrOpts?: string | RunLogEntryOptions,
    ) => {
      input.setGreenfieldRun((prev) => {
        const next = appendGreenfieldRunEntry(prev, stage, status, message, detailsOrOpts);
        if (
          status === "failed" &&
          prev.actionType === "greenfield" &&
          !input.agentGreenfieldPanelActive
        ) {
          input.setCenterTab("studioLog");
        }
        const details =
          typeof detailsOrOpts === "string"
            ? detailsOrOpts
            : detailsOrOpts?.details;
        studioEventBus.emit({
          type: "run.log",
          timestamp: Date.now(),
          projectPath: next.projectPath ?? input.projectPath ?? null,
          runId: "",
          stage,
          status,
          message,
          ...(details ? { details } : {}),
          provider: next.provider,
          model: next.model,
        });
        return next;
      });
    },
    [input],
  );

  const prepareGreenfieldCallBudget = useCallback((settings: ProviderSettings) => {
    const host = input.providerInvokeHostRef.current;
    if (!host) return;
    configureGreenfieldCallReservations(host.aiCallTrackerRef.current, settings);
  }, [input.providerInvokeHostRef]);

  const prepareMultiPhaseGreenfieldCallBudget = useCallback(
    (settings: ProviderSettings, pageCount?: number) => {
      const host = input.providerInvokeHostRef.current;
      if (!host) return;
      configureMultiPhaseGreenfieldCallReservations(
        host.aiCallTrackerRef.current,
        settings,
        pageCount,
      );
    },
    [input.providerInvokeHostRef],
  );

  const canMakeAiCall = useCallback(
    (settings: ProviderSettings, purpose: AiCallGatePurpose, stage?: AgentStage) => {
      const host = input.providerInvokeHostRef.current;
      if (!host) return { ok: true as const };
      const gate = host.aiCallTrackerRef.current.canMakeCall(settings, {
        purpose,
        ...(stage ? { stage } : {}),
      });
      return gate.ok ? ({ ok: true as const }) : { ok: false as const, reason: gate.reason };
    },
    [input.providerInvokeHostRef],
  );

  useEffect(() => {
    if (input.greenfieldRun.actionType !== "greenfield") return;
    if (
      input.greenfieldRun.runResult !== "success" &&
      input.greenfieldRun.runResult !== "failed"
    ) {
      return;
    }
    if (!input.greenfieldRun.runStartedAt) return;
    const message =
      input.greenfieldRun.latestAction?.summary ??
      (input.greenfieldRun.runResult === "success"
        ? "New App completed"
        : "New App failed");
    input.persistAnalyticsRecord(
      input.greenfieldRun,
      input.greenfieldRun.runResult === "success",
      message,
      input.greenfieldRun.latestAction?.detail ?? undefined,
    );
  }, [
    input.greenfieldRun.actionType,
    input.greenfieldRun.runResult,
    input.greenfieldRun.runStartedAt,
    input.greenfieldRun.latestAction,
    input.persistAnalyticsRecord,
  ]);

  const registerGreenfieldRunControl = useCallback(
    (control: { cancel: () => void; runRepair?: () => Promise<void> } | null) => {
      input.greenfieldRunControlRef.current = control;
    },
    [input.greenfieldRunControlRef],
  );

  const cancelGreenfieldRun = useCallback(() => {
    input.greenfieldRunControlRef.current?.cancel();
    input.setGreenfieldRun((prev) => {
      emitGreenfieldConsoleEvent("greenfield:cancelled", {
        projectPath: input.projectPath ?? prev.targetFolder ?? null,
        provider: prev.provider,
        model: prev.model,
      });
      return { ...prev, ...cancelGreenfieldRunPatch(prev) };
    });
    input.setAgentGreenfieldPanelActive(false);
    input.recordAgentActivityMessage("Run cancelled. You can try again.");
  }, [input]);

  const triggerGreenfieldRepair = useCallback(async () => {
    await input.greenfieldRunControlRef.current?.runRepair?.();
  }, [input.greenfieldRunControlRef]);

  useEffect(() => {
    input.setGreenfieldRun((prev) => {
      const patch = reconcileStaleGreenfieldRun(prev);
      if (!patch) return prev;
      emitGreenfieldConsoleEvent("greenfield:stale-cleared", {
        projectPath: input.projectPath ?? prev.targetFolder ?? null,
        provider: prev.provider,
        model: prev.model,
        message: "Stale greenfield run cleared — you can try again.",
      });
      return { ...prev, ...patch };
    });
  }, [input.projectPath, input.setGreenfieldRun]);

  return {
    appendGreenfieldRunLog,
    prepareGreenfieldCallBudget,
    prepareMultiPhaseGreenfieldCallBudget,
    canMakeAiCall,
    registerGreenfieldRunControl,
    cancelGreenfieldRun,
    triggerGreenfieldRepair,
  };
}
