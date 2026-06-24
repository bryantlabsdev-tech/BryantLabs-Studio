import { useCallback, useMemo } from "react";
import {
  getAgentRunBlockReason,
  isAgentWorkflowBusy,
} from "@/core/agent/agentRunMutex";
import { hasStaleRunContext } from "@/core/agent/runContextReset";
import { IMPROVE_APP_PROMPT } from "@/core/build/pmMode";
import type { ExecutionDashboardUiAuditAdvisory } from "@/core/agent/executionDashboard";
import { buildUiAuditAdvisoryFixPrompt } from "@/core/agent/uiAuditAdvisoryUx";
import { buildPreferredFixPrompt } from "@/core/projectIntelligence/recommendations";
import type { MemoryRecommendation } from "@/core/projectIntelligence/types";
import type { RailTool } from "@/core/layout/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { Plan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { PlanApplySession } from "@/core/planApply";
import type { AutoFixSession } from "@/core/autoFix";
import type { BuilderSession } from "@/core/builder";
import type { ExecutionSession } from "@/core/execution";
import type { FollowUpEscalationState } from "@/core/build/providerAutoEscalation";
import type { VerificationResult } from "@/types";
import type { AIPlanStatus } from "@/app/workspace/useWorkspacePlanState";
import {
  emptyGreenfieldRun,
} from "@/core/greenfield/runState";

export function useWorkspaceAgentRunGates(input: {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly agentGreenfieldPanelActive: boolean;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplySession: PlanApplySession | null;
  readonly autoFixSession: AutoFixSession | null;
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly verification: VerificationResult | null;
  readonly builderSession: BuilderSession | null;
  readonly executionSession: ExecutionSession | null;
  readonly followUpEscalation: FollowUpEscalationState | null;
  readonly setBuildError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setRailToolState: React.Dispatch<React.SetStateAction<RailTool>>;
  readonly setGreenfieldRun: React.Dispatch<React.SetStateAction<GreenfieldRunSnapshot>>;
  readonly setAgentGreenfieldPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  readonly greenfieldRunControlRef: React.MutableRefObject<{
    cancel: () => void;
    runRepair?: () => Promise<void>;
  } | null>;
  readonly startAgent: (prompt: string) => Promise<void>;
  readonly recordAgentUserMessage: (prompt: string) => void;
  readonly recordAgentActivityMessage: (text: string) => void;
  readonly resetActiveAgentRun: () => void;
  readonly cancelMultiAgentPipeline: () => void;
  readonly cancelBuildLoop: () => void;
  readonly clearRunContextForNewSubmit: () => void;
  readonly cancelApplyPlan: () => void;
}) {
  const resolveAgentRunBlockReason = useCallback(
    () =>
      getAgentRunBlockReason({
        greenfieldRun: input.greenfieldRun,
        greenfieldPanelActive: input.agentGreenfieldPanelActive,
        buildRunning: input.buildRunning,
        pipelineRunning: input.pipelineRunning,
        aiPlanStatus: input.aiPlanStatus,
        planApplyPhase: input.planApplySession?.phase ?? null,
        autoFixPhase: input.autoFixSession?.phase ?? null,
      }),
    [input],
  );

  const agentRunBlockReason = useMemo(
    () => resolveAgentRunBlockReason(),
    [resolveAgentRunBlockReason],
  );

  const staleRunContextPresent = useMemo(
    () =>
      hasStaleRunContext({
        plan: input.plan,
        aiPlan: input.aiPlan,
        aiPlanStatus: input.aiPlanStatus,
        planApplySession: input.planApplySession,
        buildError: input.buildError,
        planApplyError: input.planApplyError,
        pipelineError: input.pipelineError,
        verification: input.verification,
        builderSession: input.builderSession,
        executionSession: input.executionSession,
        followUpEscalation: input.followUpEscalation,
        greenfieldRun: input.greenfieldRun,
        mutex: {
          greenfieldRun: input.greenfieldRun,
          greenfieldPanelActive: input.agentGreenfieldPanelActive,
          buildRunning: input.buildRunning,
          pipelineRunning: input.pipelineRunning,
          aiPlanStatus: input.aiPlanStatus,
          planApplyPhase: input.planApplySession?.phase ?? null,
          autoFixPhase: input.autoFixSession?.phase ?? null,
        },
      }),
    [input],
  );

  const agentWorkflowBusy = useMemo(
    () =>
      isAgentWorkflowBusy({
        greenfieldRun: input.greenfieldRun,
        greenfieldPanelActive: input.agentGreenfieldPanelActive,
        buildRunning: input.buildRunning,
        pipelineRunning: input.pipelineRunning,
        aiPlanStatus: input.aiPlanStatus,
        planApplyPhase: input.planApplySession?.phase ?? null,
        autoFixPhase: input.autoFixSession?.phase ?? null,
      }),
    [input],
  );

  const setRailTool = useCallback(
    (tool: RailTool) => {
      if (tool === "newapp" && agentWorkflowBusy) return;
      input.setRailToolState(tool);
    },
    [agentWorkflowBusy, input.setRailToolState],
  );

  const runImproveAppMode = useCallback(async () => {
    const blockReason = resolveAgentRunBlockReason();
    if (blockReason) {
      input.setBuildError(blockReason);
      return;
    }
    await input.startAgent(IMPROVE_APP_PROMPT);
  }, [resolveAgentRunBlockReason, input]);

  const startUiAuditAdvisoryFix = useCallback(
    async (advisory: ExecutionDashboardUiAuditAdvisory) => {
      const blockReason = resolveAgentRunBlockReason();
      if (blockReason) {
        input.setBuildError(blockReason);
        return;
      }
      const prompt = buildUiAuditAdvisoryFixPrompt(advisory);
      input.recordAgentUserMessage(prompt);
      input.recordAgentActivityMessage(
        `UI audit advisory fix · ${advisory.issues.join(", ") || advisory.layoutType}`,
      );
      setRailTool("agent");
      await input.startAgent(prompt);
    },
    [resolveAgentRunBlockReason, input, setRailTool],
  );

  const startPreferredMemoryFix = useCallback(
    async (recommendation: MemoryRecommendation) => {
      const blockReason = resolveAgentRunBlockReason();
      if (blockReason) {
        input.setBuildError(blockReason);
        return;
      }
      const prompt = buildPreferredFixPrompt(recommendation);
      input.recordAgentUserMessage(prompt);
      input.recordAgentActivityMessage(
        `Preferred memory fix · ${recommendation.issueId} · ${recommendation.recommendedFix}`,
      );
      setRailTool("agent");
      await input.startAgent(prompt);
    },
    [resolveAgentRunBlockReason, input, setRailTool],
  );

  const resetAgentRunState = useCallback(() => {
    input.greenfieldRunControlRef.current?.cancel();
    input.setGreenfieldRun((prev) => ({
      ...emptyGreenfieldRun(),
      targetFolder: prev.targetFolder,
    }));
    input.setAgentGreenfieldPanelActive(false);
    input.resetActiveAgentRun();
    input.cancelMultiAgentPipeline();
    input.cancelBuildLoop();
    input.clearRunContextForNewSubmit();
    input.cancelApplyPlan();
    input.recordAgentActivityMessage("Agent state reset — you can submit a new prompt.");
  }, [input]);

  return {
    resolveAgentRunBlockReason,
    agentRunBlockReason,
    staleRunContextPresent,
    agentWorkflowBusy,
    setRailTool,
    runImproveAppMode,
    startUiAuditAdvisoryFix,
    startPreferredMemoryFix,
    resetAgentRunState,
  };
}
