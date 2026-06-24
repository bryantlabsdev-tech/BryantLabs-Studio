import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { OrchestrationHostRefs } from "@/app/workspace/useOrchestrationHostRefs";
import type { AppPreviewState } from "@/app/workspace/usePreviewState";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import type { ActiveOpenFile } from "@/app/orchestration/aiPatchTypes";
import type { AgentOrchestrationHost } from "@/app/orchestration/agentTypes";
import type { AutoFixOrchestrationHost } from "@/app/orchestration/autoFixTypes";
import type { BuilderOrchestrationHost } from "@/app/orchestration/builderTypes";
import type { ExecutionOrchestrationHost } from "@/app/orchestration/executionTypes";
import type { FailureReportOrchestrationHost } from "@/app/orchestration/failureReportTypes";
import type { PlanningOrchestrationHost } from "@/app/orchestration/planningTypes";
import type { ProviderInvokeOrchestrationHost } from "@/app/orchestration/providerInvokeTypes";
import type {
  SafeEditOpenFile,
  SafeEditTarget,
} from "@/app/orchestration/safeEditTypes";
import type { StudioActionOrchestrationHost } from "@/app/orchestration/studioActionTypes";
import type { VerificationOrchestrationHost } from "@/app/orchestration/verificationTypes";
import type { BuildPipelineHost } from "@/app/orchestration/types";
import type { AIPatchOrchestrationHost } from "@/app/orchestration/aiPatchTypes";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { BuilderSession } from "@/core/builder";
import type { ExecutionSession } from "@/core/execution";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { MemoryRetrievalResult } from "@/core/memory";
import type { AIPatchSession } from "@/core/planner/aiTypes";
import type { RepositoryIndex } from "@/core/repository";
import type { Patch } from "@/core/editor";
import type { AutoFixSession } from "@/core/autoFix";
import type { VerificationResult } from "@/types";

type ScanStatus = AgentOrchestrationHost["scanStatus"];

