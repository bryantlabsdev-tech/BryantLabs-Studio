import { useCallback } from "react";
import { clearGreenfieldVerificationStatePatch } from "@/core/diagnostics/verificationResolution";
import type { SmartFileSelectionResult } from "@/core/fileSelection";
import type { SessionMemoryDiagnostics } from "@/core/sessionMemory";
import type { VerificationResult } from "@/types";
import type { WorkspacePlanState } from "@/app/workspace/useWorkspacePlanState";
import type { AgentLoopWorkspaceState } from "@/app/workspace/useAgentLoopWorkspaceState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { FollowUpEscalationState } from "@/core/build/providerAutoEscalation";
import type { FollowUpSuccessSnapshot } from "@/core/build/followUpRun";
import type { Patch } from "@/core/editor";
import type { EditTarget } from "@/app/workspace/workspaceState";
import type { PipelineSession } from "@/core/pipeline/types";
import type { BuildLoopMode } from "@/core/build/types";

type VerifyStatus = "idle" | "running" | "done" | "error";

export function useWorkspaceRunContextReset(input: {
  readonly plan: Pick<
    WorkspacePlanState,
    | "setPlan"
    | "planRef"
    | "setAiPlan"
    | "aiPlanRef"
    | "setAiPlanStatus"
    | "setLastPlanPrompt"
    | "applyPlanActiveRunIdRef"
    | "applyPlanCompletedRunIdRef"
    | "setPlanApplySession"
    | "setPlanApplyError"
    | "setExecutionSession"
    | "setExecutionError"
    | "setBuilderSession"
    | "setBuilderError"
    | "setAutoFixSession"
    | "setAiPatchSession"
    | "setPatchStatus"
    | "setPatchError"
    | "setAiPatchApproved"
    | "setAiPatchApplyStatus"
    | "setAiPatchApplyError"
    | "createPlanErrorRef"
    | "lastContextSnapshotIdRef"
    | "editExplorationContentsRef"
    | "pipelineCoderResultRef"
    | "applyPlanSuccessRef"
    | "executionNoChangeGuardRef"
  >;
  readonly agentLoop: Pick<
    AgentLoopWorkspaceState,
    "setAgentLoopSession" | "setAgentLoopError"
  >;
  readonly setSmartFileSelection: React.Dispatch<
    React.SetStateAction<SmartFileSelectionResult | null>
  >;
  readonly setSessionMemoryDiagnostics: React.Dispatch<
    React.SetStateAction<SessionMemoryDiagnostics | null>
  >;
  readonly setBuildError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setFollowUpEscalation: React.Dispatch<
    React.SetStateAction<FollowUpEscalationState | null>
  >;
  readonly setFollowUpSuccess: React.Dispatch<
    React.SetStateAction<FollowUpSuccessSnapshot | null>
  >;
  readonly setFollowUpCheckpoint: React.Dispatch<
    React.SetStateAction<import("@/core/build/followUpCheckpoint").FollowUpCheckpoint | null>
  >;
  readonly setVerification: React.Dispatch<
    React.SetStateAction<VerificationResult | null>
  >;
  readonly setVerifyStatus: React.Dispatch<React.SetStateAction<VerifyStatus>>;
  readonly setVerifyError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setEditTarget: React.Dispatch<React.SetStateAction<EditTarget | null>>;
  readonly setPendingPatch: React.Dispatch<React.SetStateAction<Patch | null>>;
  readonly setReviewing: React.Dispatch<React.SetStateAction<boolean>>;
  readonly restorePipelineCheckpoint: (
    checkpoint: PipelineSession | null,
    mode?: BuildLoopMode,
  ) => void;
  readonly updateGreenfieldRun: (
    patch: Partial<GreenfieldRunSnapshot>,
  ) => void;
}) {
  const clearPlan = useCallback(() => {
    input.plan.setPlan(null);
    input.plan.planRef.current = null;
    input.plan.setAiPlan(null);
    input.plan.aiPlanRef.current = null;
    input.plan.setAiPlanStatus("idle");
    input.plan.setLastPlanPrompt(null);
    input.setSmartFileSelection(null);
    input.setSessionMemoryDiagnostics(null);
  }, [input]);

  const clearRunContextForNewSubmit = useCallback(() => {
    clearPlan();
    input.plan.applyPlanActiveRunIdRef.current = null;
    input.plan.applyPlanCompletedRunIdRef.current = null;
    input.plan.setPlanApplySession(null);
    input.plan.setPlanApplyError(null);
    input.setBuildError(null);
    input.setFollowUpEscalation(null);
    input.setFollowUpCheckpoint(null);
    input.setFollowUpSuccess(null);
    input.setVerification(null);
    input.setVerifyStatus("idle");
    input.setVerifyError(null);
    input.plan.setExecutionSession(null);
    input.plan.setExecutionError(null);
    input.plan.setBuilderSession(null);
    input.plan.setBuilderError(null);
    input.plan.setAutoFixSession(null);
    input.agentLoop.setAgentLoopSession(null);
    input.agentLoop.setAgentLoopError(null);
    input.plan.setAiPatchSession(null);
    input.plan.setPatchStatus("idle");
    input.plan.setPatchError(null);
    input.plan.setAiPatchApproved(false);
    input.plan.setAiPatchApplyStatus("idle");
    input.plan.setAiPatchApplyError(null);
    input.setPendingPatch(null);
    input.setReviewing(false);
    input.restorePipelineCheckpoint(null);
    input.plan.createPlanErrorRef.current = null;
    input.plan.lastContextSnapshotIdRef.current = null;
    input.plan.editExplorationContentsRef.current = [];
    input.plan.pipelineCoderResultRef.current = null;
    input.plan.applyPlanSuccessRef.current = null;
    input.plan.executionNoChangeGuardRef.current.clear();
    input.updateGreenfieldRun({
      ...clearGreenfieldVerificationStatePatch(),
    });
  }, [clearPlan, input]);

  const archiveActiveRunContextAfterSuccess = useCallback(() => {
    clearPlan();
    input.setVerification(null);
    input.setVerifyStatus("idle");
    input.setVerifyError(null);
    input.setBuildError(null);
    input.setFollowUpEscalation(null);
  }, [clearPlan, input]);

  return {
    clearPlan,
    clearRunContextForNewSubmit,
    archiveActiveRunContextAfterSuccess,
  };
}
