import { useCallback } from "react";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { BuilderApprovalMode, BuilderSession } from "@/core/builder";
import type { EditKind, EditParams } from "@/core/editor";
import type { Plan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { AiCallGatePurpose } from "@/core/providers/costControls";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type { ExecutionSession } from "@/core/execution";
import type { VerificationResult } from "@/types";
import {
  applyAIPatchOrchestration,
  applyApprovedPlanFilesOrchestration,
  applyPatchOrchestration,
  approveAgentActionOrchestration,
  approveAIPatchOrchestration,
  approveAutoFixRepairOrchestration,
  approveBuilderPhaseOrchestration,
  cancelAutoFixOrchestration,
  cancelMultiFileExecutionOrchestration,
  createExecutionSessionFromPlansOrchestration,
  createPlanOrchestration,
  discardAIPatchApprovalOrchestration,
  rejectAIPatchOrchestration,
  executeAIPlanForPromptOrchestration,
  executeApplyPlanOrchestration,
  executeMultiFileLoopOrchestration,
  invokeCoderCallOrchestration,
  invokeGreenfieldCallOrchestration,
  invokeGreenfieldRawCallOrchestration,
  invokeGreenfieldReservedCompletionOrchestration,
  invokePlannerCallOrchestration,
  invokeRepairCallOrchestration,
  pauseAgentOrchestration,
  pauseAutonomousBuildOrchestration,
  proposeAIPatchOrchestration,
  proposeEditOrchestration,
  refreshProviderStatusOrchestration,
  regenerateExecutionStepOrchestration,
  resetAiCallTrackerOrchestration,
  resolveProviderFallbackChoiceOrchestration,
  resumeAgentOrchestration,
  resumeAutonomousBuildOrchestration,
  retryExecutionStepOrchestration,
  runAgentOrchestratorOrchestration,
  runAIPlanOrchestration,
  runAutoFixAutomaticOrchestration,
  runBuilderOrchestratorOrchestration,
  runMultiFileExecutionOrchestration,
  runVerificationOrchestration,
  skipExecutionStepOrchestration,
  startAgentOrchestration,
  startAutoFixAfterApplyOrchestration,
  startAutonomousBuildOrchestration,
  startMultiFileExecutionOrchestration,
  stopAgentOrchestration,
  stopAutonomousBuildOrchestration,
  undoLastEditOrchestration,
  type ExecutionLoopResult,
} from "@/app/orchestration";
import type { ProviderFallbackChoice } from "@/core/providers/reliability";
import type { OrchestrationHostRefs } from "@/app/workspace/useOrchestrationHostRefs";

/** Stable orchestration action callbacks that delegate to host refs. */
export function useWorkspaceOrchestrationActions(refs: OrchestrationHostRefs) {
  const {
    planningHostRef,
    executionHostRef,
    builderHostRef,
    agentHostRef,
    autoFixHostRef,
    aiPatchHostRef,
    safeEditHostRef,
    verificationHostRef,
    applyPlanHostRef,
    providerInvokeHostRef,
  } = refs;

  const resetAiCallTracker = useCallback(
    () => resetAiCallTrackerOrchestration(providerInvokeHostRef.current),
    [providerInvokeHostRef],
  );

  const resolveProviderFallbackChoice = useCallback(
  async (choice: ProviderFallbackChoice) =>
      resolveProviderFallbackChoiceOrchestration(
        providerInvokeHostRef.current,
        choice,
      ),
    [providerInvokeHostRef],
  );

  const invokePlannerCall = useCallback(
    async <T extends StageProviderResult>(
      settings: ProviderSettings,
      estimatedTokens: number,
      call: (provider: ProviderId) => Promise<T>,
    ) =>
      invokePlannerCallOrchestration(
        providerInvokeHostRef.current,
        settings,
        estimatedTokens,
        call,
      ),
    [providerInvokeHostRef],
  );

  const invokeCoderCall = useCallback(
    async <T extends StageProviderResult>(
      settings: ProviderSettings,
      estimatedTokens: number,
      call: (provider: ProviderId) => Promise<T>,
      extras?: {
        promptPayload?: string;
        patchSize?: "small" | "large";
        skipSmartRetry?: boolean;
      },
    ) =>
      invokeCoderCallOrchestration(
        providerInvokeHostRef.current,
        settings,
        estimatedTokens,
        call,
        extras,
      ),
    [providerInvokeHostRef],
  );

  const invokeRepairCall = useCallback(
    async <T extends StageProviderResult>(
      settings: ProviderSettings,
      estimatedTokens: number,
      call: (provider: ProviderId) => Promise<T>,
    ) =>
      invokeRepairCallOrchestration(
        providerInvokeHostRef.current,
        settings,
        estimatedTokens,
        call,
      ),
    [providerInvokeHostRef],
  );

  const invokeGreenfieldCall = useCallback(
    async <T extends StageProviderResult>(
      settings: ProviderSettings,
      estimatedTokens: number,
      call: (provider: ProviderId) => Promise<T>,
      promptPayload?: string,
      recordPurpose?: AiCallGatePurpose,
    ) =>
      invokeGreenfieldCallOrchestration(
        providerInvokeHostRef.current,
        settings,
        estimatedTokens,
        call,
        promptPayload,
        recordPurpose,
      ),
    [providerInvokeHostRef],
  );

  const invokeGreenfieldRawCall = useCallback(
    async <T extends StageProviderResult>(
      settings: ProviderSettings,
      estimatedTokens: number,
      call: (provider: ProviderId) => Promise<T>,
      promptPayload?: string,
      recordPurpose?: AiCallGatePurpose,
    ) =>
      invokeGreenfieldRawCallOrchestration(
        providerInvokeHostRef.current,
        settings,
        estimatedTokens,
        call,
        promptPayload,
        recordPurpose,
      ),
    [providerInvokeHostRef],
  );

  const invokeGreenfieldReservedCompletion = useCallback(
    async <T extends StageProviderResult>(
      settings: ProviderSettings,
      estimatedTokens: number,
      call: (provider: ProviderId) => Promise<T>,
      promptPayload?: string,
    ) =>
      invokeGreenfieldReservedCompletionOrchestration(
        providerInvokeHostRef.current,
        settings,
        estimatedTokens,
        call,
        promptPayload,
      ),
    [providerInvokeHostRef],
  );

  const refreshProviderStatus = useCallback(
    async (opts?: { logToRun?: boolean }) =>
      refreshProviderStatusOrchestration(providerInvokeHostRef.current, opts),
    [providerInvokeHostRef],
  );

  const createPlan = useCallback(
    (prompt: string, semanticBoostPaths?: readonly string[]) =>
      createPlanOrchestration(planningHostRef.current, prompt, {
        ...(semanticBoostPaths ? { semanticBoostPaths } : {}),
      }),
    [planningHostRef],
  );

  const runAIPlan = useCallback(
    async (explicitPrompt?: string) =>
      runAIPlanOrchestration(planningHostRef.current, explicitPrompt),
    [planningHostRef],
  );

  const executeMultiFileLoop = useCallback(
    async (initial: ExecutionSession): Promise<ExecutionLoopResult> =>
      executeMultiFileLoopOrchestration(executionHostRef.current, initial),
    [executionHostRef],
  );

  const startMultiFileExecution = useCallback(
    async () => startMultiFileExecutionOrchestration(executionHostRef.current),
    [executionHostRef],
  );

  const runMultiFileExecution = useCallback(
    async () => runMultiFileExecutionOrchestration(executionHostRef.current),
    [executionHostRef],
  );

  const retryExecutionStep = useCallback(
    async () => retryExecutionStepOrchestration(executionHostRef.current),
    [executionHostRef],
  );

  const skipExecutionStep = useCallback(
    async () => skipExecutionStepOrchestration(executionHostRef.current),
    [executionHostRef],
  );

  const regenerateExecutionStep = useCallback(
    async () => regenerateExecutionStepOrchestration(executionHostRef.current),
    [executionHostRef],
  );

  const cancelMultiFileExecution = useCallback(
    () => cancelMultiFileExecutionOrchestration(executionHostRef.current),
    [executionHostRef],
  );

  const createExecutionSessionFromPlans = useCallback(
    (
      deterministicPlan: Plan,
      aiPlanResult: AIPlanResult,
      userPrompt: string,
    ): ExecutionSession | null =>
      createExecutionSessionFromPlansOrchestration(
        executionHostRef.current,
        deterministicPlan,
        aiPlanResult,
        userPrompt,
      ),
    [executionHostRef],
  );

  const executeAIPlanForPrompt = useCallback(
    async (userPrompt: string, deterministicPlan: Plan) =>
      executeAIPlanForPromptOrchestration(
        planningHostRef.current,
        userPrompt,
        deterministicPlan,
      ),
    [planningHostRef],
  );

  const runAutoFixAutomatic = useCallback(
    async (opts: {
      verification: VerificationResult;
      applied: readonly string[];
      prompt: string;
      planSummary: string;
      planSource: string;
      failureLine: string;
    }) => runAutoFixAutomaticOrchestration(autoFixHostRef.current, opts),
    [autoFixHostRef],
  );

  const runBuilderOrchestrator = useCallback(
    async (initial: BuilderSession) =>
      runBuilderOrchestratorOrchestration(builderHostRef.current, initial),
    [builderHostRef],
  );

  const startAutonomousBuild = useCallback(
    async (goalPrompt: string, mode: BuilderApprovalMode) =>
      startAutonomousBuildOrchestration(
        builderHostRef.current,
        goalPrompt,
        mode,
      ),
    [builderHostRef],
  );

  const pauseAutonomousBuild = useCallback(
    () => pauseAutonomousBuildOrchestration(builderHostRef.current),
    [builderHostRef],
  );

  const resumeAutonomousBuild = useCallback(
    async () => resumeAutonomousBuildOrchestration(builderHostRef.current),
    [builderHostRef],
  );

  const stopAutonomousBuild = useCallback(
    () => stopAutonomousBuildOrchestration(builderHostRef.current),
    [builderHostRef],
  );

  const approveBuilderPhase = useCallback(
    async () => approveBuilderPhaseOrchestration(builderHostRef.current),
    [builderHostRef],
  );

  const runAgentOrchestrator = useCallback(
    async (initial: AgentLoopSession) =>
      runAgentOrchestratorOrchestration(agentHostRef.current, initial),
    [agentHostRef],
  );

  const startAgent = useCallback(
    async (goalPrompt: string) =>
      startAgentOrchestration(agentHostRef.current, goalPrompt),
    [agentHostRef],
  );

  const pauseAgent = useCallback(
    () => pauseAgentOrchestration(agentHostRef.current),
    [agentHostRef],
  );

  const resumeAgent = useCallback(
    async () => resumeAgentOrchestration(agentHostRef.current),
    [agentHostRef],
  );

  const stopAgent = useCallback(
    () => stopAgentOrchestration(agentHostRef.current),
    [agentHostRef],
  );

  const approveAgentAction = useCallback(
    async () => approveAgentActionOrchestration(agentHostRef.current),
    [agentHostRef],
  );

  const proposeAIPatch = useCallback(
    async (
      prompt: string,
      opts?: { readonly selection?: import("@/core/editor/inlineEdit").InlineEditSelection },
    ) => proposeAIPatchOrchestration(aiPatchHostRef.current, prompt, opts),
    [aiPatchHostRef],
  );

  const proposeEdit = useCallback(
    (kind: EditKind, params: EditParams) =>
      proposeEditOrchestration(safeEditHostRef.current, kind, params),
    [safeEditHostRef],
  );

  const applyPatch = useCallback(
    async () => applyPatchOrchestration(safeEditHostRef.current),
    [safeEditHostRef],
  );

  const undoLastEdit = useCallback(
    async () => undoLastEditOrchestration(safeEditHostRef.current),
    [safeEditHostRef],
  );

  const approveAIPatch = useCallback(
    () => approveAIPatchOrchestration(aiPatchHostRef.current),
    [aiPatchHostRef],
  );

  const discardAIPatchApproval = useCallback(
    () => discardAIPatchApprovalOrchestration(aiPatchHostRef.current),
    [aiPatchHostRef],
  );

  const rejectAIPatch = useCallback(
    () => rejectAIPatchOrchestration(aiPatchHostRef.current),
    [aiPatchHostRef],
  );

  const applyAIPatch = useCallback(
    async () => applyAIPatchOrchestration(aiPatchHostRef.current),
    [aiPatchHostRef],
  );

  const runVerification = useCallback(
    async () => runVerificationOrchestration(verificationHostRef.current),
    [verificationHostRef],
  );

  const executeApplyPlan = useCallback(
    async (opts: {
      directRewrite: boolean;
      pipelineMode?: boolean;
      autoContinue?: boolean;
    }) => executeApplyPlanOrchestration(applyPlanHostRef.current, opts),
    [applyPlanHostRef],
  );

  const startAutoFixAfterApply = useCallback(
    async (opts: {
      verification: VerificationResult;
      applied: string[];
      prompt: string;
      planSummary: string;
      planSource: string;
      failureLine: string;
    }) => startAutoFixAfterApplyOrchestration(autoFixHostRef.current, opts),
    [autoFixHostRef],
  );

  const approveAutoFixRepair = useCallback(
    async () => approveAutoFixRepairOrchestration(autoFixHostRef.current),
    [autoFixHostRef],
  );

  const cancelAutoFix = useCallback(
    () => cancelAutoFixOrchestration(autoFixHostRef.current),
    [autoFixHostRef],
  );

  const applyApprovedPlanFiles = useCallback(
    async (opts?: { pipelineMode?: boolean }) =>
      applyApprovedPlanFilesOrchestration(applyPlanHostRef.current, opts),
    [applyPlanHostRef],
  );

  return {
    resetAiCallTracker,
    resolveProviderFallbackChoice,
    invokePlannerCall,
    invokeCoderCall,
    invokeRepairCall,
    invokeGreenfieldCall,
    invokeGreenfieldRawCall,
    invokeGreenfieldReservedCompletion,
    refreshProviderStatus,
    createPlan,
    runAIPlan,
    executeMultiFileLoop,
    startMultiFileExecution,
    runMultiFileExecution,
    retryExecutionStep,
    skipExecutionStep,
    regenerateExecutionStep,
    cancelMultiFileExecution,
    createExecutionSessionFromPlans,
    executeAIPlanForPrompt,
    runAutoFixAutomatic,
    runBuilderOrchestrator,
    startAutonomousBuild,
    pauseAutonomousBuild,
    resumeAutonomousBuild,
    stopAutonomousBuild,
    approveBuilderPhase,
    runAgentOrchestrator,
    startAgent,
    pauseAgent,
    resumeAgent,
    stopAgent,
    approveAgentAction,
    proposeAIPatch,
    proposeEdit,
    applyPatch,
    undoLastEdit,
    approveAIPatch,
    discardAIPatchApproval,
    rejectAIPatch,
    applyAIPatch,
    runVerification,
    executeApplyPlan,
    startAutoFixAfterApply,
    approveAutoFixRepair,
    cancelAutoFix,
    applyApprovedPlanFiles,
  };
}

export type WorkspaceOrchestrationActions = ReturnType<
  typeof useWorkspaceOrchestrationActions
>;
