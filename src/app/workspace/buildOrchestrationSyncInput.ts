import type { SyncOrchestrationHostsInput } from "@/app/workspace/syncOrchestrationHosts";

/** Workspace values refreshed each render for orchestration host refs. */
export type OrchestrationSyncBridge = Pick<
  SyncOrchestrationHostsInput,
  | "api"
  | "project"
  | "scan"
  | "plan"
  | "aiPlan"
  | "lastPlanPrompt"
  | "sessionMemory"
  | "planApplySession"
  | "projectMemory"
  | "projectIntelligence"
  | "aiPlanStatus"
  | "autoFixSession"
  | "greenfieldRun"
  | "buildRunning"
  | "pipelineRunning"
  | "agentGreenfieldPanelActive"
  | "editTarget"
  | "activeFile"
  | "activePath"
  | "pendingPatch"
  | "reviewing"
  | "verification"
  | "executionSession"
  | "aiPatchSession"
  | "aiPatchApproved"
  | "builderSession"
  | "agentLoopSession"
  | "scanStatus"
  | "repository"
  | "appPreview"
  | "patchAppPreview"
>;

export type OrchestrationSyncRefs = Pick<
  SyncOrchestrationHostsInput,
  | "planRef"
  | "aiPlanRef"
  | "applyPlanSuccessRef"
  | "executionNoChangeGuardRef"
  | "pipelineCoderResultRef"
  | "lastContextSnapshotIdRef"
  | "editExplorationContentsRef"
  | "createPlanErrorRef"
  | "projectMemoryRef"
  | "aiCallTrackerRef"
  | "fallbackResolverRef"
  | "providerHealthInFlightRef"
  | "providerHealthCacheRef"
  | "currentRunAnalyticsRef"
  | "lastRecordedAnalyticsKeyRef"
  | "pipelineRunActiveRef"
  | "builderControlRef"
  | "builderSkipApprovalRef"
  | "agentControlRef"
  | "agentLastExecRef"
  | "applyPlanActiveRunIdRef"
>;

export type OrchestrationSyncSetters = Pick<
  SyncOrchestrationHostsInput,
  | "setVerifyStatus"
  | "setVerifyError"
  | "setVerification"
  | "setSessionMemory"
  | "setSessionMemoryDiagnostics"
  | "setPendingPatch"
  | "setReviewing"
  | "setEditError"
  | "setEditStatus"
  | "setCanUndo"
  | "setLastEditedPath"
  | "setProviderStatus"
  | "setProviderFallbackRequest"
  | "setGreenfieldRun"
  | "setPlan"
  | "setAiPlan"
  | "setAiPlanStatus"
  | "setLastPlanPrompt"
  | "setPlanApplyError"
  | "setBuildError"
  | "setPlanApplySession"
  | "setCenterTab"
  | "setRailToolState"
  | "setPatchStatus"
  | "setPatchError"
  | "setAiPatchSession"
  | "setAiPatchApproved"
  | "setAiPatchApplyStatus"
  | "setAiPatchApplyError"
  | "setExecutionSession"
  | "setExecutionError"
  | "setBuilderSession"
  | "setBuilderError"
  | "setAgentLoopSession"
  | "setAgentLoopError"
  | "setAutoFixSession"
>;

export type OrchestrationSyncActions = Pick<
  SyncOrchestrationHostsInput,
  | "appendGreenfieldRunLog"
  | "updateGreenfieldRun"
  | "beginStudioAction"
  | "finishStudioAction"
  | "publishFailureReport"
  | "resetAiCallTracker"
  | "refreshProviderStatus"
  | "persistAnalyticsRecord"
  | "offerMemoryCandidatesFromRun"
  | "createPlan"
  | "runAIPlan"
  | "clearRunContextForNewSubmit"
  | "archiveActiveRunContextAfterSuccess"
  | "startApplyPlan"
  | "approveAllPlanApplyFiles"
  | "applyApprovedPlanFiles"
  | "cancelApplyPlan"
  | "executeApplyPlan"
  | "startAutoFixAfterApply"
  | "approveAutoFixRepair"
  | "commitContextCapture"
  | "invokePlannerCall"
  | "invokeCoderCall"
  | "invokeRepairCall"
  | "refreshSmartFileSelection"
  | "resolveMemoriesForPrompt"
  | "buildApplyPlanFailureReport"
  | "recordFollowUpUserMessage"
  | "recordAgentUserMessage"
  | "recordFollowUpFailureMessage"
  | "finalizeFollowUpActivityRunFromLogs"
  | "attemptFollowUpAutoEscalation"
  | "resolveAgentRunBlockReason"
  | "syncAppContextBeforeEdit"
  | "releaseBuildRunForReview"
  | "beginApplyPlanRun"
  | "isStaleApplyPlanRun"
  | "ignoreStaleApplyPlanResult"
  | "completeApplyPlanRun"
  | "requestPreviewTab"
  | "recordSmartFileHistory"
  | "setFollowUpCheckpoint"
  | "recordFollowUpStudioMessage"
  | "openPath"
  | "runScan"
  | "pushAgent"
  | "executeAIPlanForPrompt"
  | "createExecutionSessionFromPlans"
  | "executeMultiFileLoop"
  | "runAutoFixAutomatic"
  | "runAgentFollowUp"
>;

export interface OrchestrationSyncGroups {
  readonly bridge: OrchestrationSyncBridge;
  readonly refs: OrchestrationSyncRefs;
  readonly setters: OrchestrationSyncSetters;
  readonly actions: OrchestrationSyncActions;
}

export function buildOrchestrationSyncInput(
  groups: OrchestrationSyncGroups,
): SyncOrchestrationHostsInput {
  return {
    ...groups.bridge,
    ...groups.refs,
    ...groups.setters,
    ...groups.actions,
  };
}
