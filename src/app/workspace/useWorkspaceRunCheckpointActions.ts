import { useCallback } from "react";
import {
  clearRunCheckpoint,
  clearRunCheckpointAsync,
} from "@/core/runPersistence";
import type { PersistedRunCheckpoint } from "@/core/runPersistence/types";
import type { PlanApplySession } from "@/core/planApply";
import type { PipelineSession } from "@/core/pipeline/types";
import type { BuildLoopMode } from "@/core/build/types";
import type { WorkspacePlanState } from "@/app/workspace/useWorkspacePlanState";
import type { AgentLoopWorkspaceState } from "@/app/workspace/useAgentLoopWorkspaceState";

export function useWorkspaceRunCheckpointActions(input: {
  readonly project: { path: string } | null;
  readonly pendingRunCheckpoint: PersistedRunCheckpoint | null;
  readonly setPendingRunCheckpoint: React.Dispatch<
    React.SetStateAction<PersistedRunCheckpoint | null>
  >;
  readonly plan: Pick<
    WorkspacePlanState,
    | "setPlan"
    | "setAiPlan"
    | "setLastPlanPrompt"
    | "setBuilderSession"
    | "setExecutionSession"
    | "setPlanApplySession"
    | "builderControlRef"
  >;
  readonly agentLoop: Pick<
    AgentLoopWorkspaceState,
    "setAgentSession" | "setAgentLoopSession" | "agentControlRef"
  >;
  readonly setRailToolState: React.Dispatch<
    React.SetStateAction<import("@/core/layout/types").RailTool>
  >;
  readonly runBuilderOrchestrator: (
    session: NonNullable<WorkspacePlanState["builderSession"]>,
  ) => Promise<void>;
  readonly runAgentOrchestrator: (
    session: NonNullable<AgentLoopWorkspaceState["agentLoopSession"]>,
  ) => Promise<void>;
  readonly runMultiFileExecution: () => Promise<void>;
  readonly restorePipelineCheckpoint: (
    session: PipelineSession | null,
    mode?: BuildLoopMode,
  ) => void;
  readonly resumeMultiAgentPipeline: (session: PipelineSession) => Promise<void>;
  readonly resumeBuildReview: (session: PlanApplySession) => Promise<void>;
}) {
  const resumePersistedRun = useCallback(async () => {
    const cp = input.pendingRunCheckpoint;
    if (!cp || !input.project || cp.projectPath !== input.project.path) return;

    input.setPendingRunCheckpoint(null);

    if (cp.agentSession) input.agentLoop.setAgentSession(cp.agentSession);
    if (cp.aiPlan) input.plan.setAiPlan(cp.aiPlan);
    if (cp.plan) input.plan.setPlan(cp.plan);
    if (cp.lastPlanPrompt) input.plan.setLastPlanPrompt(cp.lastPlanPrompt);

    switch (cp.kind) {
      case "builder": {
        if (!cp.builderSession) return;
        input.plan.setBuilderSession(cp.builderSession);
        input.setRailToolState("agent");
        input.plan.builderControlRef.current = { paused: false, stopped: false };
        if (cp.builderSession.status === "paused") {
          await input.runBuilderOrchestrator({
            ...cp.builderSession,
            status: "running",
          });
        }
        break;
      }
      case "studio_agent": {
        if (!cp.agentLoopSession) return;
        input.agentLoop.setAgentLoopSession(cp.agentLoopSession);
        input.setRailToolState("agent");
        input.agentLoop.agentControlRef.current.paused = false;
        input.agentLoop.agentControlRef.current.stopped = false;
        if (cp.agentLoopSession.status === "paused") {
          await input.runAgentOrchestrator({
            ...cp.agentLoopSession,
            status: "running",
          });
        }
        break;
      }
      case "execution": {
        if (!cp.executionSession) return;
        input.plan.setExecutionSession(cp.executionSession);
        input.setRailToolState("execution");
        if (cp.interruptedWhileRunning) {
          await input.runMultiFileExecution();
        }
        break;
      }
      case "pipeline": {
        const pipeline = cp.pipelineSession ?? null;
        input.restorePipelineCheckpoint(pipeline, cp.buildMode);
        if (cp.planApplySession) input.plan.setPlanApplySession(cp.planApplySession);
        if (cp.interruptedWhileRunning && pipeline) {
          await input.resumeMultiAgentPipeline(pipeline);
        }
        break;
      }
      case "build_review": {
        const applySession = cp.planApplySession ?? null;
        if (applySession) input.plan.setPlanApplySession(applySession);
        input.restorePipelineCheckpoint(null, cp.buildMode ?? "single");
        if (cp.interruptedWhileRunning && applySession) {
          await input.resumeBuildReview(applySession);
        }
        break;
      }
    }
  }, [input]);

  const abandonPersistedRun = useCallback(() => {
    if (input.project?.path) {
      clearRunCheckpoint(input.project.path);
      void clearRunCheckpointAsync(input.project.path);
    }
    input.setPendingRunCheckpoint(null);
    input.plan.setBuilderSession(null);
    input.agentLoop.setAgentLoopSession(null);
    input.plan.setExecutionSession(null);
    input.restorePipelineCheckpoint(null);
    input.plan.setPlanApplySession(null);
  }, [input]);

  return {
    resumePersistedRun,
    abandonPersistedRun,
  };
}
