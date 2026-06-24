import { useBuildPipelineOrchestration } from "@/app/orchestration";
import type { AutoFixSession } from "@/core/autoFix";
import type { PlanApplySession } from "@/core/planApply";
import { useOrchestrationHostRefs } from "@/app/workspace/useOrchestrationHostRefs";
import {
  useWorkspaceOrchestrationActions,
  type WorkspaceOrchestrationActions,
} from "@/app/workspace/useWorkspaceOrchestrationActions";
import type { AIPlanStatus } from "@/app/workspace/useWorkspacePlanState";

export interface WorkspaceOrchestrationPhaseInputs {
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplyPhase: PlanApplySession["phase"] | null;
  readonly autoFixPhase: AutoFixSession["phase"] | null;
  readonly lastPlanPrompt: string | null;
  readonly planApplySession: PlanApplySession | null;
}

export interface WorkspaceOrchestrationBundle {
  readonly refs: ReturnType<typeof useOrchestrationHostRefs>;
  readonly actions: WorkspaceOrchestrationActions;
  readonly pipeline: ReturnType<typeof useBuildPipelineOrchestration>;
}

/** Host refs, pipeline orchestration, and ref-delegating action callbacks. */
export function useWorkspaceOrchestration(
  phaseInputs: WorkspaceOrchestrationPhaseInputs,
): WorkspaceOrchestrationBundle {
  const refs = useOrchestrationHostRefs();
  const actions = useWorkspaceOrchestrationActions(refs);
  const pipeline = useBuildPipelineOrchestration(refs.orchestrationHostRef, {
    aiPlanStatus: phaseInputs.aiPlanStatus,
    planApplyPhase: phaseInputs.planApplyPhase,
    autoFixPhase: phaseInputs.autoFixPhase,
    lastPlanPrompt: phaseInputs.lastPlanPrompt,
    planApplySession: phaseInputs.planApplySession,
  });

  return { refs, actions, pipeline };
}
