import { useCallback } from "react";
import { clearGreenfieldVerificationStatePatch } from "@/core/diagnostics/verificationResolution";
import {
  ownedApplyRunId,
  recoverObsoleteRunArtifacts,
  type ObsoleteRunRecoveryKind,
  type RecoveredStaleRunState,
  type StaleRunContextInput,
} from "@/core/agent/runContextReset";
import type { SmartFileSelectionResult } from "@/core/fileSelection";
import type { SessionMemoryDiagnostics } from "@/core/sessionMemory";
import type { VerificationResult } from "@/types";
import type { WorkspacePlanState } from "@/app/workspace/useWorkspacePlanState";
import type { AgentLoopWorkspaceState } from "@/app/workspace/useAgentLoopWorkspaceState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { FollowUpEscalationState } from "@/core/build/providerAutoEscalation";
import type { FollowUpSuccessSnapshot } from "@/core/build/followUpRun";
import type { FollowUpCheckpoint } from "@/core/build/followUpCheckpoint";
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
    | "activeEditorContextRef"
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
  readonly setPipelineError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setFollowUpEscalation: React.Dispatch<
    React.SetStateAction<FollowUpEscalationState | null>
  >;
  readonly setFollowUpSuccess: React.Dispatch<
    React.SetStateAction<FollowUpSuccessSnapshot | null>
  >;
  readonly setFollowUpCheckpoint: React.Dispatch<
    React.SetStateAction<FollowUpCheckpoint | null>
  >;
  readonly followUpCheckpoint: FollowUpCheckpoint | null;
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
    patch:
      | Partial<GreenfieldRunSnapshot>
      | ((prev: GreenfieldRunSnapshot) => Partial<GreenfieldRunSnapshot>),
  ) => void;
  readonly staleContext: StaleRunContextInput;
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
    input.setPipelineError(null);
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
    input.plan.activeEditorContextRef.current = null;
    input.plan.pipelineCoderResultRef.current = null;
    input.plan.applyPlanSuccessRef.current = null;
    input.plan.executionNoChangeGuardRef.current.clear();
    input.updateGreenfieldRun((prev) => ({
      ...clearGreenfieldVerificationStatePatch(prev),
    }));
  }, [clearPlan, input]);

  const archiveActiveRunContextAfterSuccess = useCallback(() => {
    clearPlan();
    input.setVerification(null);
    input.setVerifyStatus("idle");
    input.setVerifyError(null);
    input.setBuildError(null);
    input.setFollowUpEscalation(null);
  }, [clearPlan, input]);

  const applyRecoveredStaleRunState = useCallback(
    (next: RecoveredStaleRunState) => {
      input.plan.setPlan(null);
      input.plan.planRef.current = null;
      input.plan.setAiPlan(null);
      input.plan.aiPlanRef.current = null;
      input.plan.setAiPlanStatus("idle");
      input.plan.applyPlanActiveRunIdRef.current = next.applyPlanActiveRunId;
      input.plan.applyPlanCompletedRunIdRef.current = next.applyPlanCompletedRunId;
      input.plan.setPlanApplySession(null);
      input.plan.setPlanApplyError(null);
      input.setBuildError(null);
      input.setPipelineError(null);
      input.setFollowUpEscalation(null);
      input.setVerification(null);
      input.setVerifyStatus("idle");
      input.setVerifyError(null);
      input.plan.setExecutionSession(null);
      input.plan.setExecutionError(null);
      input.plan.setBuilderSession(null);
      input.plan.setBuilderError(null);
      input.plan.setAutoFixSession(null);
      input.updateGreenfieldRun(() => next.greenfieldRunPatch);
    },
    [input],
  );

  const runObsoleteArtifactRecovery = useCallback(
    (kind: ObsoleteRunRecoveryKind, recoveredRunId: string | null) => {
      const ownedRunId =
        ownedApplyRunId(
          input.plan.applyPlanActiveRunIdRef.current,
          input.plan.applyPlanCompletedRunIdRef.current,
        ) ?? (kind === "cancel_unapplied" ? recoveredRunId : null);
      return recoverObsoleteRunArtifacts({
        context:
          kind === "cancel_unapplied"
            ? { ...input.staleContext, planApplySession: null }
            : input.staleContext,
        kind,
        recoveredRunId,
        ownedRunId,
      });
    },
    [input.plan, input.staleContext],
  );

  const recoverAfterSuccessfulUndo = useCallback(
    (recoveredRunId: string | null) => {
      const result = runObsoleteArtifactRecovery("successful_undo", recoveredRunId);
      if (!result.ok) return result;
      applyRecoveredStaleRunState(result.next);
      return result;
    },
    [applyRecoveredStaleRunState, runObsoleteArtifactRecovery],
  );

  const recoverUnappliedReview = useCallback(
    (runId: string | null) => {
      input.plan.setPlanApplySession(null);
      input.plan.setPlanApplyError(null);
      if (input.followUpCheckpoint) {
        input.plan.applyPlanActiveRunIdRef.current = null;
        input.plan.applyPlanCompletedRunIdRef.current = null;
        return;
      }
      const result = runObsoleteArtifactRecovery("cancel_unapplied", runId);
      if (result.ok) {
        applyRecoveredStaleRunState(result.next);
        return;
      }
      input.plan.applyPlanActiveRunIdRef.current = null;
      input.plan.applyPlanCompletedRunIdRef.current = null;
    },
    [applyRecoveredStaleRunState, input, runObsoleteArtifactRecovery],
  );

  return {
    clearPlan,
    clearRunContextForNewSubmit,
    archiveActiveRunContextAfterSuccess,
    recoverAfterSuccessfulUndo,
    recoverUnappliedReview,
  };
}