/** Workspace snapshot passed each render to refresh orchestration host refs. */
export interface SyncOrchestrationHostsInput {
  readonly api: BuildPipelineHost["api"];
  readonly project: BuildPipelineHost["project"];
  readonly scan: BuildPipelineHost["scan"];
  readonly plan: ApplyPlanOrchestrationHost["plan"];
  readonly aiPlan: ApplyPlanOrchestrationHost["aiPlan"];
  readonly lastPlanPrompt: BuildPipelineHost["lastPlanPrompt"];
  readonly sessionMemory: BuildPipelineHost["sessionMemory"];
  readonly planApplySession: BuildPipelineHost["planApplySession"];
  readonly projectMemory: ApplyPlanOrchestrationHost["projectMemory"];
  readonly projectIntelligence: PlanningOrchestrationHost["projectIntelligence"];
  readonly planRef: ApplyPlanOrchestrationHost["planRef"];
  readonly aiPlanRef: ApplyPlanOrchestrationHost["aiPlanRef"];
  readonly applyPlanSuccessRef: ApplyPlanOrchestrationHost["applyPlanSuccessRef"];
  readonly executionNoChangeGuardRef: ApplyPlanOrchestrationHost["executionNoChangeGuardRef"];
  readonly pipelineCoderResultRef: ApplyPlanOrchestrationHost["pipelineCoderResultRef"];
  readonly lastContextSnapshotIdRef: ApplyPlanOrchestrationHost["lastContextSnapshotIdRef"];
  readonly editExplorationContentsRef: MutableRefObject<
    readonly import("@/core/context/referencedFileContext").ReferencedFileContent[]
  >;
  readonly createPlanErrorRef: MutableRefObject<string | null>;
  readonly aiPlanStatus: BuildPipelineHost["aiPlanStatus"];
  readonly autoFixSession: AutoFixSession | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly agentGreenfieldPanelActive: boolean;
  readonly editTarget: SafeEditTarget | null;
  readonly activeFile: SafeEditOpenFile | null;
  readonly activePath: string | null;
  readonly pendingPatch: Patch | null;
  readonly reviewing: boolean;
  readonly verification: VerificationResult | null;
  readonly executionSession: ExecutionSession | null;
  readonly aiPatchSession: AIPatchSession | null;
  readonly aiPatchApproved: boolean;
  readonly builderSession: BuilderSession | null;
  readonly agentLoopSession: AgentLoopSession | null;
  readonly scanStatus: ScanStatus;
  readonly repository: RepositoryIndex | null;
  readonly appPreview: AppPreviewState;
  readonly patchAppPreview: (state: {
    url: string | null;
    running: boolean;
    root: string;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }) => void;
  readonly projectMemoryRef: AIPatchOrchestrationHost["projectMemoryRef"];
  readonly aiCallTrackerRef: ProviderInvokeOrchestrationHost["aiCallTrackerRef"];
  readonly fallbackResolverRef: ProviderInvokeOrchestrationHost["fallbackResolverRef"];
  readonly providerHealthInFlightRef: ProviderInvokeOrchestrationHost["providerHealthInFlightRef"];
  readonly providerHealthCacheRef: ProviderInvokeOrchestrationHost["providerHealthCacheRef"];
  readonly currentRunAnalyticsRef: ProviderInvokeOrchestrationHost["currentRunAnalyticsRef"];
  readonly lastRecordedAnalyticsKeyRef: ProviderInvokeOrchestrationHost["lastRecordedAnalyticsKeyRef"];
  readonly pipelineRunActiveRef: StudioActionOrchestrationHost["pipelineRunActiveRef"];
  readonly builderControlRef: BuilderOrchestrationHost["builderControlRef"];
  readonly builderSkipApprovalRef: BuilderOrchestrationHost["builderSkipApprovalRef"];
  readonly agentControlRef: AgentOrchestrationHost["agentControlRef"];
  readonly agentLastExecRef: AgentOrchestrationHost["agentLastExecRef"];
  readonly applyPlanActiveRunIdRef: ApplyPlanOrchestrationHost["applyPlanActiveRunIdRef"];
  readonly setVerifyStatus: VerificationOrchestrationHost["setVerifyStatus"];
  readonly setVerifyError: VerificationOrchestrationHost["setVerifyError"];
  readonly setVerification: VerificationOrchestrationHost["setVerification"];
  readonly setSessionMemory: BuildPipelineHost["setSessionMemory"];
  readonly setSessionMemoryDiagnostics: BuildPipelineHost["setSessionMemoryDiagnostics"];
  readonly setPendingPatch: SafeEditOrchestrationHost["setPendingPatch"];
  readonly setReviewing: SafeEditOrchestrationHost["setReviewing"];
  readonly setEditError: SafeEditOrchestrationHost["setEditError"];
  readonly setEditStatus: SafeEditOrchestrationHost["setEditStatus"];
  readonly setCanUndo: SafeEditOrchestrationHost["setCanUndo"];
  readonly setLastEditedPath: SafeEditOrchestrationHost["setLastEditedPath"];
  readonly setProviderStatus: ProviderInvokeOrchestrationHost["setProviderStatus"];
  readonly setProviderFallbackRequest: ProviderInvokeOrchestrationHost["setProviderFallbackRequest"];
  readonly setGreenfieldRun: StudioActionOrchestrationHost["setGreenfieldRun"];
  readonly setPlan: PlanningOrchestrationHost["setPlan"];
  readonly setAiPlan: BuildPipelineHost["setAiPlan"];
  readonly setAiPlanStatus: BuildPipelineHost["setAiPlanStatus"];
  readonly setLastPlanPrompt: PlanningOrchestrationHost["setLastPlanPrompt"];
  readonly setPlanApplyError: ApplyPlanOrchestrationHost["setPlanApplyError"];
  readonly setBuildError: NonNullable<ApplyPlanOrchestrationHost["setBuildError"]>;
  readonly setPlanApplySession: ApplyPlanOrchestrationHost["setPlanApplySession"];
  readonly setCenterTab: ApplyPlanOrchestrationHost["setCenterTab"];
  readonly setRailToolState: BuildPipelineHost["setRailTool"];
  readonly setPatchStatus: AIPatchOrchestrationHost["setPatchStatus"];
  readonly setPatchError: AIPatchOrchestrationHost["setPatchError"];
  readonly setAiPatchSession: AIPatchOrchestrationHost["setAiPatchSession"];
  readonly setAiPatchApproved: AIPatchOrchestrationHost["setAiPatchApproved"];
  readonly setAiPatchApplyStatus: AIPatchOrchestrationHost["setAiPatchApplyStatus"];
  readonly setAiPatchApplyError: AIPatchOrchestrationHost["setAiPatchApplyError"];
  readonly setExecutionSession: Dispatch<SetStateAction<ExecutionSession | null>>;
  readonly setExecutionError: ExecutionOrchestrationHost["setExecutionError"];
  readonly setBuilderSession: BuilderOrchestrationHost["setBuilderSession"];
  readonly setBuilderError: BuilderOrchestrationHost["setBuilderError"];
  readonly setAgentLoopSession: Dispatch<SetStateAction<AgentLoopSession | null>>;
  readonly setAgentLoopError: AgentOrchestrationHost["setAgentLoopError"];
  readonly setAutoFixSession: AutoFixOrchestrationHost["setAutoFixSession"];
  readonly appendGreenfieldRunLog: FailureReportOrchestrationHost["appendGreenfieldRunLog"];
  readonly updateGreenfieldRun: FailureReportOrchestrationHost["updateGreenfieldRun"];
  readonly beginStudioAction: BuildPipelineHost["beginStudioAction"];
  readonly finishStudioAction: BuildPipelineHost["finishStudioAction"];
  readonly publishFailureReport: ApplyPlanOrchestrationHost["publishFailureReport"];
  readonly resetAiCallTracker: StudioActionOrchestrationHost["resetAiCallTracker"];
  readonly refreshProviderStatus: StudioActionOrchestrationHost["refreshProviderStatus"];
  readonly persistAnalyticsRecord: StudioActionOrchestrationHost["persistAnalyticsRecord"];
  readonly offerMemoryCandidatesFromRun: StudioActionOrchestrationHost["offerMemoryCandidatesFromRun"];
  readonly createPlan: BuildPipelineHost["createPlan"];
  readonly runAIPlan: BuildPipelineHost["runAIPlan"];
  readonly clearRunContextForNewSubmit: BuildPipelineHost["clearRunContextForNewSubmit"];
  readonly archiveActiveRunContextAfterSuccess: NonNullable<
    ApplyPlanOrchestrationHost["archiveActiveRunContextAfterSuccess"]
  >;
  readonly startApplyPlan: BuildPipelineHost["startApplyPlan"];
  readonly approveAllPlanApplyFiles: BuildPipelineHost["approveAllPlanApplyFiles"];
  readonly applyApprovedPlanFiles: BuildPipelineHost["applyApprovedPlanFiles"];
  readonly cancelApplyPlan: BuildPipelineHost["cancelApplyPlan"];
  readonly executeApplyPlan: BuildPipelineHost["executeApplyPlan"];
  readonly startAutoFixAfterApply: ApplyPlanOrchestrationHost["startAutoFixAfterApply"];
  readonly approveAutoFixRepair: BuildPipelineHost["approveAutoFixRepair"];
  readonly commitContextCapture: ApplyPlanOrchestrationHost["commitContextCapture"];
  readonly invokePlannerCall: BuildPipelineHost["invokePlannerCall"];
  readonly invokeCoderCall: ApplyPlanOrchestrationHost["invokeCoderCall"];
  readonly invokeRepairCall: AutoFixOrchestrationHost["invokeRepairCall"];
  readonly refreshSmartFileSelection: BuildPipelineHost["refreshSmartFileSelection"];
  readonly resolveMemoriesForPrompt: (
    prompt: string,
    operation: "ai_plan" | "apply_plan" | "ai_patch" | "agent",
    files?: readonly string[],
  ) => MemoryRetrievalResult;
  readonly buildApplyPlanFailureReport: BuildPipelineHost["buildApplyPlanFailureReport"];
  readonly recordFollowUpUserMessage: BuildPipelineHost["recordFollowUpUserMessage"];
  readonly recordAgentUserMessage: BuildPipelineHost["recordAgentUserMessage"];
  readonly recordFollowUpFailureMessage: NonNullable<
    BuildPipelineHost["recordFollowUpFailureMessage"]
  >;
  readonly finalizeFollowUpActivityRunFromLogs: NonNullable<
    BuildPipelineHost["finalizeFollowUpActivityRun"]
  >;
  readonly attemptFollowUpAutoEscalation: NonNullable<
    BuildPipelineHost["attemptFollowUpAutoEscalation"]
  >;
  readonly resolveAgentRunBlockReason: BuildPipelineHost["getAgentRunBlockReason"];
  readonly syncAppContextBeforeEdit: NonNullable<
    BuildPipelineHost["syncAppContextBeforeEdit"]
  >;
  readonly releaseBuildRunForReview: NonNullable<
    ApplyPlanOrchestrationHost["releaseBuildRunForReview"]
  >;
  readonly beginApplyPlanRun: ApplyPlanOrchestrationHost["beginApplyPlanRun"];
  readonly isStaleApplyPlanRun: ApplyPlanOrchestrationHost["isStaleApplyPlanRun"];
  readonly ignoreStaleApplyPlanResult: ApplyPlanOrchestrationHost["ignoreStaleApplyPlanResult"];
  readonly completeApplyPlanRun: ApplyPlanOrchestrationHost["completeApplyPlanRun"];
  readonly requestPreviewTab: ApplyPlanOrchestrationHost["requestPreviewTab"];
  readonly recordSmartFileHistory: ApplyPlanOrchestrationHost["recordSmartFileHistory"];
  readonly setFollowUpCheckpoint: NonNullable<
    ApplyPlanOrchestrationHost["saveFollowUpCheckpoint"]
  >;
  readonly recordFollowUpStudioMessage: (
    text: string,
    meta?: {
      filesModified?: readonly string[];
      provider?: string;
      model?: string;
      durationMs?: number;
      previewReady?: boolean;
      prompt?: string;
      typecheckPassed?: boolean;
      buildPassed?: boolean;
      verification?: VerificationResult | null;
      planSummary?: string;
      snapshotFiles?: readonly import("@/core/build/followUpCheckpoint").FollowUpCheckpointFile[];
    },
  ) => void;
  readonly openPath: SafeEditOrchestrationHost["openPath"];
  readonly runScan: () => Promise<void>;
  readonly pushAgent: ApplyPlanOrchestrationHost["pushAgent"];
  readonly executeAIPlanForPrompt: BuilderOrchestrationHost["executeAIPlanForPrompt"];
  readonly createExecutionSessionFromPlans: BuilderOrchestrationHost["createExecutionSessionFromPlans"];
  readonly executeMultiFileLoop: BuilderOrchestrationHost["executeMultiFileLoop"];
  readonly runAutoFixAutomatic: BuilderOrchestrationHost["runAutoFixAutomatic"];
  readonly runAgentFollowUp: NonNullable<BuildPipelineHost["runAgentFollowUp"]>;
}

