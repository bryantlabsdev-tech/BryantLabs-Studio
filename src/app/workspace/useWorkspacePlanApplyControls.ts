import { useCallback, useMemo } from "react";
import { createApplyPlanRunController } from "@/app/orchestration";
import {
  incompleteGreenfieldEditBlockMessage,
  shouldBlockEditForIncompleteGreenfield,
} from "@/core/agent/greenfieldRecoveryRouting";
import { NO_PENDING_CHANGES_MESSAGE } from "@/core/diagnostics/pipelineInspector";
import { resolveEffectiveProjectScan } from "@/core/agent/resolveEffectiveProjectScan";
import {
  computePlanApplyTotals,
  type PlanApplyFileDecision,
} from "@/core/planApply";
import type { Plan } from "@/core/planner";
import type { ProjectScan } from "@/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { WorkspacePlanState } from "@/app/workspace/useWorkspacePlanState";
import type { BryantLabsApi } from "@/types";
import type { ExecuteApplyPlanResult } from "@/app/orchestration";
import { discardPlanApplyShadowRun } from "@/app/orchestration/shadowStage";

export function useWorkspacePlanApplyControls(input: {
  readonly api: BryantLabsApi | null | undefined;
  readonly project: { path: string } | null;
  readonly scan: ProjectScan | null;
  readonly plan: Plan | null;
  readonly planApplySession: import("@/core/planApply").PlanApplySession | null;
  readonly planState: Pick<
    WorkspacePlanState,
    | "planRef"
    | "setPlanApplySession"
    | "setPlanApplyError"
    | "applyPlanActiveRunIdRef"
    | "applyPlanCompletedRunIdRef"
    | "applyPlanSuccessRef"
  >;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly executeApplyPlan: (opts: {
    directRewrite: boolean;
    autoContinue?: boolean;
  }) => Promise<ExecuteApplyPlanResult>;
}) {
  const cancelApplyPlan = useCallback(() => {
    void input.api?.cancelActiveProviderRequests?.();
    const runId = input.planApplySession?.applyRunId;
    void discardPlanApplyShadowRun(input.api ?? undefined, runId);
    input.planState.applyPlanActiveRunIdRef.current = null;
    input.planState.applyPlanCompletedRunIdRef.current = null;
    input.planState.setPlanApplySession(null);
    input.planState.setPlanApplyError(null);
  }, [input.api, input.planApplySession?.applyRunId, input.planState]);

  const selectPlanApplyFile = useCallback((relPath: string) => {
    input.planState.setPlanApplySession((prev) =>
      prev ? { ...prev, selectedRelPath: relPath } : prev,
    );
  }, [input.planState]);

  const setPlanApplyFileDecision = useCallback(
    (relPath: string, decision: PlanApplyFileDecision) => {
      input.planState.setPlanApplySession((prev) => {
        if (!prev) return prev;
        const files = prev.files.map((f) =>
          f.relPath === relPath ? { ...f, decision } : f,
        );
        return {
          ...prev,
          files,
          totals: computePlanApplyTotals(files),
        };
      });
    },
    [input.planState],
  );

  const setPlanApplyFilePartialContent = useCallback(
    (relPath: string, mergedAfter: string) => {
      input.planState.setPlanApplySession((prev) => {
        if (!prev) return prev;
        const files = prev.files.map((f) =>
          f.relPath === relPath ? { ...f, appliedNewContent: mergedAfter } : f,
        );
        return { ...prev, files };
      });
    },
    [input.planState],
  );

  const approveAllPlanApplyFiles = useCallback(() => {
    input.planState.setPlanApplySession((prev) => {
      if (!prev) return prev;
      const files = prev.files.map((f) =>
        f.status === "ready" && f.diffStats?.changed
          ? { ...f, decision: "approved" as const }
          : f.status === "ready"
            ? { ...f, decision: "rejected" as const }
            : f,
      );
      return { ...prev, files, totals: computePlanApplyTotals(files) };
    });
  }, [input.planState]);

  const {
    beginApplyPlanRun,
    completeApplyPlanRun,
    isStaleApplyPlanRun,
    ignoreStaleApplyPlanResult,
  } = useMemo(
    () =>
      createApplyPlanRunController(
        input.planState.applyPlanActiveRunIdRef,
        input.planState.applyPlanCompletedRunIdRef,
        input.appendGreenfieldRunLog,
      ),
    [
      input.planState.applyPlanActiveRunIdRef,
      input.planState.applyPlanCompletedRunIdRef,
      input.appendGreenfieldRunLog,
    ],
  );

  const startApplyPlan = useCallback(
    async (opts?: { autoContinue?: boolean; prompt?: string }) => {
      const activePlan = input.planState.planRef.current ?? input.plan;
      const effectiveScan =
        input.project != null
          ? resolveEffectiveProjectScan({
              scan: input.scan,
              projectPath: input.project.path,
              greenfieldRun: input.greenfieldRun,
            })
          : null;
      if (
        input.project &&
        shouldBlockEditForIncompleteGreenfield({
          projectPath: input.project.path,
          greenfieldRun: input.greenfieldRun,
        })
      ) {
        const blockMessage = incompleteGreenfieldEditBlockMessage(input.greenfieldRun);
        return {
          validReady: 0,
          autoContinued: false,
          error: blockMessage,
        };
      }
      if (!input.api || !input.project || !effectiveScan || !activePlan) {
        return {
          validReady: 0,
          autoContinued: false,
          error: activePlan
            ? "Apply prerequisites missing (project or scan not ready)."
            : "Apply prerequisites missing (deterministic plan not ready).",
        };
      }
      if (
        !opts?.autoContinue &&
        !input.planApplySession &&
        input.planState.applyPlanSuccessRef.current &&
        input.planState.applyPlanCompletedRunIdRef.current
      ) {
        input.appendGreenfieldRunLog("apply_plan", "success", NO_PENDING_CHANGES_MESSAGE);
        return { validReady: 0, autoContinued: false };
      }
      return input.executeApplyPlan({
        directRewrite: false,
        ...(opts?.autoContinue !== undefined ? { autoContinue: opts.autoContinue } : {}),
        ...(opts?.prompt !== undefined ? { prompt: opts.prompt } : {}),
      });
    },
    [input],
  );

  const runApplyPlanDirectRewrite = useCallback(async () => {
    const effectiveScan =
      input.project != null
        ? resolveEffectiveProjectScan({
            scan: input.scan,
            projectPath: input.project.path,
            greenfieldRun: input.greenfieldRun,
          })
        : null;
    if (
      !input.api ||
      !input.project ||
      !effectiveScan ||
      !input.plan ||
      !input.planApplySession
    ) {
      return;
    }
    await input.executeApplyPlan({ directRewrite: true });
  }, [input]);

  return {
    cancelApplyPlan,
    selectPlanApplyFile,
    setPlanApplyFileDecision,
    setPlanApplyFilePartialContent,
    approveAllPlanApplyFiles,
    beginApplyPlanRun,
    completeApplyPlanRun,
    isStaleApplyPlanRun,
    ignoreStaleApplyPlanResult,
    startApplyPlan,
    runApplyPlanDirectRewrite,
  };
}