type SafeEditOrchestrationHost = import("@/app/orchestration/safeEditTypes").SafeEditOrchestrationHost;

function buildApplyPlanRecordFollowUpMessage(
  input: SyncOrchestrationHostsInput,
): NonNullable<ApplyPlanOrchestrationHost["recordFollowUpStudioMessage"]> {
  return (text, meta) =>
    input.recordFollowUpStudioMessage(text, {
      ...(meta?.filesModified ? { filesModified: meta.filesModified } : {}),
      ...(meta?.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
      ...(meta?.provider ?? input.greenfieldRun.provider
        ? { provider: meta?.provider ?? input.greenfieldRun.provider ?? "" }
        : {}),
      ...(meta?.model ?? input.greenfieldRun.model
        ? { model: meta?.model ?? input.greenfieldRun.model ?? "" }
        : {}),
      ...(meta?.typecheckPassed !== undefined
        ? { typecheckPassed: meta.typecheckPassed }
        : {}),
      ...(meta?.buildPassed !== undefined ? { buildPassed: meta.buildPassed } : {}),
      ...(meta?.verification !== undefined ? { verification: meta.verification } : {}),
      ...(meta?.snapshotFiles ? { snapshotFiles: meta.snapshotFiles } : {}),
      previewReady: input.appPreview.running || Boolean(input.appPreview.url),
      ...(input.lastPlanPrompt ? { prompt: input.lastPlanPrompt } : {}),
      planSummary: text,
    });
}

/**
 * Refreshes all orchestration host refs with the latest workspace callbacks.
 * Called once per render from WorkspaceProvider.
 */
export function syncOrchestrationHosts(
  refs: OrchestrationHostRefs,
  input: SyncOrchestrationHostsInput,
): void {
  const {
    orchestrationHostRef,
    applyPlanHostRef,
    planningHostRef,
    aiPatchHostRef,
    executionHostRef,
    builderHostRef,
    agentHostRef,
    autoFixHostRef,
    studioActionHostRef,
    providerInvokeHostRef,
    providerInvokeStopRef,
    providerRequestSentRef,
    failureReportHostRef,
    verificationHostRef,
    safeEditHostRef,
  } = refs;

  failureReportHostRef.current = {
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    updateGreenfieldRun: input.updateGreenfieldRun,
  };

  verificationHostRef.current = {
    api: input.api,
    setVerifyStatus: input.setVerifyStatus,
    setVerifyError: input.setVerifyError,
    setVerification: input.setVerification,
    setSessionMemory: input.setSessionMemory,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    publishFailureReport: input.publishFailureReport,
    updateGreenfieldRun: input.updateGreenfieldRun,
  };

  safeEditHostRef.current = {
    api: input.api,
    editTarget: input.editTarget,
    activeFile: input.activeFile,
    activePath: input.activePath,
    pendingPatch: input.pendingPatch,
    reviewing: input.reviewing,
    setPendingPatch: input.setPendingPatch,
    setReviewing: input.setReviewing,
    setEditError: input.setEditError,
    setEditStatus: input.setEditStatus,
    setCanUndo: input.setCanUndo,
    setLastEditedPath: input.setLastEditedPath,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    openPath: input.openPath,
    runScan: input.runScan,
  };

  providerInvokeHostRef.current = {
    api: input.api,
    aiCallTrackerRef: input.aiCallTrackerRef,
    fallbackResolverRef: input.fallbackResolverRef,
    providerHealthInFlightRef: input.providerHealthInFlightRef,
    providerHealthCacheRef: input.providerHealthCacheRef,
    currentRunAnalyticsRef: input.currentRunAnalyticsRef,
    lastRecordedAnalyticsKeyRef: input.lastRecordedAnalyticsKeyRef,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    setProviderStatus: input.setProviderStatus,
    setProviderFallbackRequest: input.setProviderFallbackRequest,
    providerInvokeStopRef,
    providerRequestSentRef,
  };

  studioActionHostRef.current = {
    projectPath: input.project?.path ?? null,
    greenfieldRun: input.greenfieldRun,
    pipelineRunActiveRef: input.pipelineRunActiveRef,
    updateGreenfieldRun: input.updateGreenfieldRun,
    setGreenfieldRun: input.setGreenfieldRun,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    resetAiCallTracker: input.resetAiCallTracker,
    refreshProviderStatus: input.refreshProviderStatus,
    persistAnalyticsRecord: input.persistAnalyticsRecord,
    offerMemoryCandidatesFromRun: input.offerMemoryCandidatesFromRun,
  };

  orchestrationHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    sessionMemory: input.sessionMemory,
    aiPlanStatus: input.aiPlanStatus,
    planApplySession: input.planApplySession,
    autoFixSession: input.autoFixSession,
    lastPlanPrompt: input.lastPlanPrompt,
    projectMemory: input.projectMemory,
    createPlanErrorRef: input.createPlanErrorRef,
    editExplorationContentsRef: input.editExplorationContentsRef,
    aiPlanRef: input.aiPlanRef,
    lastContextSnapshotIdRef: input.lastContextSnapshotIdRef,
    pipelineCoderResultRef: input.pipelineCoderResultRef,
    createPlan: input.createPlan,
    runAIPlan: input.runAIPlan,
    clearRunContextForNewSubmit: input.clearRunContextForNewSubmit,
    startApplyPlan: input.startApplyPlan,
    approveAllPlanApplyFiles: input.approveAllPlanApplyFiles,
    applyApprovedPlanFiles: input.applyApprovedPlanFiles,
    cancelApplyPlan: input.cancelApplyPlan,
    executeApplyPlan: input.executeApplyPlan,
    startAutoFixAfterApply: input.startAutoFixAfterApply,
    approveAutoFixRepair: input.approveAutoFixRepair,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    commitContextCapture: input.commitContextCapture,
    invokePlannerCall: input.invokePlannerCall,
    refreshSmartFileSelection: input.refreshSmartFileSelection,
    resolveMemoriesForPrompt: input.resolveMemoriesForPrompt,
    setSessionMemory: input.setSessionMemory,
    setSessionMemoryDiagnostics: input.setSessionMemoryDiagnostics,
    setAiPlan: input.setAiPlan,
    setAiPlanStatus: input.setAiPlanStatus,
    setCenterTab: input.setCenterTab,
    setRailTool: input.setRailToolState,
    buildApplyPlanFailureReport: input.buildApplyPlanFailureReport,
    recordFollowUpUserMessage: input.recordFollowUpUserMessage,
    recordAgentUserMessage: input.recordAgentUserMessage,
    recordFollowUpFailureMessage: input.recordFollowUpFailureMessage,
    finalizeFollowUpActivityRun: input.finalizeFollowUpActivityRunFromLogs,
    attemptFollowUpAutoEscalation: input.attemptFollowUpAutoEscalation,
    greenfieldRun: input.greenfieldRun,
    buildRunning: input.buildRunning,
    pipelineRunning: input.pipelineRunning,
    greenfieldPanelActive: input.agentGreenfieldPanelActive,
    getAgentRunBlockReason: input.resolveAgentRunBlockReason,
    releaseBuildRunForReview: input.releaseBuildRunForReview,
    setPlanApplySession: input.setPlanApplySession,
    setPlanApplyError: input.setPlanApplyError,
    updateGreenfieldRun: input.updateGreenfieldRun,
    refreshProviderStatus: input.refreshProviderStatus,
    syncAppContextBeforeEdit: input.syncAppContextBeforeEdit,
    runAgentFollowUp: input.runAgentFollowUp,
  };

  planningHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    plan: input.plan,
    lastPlanPrompt: input.lastPlanPrompt,
    sessionMemory: input.sessionMemory,
    projectMemory: input.projectMemory,
    projectIntelligence: input.projectIntelligence,
    greenfieldRun: input.greenfieldRun,
    planRef: input.planRef,
    aiPlanRef: input.aiPlanRef,
    createPlanErrorRef: input.createPlanErrorRef,
    editExplorationContentsRef: input.editExplorationContentsRef,
    setPlan: input.setPlan,
    setSessionMemory: input.setSessionMemory,
    setSessionMemoryDiagnostics: input.setSessionMemoryDiagnostics,
    setAiPlan: input.setAiPlan,
    setAiPlanStatus: input.setAiPlanStatus,
    setLastPlanPrompt: input.setLastPlanPrompt,
    refreshSmartFileSelection: input.refreshSmartFileSelection,
    pushAgent: input.pushAgent,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    updateGreenfieldRun: input.updateGreenfieldRun,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    resolveMemoriesForPrompt: input.resolveMemoriesForPrompt,
    commitContextCapture: input.commitContextCapture,
    invokePlannerCall: input.invokePlannerCall,
  };

  aiPatchHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    activeFile: input.activeFile as ActiveOpenFile | null,
    sessionMemory: input.sessionMemory,
    projectMemoryRef: input.projectMemoryRef,
    aiPatchSession: input.aiPatchSession,
    aiPatchApproved: input.aiPatchApproved,
    setPatchStatus: input.setPatchStatus,
    setPatchError: input.setPatchError,
    setAiPatchSession: input.setAiPatchSession,
    setAiPatchApproved: input.setAiPatchApproved,
    setAiPatchApplyStatus: input.setAiPatchApplyStatus,
    setAiPatchApplyError: input.setAiPatchApplyError,
    setCanUndo: input.setCanUndo,
    setLastEditedPath: input.setLastEditedPath,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    updateGreenfieldRun: input.updateGreenfieldRun,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    resolveMemoriesForPrompt: input.resolveMemoriesForPrompt,
    commitContextCapture: input.commitContextCapture,
    invokeCoderCall: input.invokeCoderCall,
    openPath: input.openPath,
    runScan: input.runScan,
  };

  executionHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    plan: input.plan,
    aiPlan: input.aiPlan,
    lastPlanPrompt: input.lastPlanPrompt,
    sessionMemory: input.sessionMemory,
    projectMemoryRef: input.projectMemoryRef,
    verification: input.verification,
    executionSession: input.executionSession,
    applyPlanSuccessRef: input.applyPlanSuccessRef,
    executionNoChangeGuardRef: input.executionNoChangeGuardRef,
    setExecutionSession: input.setExecutionSession,
    setExecutionError: input.setExecutionError,
    setVerification: input.setVerification,
    setVerifyStatus: input.setVerifyStatus,
    setRailTool: input.setRailToolState,
    pushAgent: input.pushAgent,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    resolveMemoriesForPrompt: input.resolveMemoriesForPrompt,
    invokeCoderCall: input.invokeCoderCall,
    runScan: input.runScan,
  };

  builderHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    sessionMemory: input.sessionMemory,
    projectMemoryRef: input.projectMemoryRef,
    builderSession: input.builderSession,
    builderControlRef: input.builderControlRef,
    builderSkipApprovalRef: input.builderSkipApprovalRef,
    setBuilderSession: input.setBuilderSession,
    setBuilderError: input.setBuilderError,
    setRailTool: input.setRailToolState,
    setPlan: input.setPlan,
    setLastPlanPrompt: input.setLastPlanPrompt,
    setSessionMemory: input.setSessionMemory,
    setSessionMemoryDiagnostics: input.setSessionMemoryDiagnostics,
    setExecutionSession: input.setExecutionSession,
    pushAgent: input.pushAgent,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    runScan: input.runScan,
    refreshSmartFileSelection: input.refreshSmartFileSelection,
    executeAIPlanForPrompt: input.executeAIPlanForPrompt,
    createExecutionSessionFromPlans: input.createExecutionSessionFromPlans,
    executeMultiFileLoop: input.executeMultiFileLoop,
    runAutoFixAutomatic: input.runAutoFixAutomatic,
  };

  agentHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    scanStatus: input.scanStatus,
    repository: input.repository,
    plan: input.plan,
    aiPlan: input.aiPlan,
    lastPlanPrompt: input.lastPlanPrompt,
    verification: input.verification,
    agentLoopSession: input.agentLoopSession,
    agentControlRef: input.agentControlRef,
    agentLastExecRef: input.agentLastExecRef,
    applyPlanSuccessRef: input.applyPlanSuccessRef,
    createPlanErrorRef: input.createPlanErrorRef,
    editExplorationContentsRef: input.editExplorationContentsRef,
    setAgentLoopSession: input.setAgentLoopSession,
    setAgentLoopError: input.setAgentLoopError,
    setExecutionSession: input.setExecutionSession,
    setVerification: input.setVerification,
    setVerifyStatus: input.setVerifyStatus,
    setVerifyError: input.setVerifyError,
    setRailTool: input.setRailToolState,
    pushAgent: input.pushAgent,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    createPlan: input.createPlan,
    executeAIPlanForPrompt: input.executeAIPlanForPrompt,
    createExecutionSessionFromPlans: input.createExecutionSessionFromPlans,
    executeMultiFileLoop: input.executeMultiFileLoop,
    runAutoFixAutomatic: input.runAutoFixAutomatic,
  };

  autoFixHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    autoFixSession: input.autoFixSession,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    setAutoFixSession: input.setAutoFixSession,
    setVerification: input.setVerification,
    setVerifyStatus: input.setVerifyStatus,
    setPlanApplyError: input.setPlanApplyError,
    setPlanApplySession: input.setPlanApplySession,
    setSessionMemory: input.setSessionMemory,
    pushAgent: input.pushAgent,
    runScan: input.runScan,
    invokeRepairCall: input.invokeRepairCall,
  };

  applyPlanHostRef.current = {
    api: input.api,
    project: input.project,
    scan: input.scan,
    plan: input.plan,
    aiPlan: input.aiPlan,
    lastPlanPrompt: input.lastPlanPrompt,
    sessionMemory: input.sessionMemory,
    planApplySession: input.planApplySession,
    projectMemory: input.projectMemory,
    planRef: input.planRef,
    aiPlanRef: input.aiPlanRef,
    aiCallTrackerRef: input.aiCallTrackerRef,
    applyPlanSuccessRef: input.applyPlanSuccessRef,
    executionNoChangeGuardRef: input.executionNoChangeGuardRef,
    pipelineCoderResultRef: input.pipelineCoderResultRef,
    lastContextSnapshotIdRef: input.lastContextSnapshotIdRef,
    setPlanApplyError: input.setPlanApplyError,
    setBuildError: input.setBuildError,
    releaseBuildRunForReview: input.releaseBuildRunForReview,
    setPlanApplySession: input.setPlanApplySession,
    setCenterTab: input.setCenterTab,
    beginStudioAction: input.beginStudioAction,
    finishStudioAction: input.finishStudioAction,
    updateGreenfieldRun: input.updateGreenfieldRun,
    publishFailureReport: input.publishFailureReport,
    appendGreenfieldRunLog: input.appendGreenfieldRunLog,
    beginApplyPlanRun: input.beginApplyPlanRun,
    isStaleApplyPlanRun: input.isStaleApplyPlanRun,
    ignoreStaleApplyPlanResult: input.ignoreStaleApplyPlanResult,
    resolveMemoriesForPrompt: input.resolveMemoriesForPrompt,
    commitContextCapture: input.commitContextCapture,
    uiAuditResult: input.greenfieldRun.uiAuditResult,
    invokeCoderCall: input.invokeCoderCall,
    agentControlRef: input.agentControlRef,
    setAgentLoopSession: input.setAgentLoopSession,
    setExecutionSession: input.setExecutionSession,
    pushAgent: input.pushAgent,
    applyPlanActiveRunIdRef: input.applyPlanActiveRunIdRef,
    completeApplyPlanRun: input.completeApplyPlanRun,
    setSessionMemory: input.setSessionMemory,
    setVerification: input.setVerification,
    setVerifyStatus: input.setVerifyStatus,
    runScan: input.runScan,
    requestPreviewTab: input.requestPreviewTab,
    setAppPreview: input.patchAppPreview,
    recordSmartFileHistory: input.recordSmartFileHistory,
    startAutoFixAfterApply: input.startAutoFixAfterApply,
    setCanUndo: input.setCanUndo,
    setLastEditedPath: input.setLastEditedPath,
    saveFollowUpCheckpoint: input.setFollowUpCheckpoint,
    recordFollowUpStudioMessage: buildApplyPlanRecordFollowUpMessage(input),
    archiveActiveRunContextAfterSuccess: input.archiveActiveRunContextAfterSuccess,
    greenfieldRun: input.greenfieldRun,
  };
}
