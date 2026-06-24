import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { BryantLabsApi, VerificationResult } from "@/types";
import {
  buildRepositoryIndex,
  computeRepositoryRelevance,
  enrichProjectScan,
  findSymbolReferences,
  rankSmartFiles,
  searchRepository,
} from "@/core/repository";
import {
  detectPromptIntent,
  intentFeatureTags,
  recordFileHistory,
  type SmartFileSelectionResult,
} from "@/core/fileSelection";
import {
  loadAnalyticsHistory,
} from "@/core/analytics";
import {
  createElectronRunCheckpointPort,
  loadRunCheckpointAsync,
  setRunCheckpointStorePort,
} from "@/core/runPersistence";
import { resolveEffectiveProjectScan } from "@/core/agent/resolveEffectiveProjectScan";
import { normalizeProjectMemory } from "@/core/projectMemory/store";
import {
  EMPTY_PROJECT_MEMORY,
} from "@/core/projectMemory/types";
import {
  computeMemoryAnalytics,
  loadAgentMemoryFromDisk,
  normalizeAgentMemoryStore,
  saveAgentMemoryToDisk,
  seedStoreFromLegacyProjectMemory,
} from "@/core/memory";
import { MemorySuggestionDialog } from "@/components/MemorySuggestionDialog";
import { ResumeRunDialog } from "@/components/ResumeRunDialog";
import { ProviderFallbackDialog } from "@/components/ProviderFallbackDialog";
import { getAgentStartDisabledState } from "@/core/agent/agentReadiness";
import { WorkspaceErrorBoundary } from "@/components/WorkspaceErrorBoundary";
import {
  clearSessionMemory as clearMemoryScope,
  effectivePlanPrompt,
  emptySessionMemory,
  setProjectContext,
  type SessionMemoryClearScope,
  type SessionMemoryDiagnostics,
  type SessionMemorySnapshot,
} from "@/core/sessionMemory";
import type { Patch } from "@/core/editor";
import {
  executionLogService,
  type ExecutionLogState,
} from "@/core/console/executionLogService";
import { loadPanelLayout } from "@/core/layout/panelLayout";
import {
  usePreviewWorkspaceState,
  useProjectMemoryWorkspaceState,
  useProviderWorkspaceState,
  useWorkspaceProjectState,
  useGreenfieldRun,
  useAgentLoopWorkspaceState,
  useCheckpointWorkspaceState,
  useWorkspacePlanState,
  useWorkspaceOrchestration,
  useOrchestrationHostSync,
} from "@/app/workspace";
import { useWorkspaceStudioActions } from "@/app/workspace/useWorkspaceStudioActions";
import { useWorkspaceRunContextReset } from "@/app/workspace/useWorkspaceRunContextReset";
import { useWorkspacePlanApplyControls } from "@/app/workspace/useWorkspacePlanApplyControls";
import { useWorkspaceProjectOpen } from "@/app/workspace/useWorkspaceProjectOpen";
import { useWorkspaceFollowUpRecording } from "@/app/workspace/useWorkspaceFollowUpRecording";
import { useWorkspaceGreenfieldRunHelpers } from "@/app/workspace/useWorkspaceGreenfieldRunHelpers";
import { useWorkspaceRunCheckpointActions } from "@/app/workspace/useWorkspaceRunCheckpointActions";
import { useWorkspaceAgentRunGates } from "@/app/workspace/useWorkspaceAgentRunGates";
import { useWorkspaceContextInspector, loadContextHistory } from "@/app/workspace/useWorkspaceContextInspector";
import { useWorkspaceAnalyticsActions } from "@/app/workspace/useWorkspaceAnalyticsActions";
import { useWorkspaceAgentMemoryActions } from "@/app/workspace/useWorkspaceAgentMemoryActions";
import { useWorkspaceGitWorkspace } from "@/app/workspace/useWorkspaceGitWorkspace";
import { useWorkspaceEditSurface } from "@/app/workspace/useWorkspaceEditSurface";
import { useWorkspaceAgentSessionActions } from "@/app/workspace/useWorkspaceAgentSessionActions";
import { useProjectIntelligenceWorkspaceState } from "@/app/workspace/useProjectIntelligenceState";
import { useWorkspaceStudioTestHooks } from "@/app/workspace/useWorkspaceStudioTestHooks";
import { buildApplyPlanFailureReport } from "@/core/diagnostics/failureReport";
import {
  loadFollowUpChat,
} from "@/core/build/followUpChat";
import {
  type FollowUpSuccessSnapshot,
} from "@/core/build/followUpRun";
import {
  type FollowUpCheckpoint,
} from "@/core/build/followUpCheckpoint";
import {
  loadFollowUpActivityRuns,
  type FollowUpActivityRun,
} from "@/core/build/followUpActivityLog";
import {
  loadFollowUpSnapshots,
  type FollowUpSnapshot,
} from "@/core/build/followUpSnapshots";
import { buildOrchestrationSyncInput } from "@/app/workspace/buildOrchestrationSyncInput";
import { useAgentRunWorkspaceContext } from "@/app/workspace/useAgentRunWorkspaceContext";
import { useRunInspectorController } from "@/app/workspace/useRunInspectorController";
import { useDiagnosticReportController } from "@/app/workspace/useDiagnosticReportController";
import { useRunCompareController } from "@/app/workspace/useRunCompareController";
import { useWorkspaceDirectEdit } from "@/app/workspace/useWorkspaceDirectEdit";
import { useWorkspaceContextValue } from "@/app/workspace/useWorkspaceContextValue";
import { useProjectProblems } from "@/hooks/useProjectProblems";
import type { ProjectProblem } from "@/core/diagnostics/projectProblems";
import type { WorkspaceState, EditStatus } from "@/app/workspace/workspaceState";
import type { EditTarget } from "@/app/workspace/workspaceState";
import { useFollowUpChatState } from "@/app/workspace/useFollowUpChatState";
import { useAgentChatRecording } from "@/app/workspace/useAgentChatRecording";
import type { ProjectHealthSnapshot } from "@/core/build/projectHealth";
import {
  buildCurrentAppContext,
} from "@/core/agent/agentAppContext";
import { auditProjectForEdit } from "@/core/agent/projectEditAudit";
import { deriveProjectFacts } from "@/core/build/projectFacts";
import {
  type FollowUpEscalationState,
} from "@/core/build/providerAutoEscalation";
import {
  ProjectIntelligenceService,
  loadFeatureInventoryFromDisk,
  saveFeatureInventoryToDisk,
  buildFeatureInventoryFromScan,
  type ComplexityRoutingDecision,
  type FeatureInventorySnapshot,
  type FeasibilityResult,
} from "@/core/intelligence";
import {
  loadSessionMemoryFromDisk,
  saveSessionMemoryToDisk,
} from "@/core/sessionMemory/persist";
import { setIntelligenceHost } from "@/app/intelligence/intelligenceHost";

type VerifyStatus = "idle" | "running" | "done" | "error";

const WorkspaceContext = createContext<WorkspaceState | null>(null);

function getApi(): BryantLabsApi | undefined {
  return window.bryantlabs;
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const api = getApi();

  const {
    providerStatus,
    setProviderStatus,
    providerHealthInFlightRef,
    providerHealthCacheRef,
    aiCallTrackerRef,
    fallbackResolverRef,
    pendingFallbackRequest: providerFallbackRequest,
    setPendingFallbackRequest: setProviderFallbackRequest,
    analyticsHistory,
    setAnalyticsHistory,
    selectedAnalyticsId,
    setSelectedAnalyticsId,
    currentRunAnalyticsRef,
    lastRecordedAnalyticsKeyRef,
  } = useProviderWorkspaceState();

  const {
    projectMemory,
    setProjectMemory,
    projectMemoryError,
    setProjectMemoryError,
    projectMemoryRef,
    agentMemoryStore,
    setAgentMemoryStore,
    agentMemoryStoreRef,
    lastMemoryRetrieval,
    setLastMemoryRetrieval,
    pendingMemoryCandidates,
    setPendingMemoryCandidates,
  } = useProjectMemoryWorkspaceState();

  const {
    project,
    setProject,
    activeFile,
    setActiveFile,
    activePath,
    setActivePath,
    openFileTabs,
    setOpenFileTabs,
    openFilesByPath,
    setOpenFilesByPath,
    fileStatus,
    setFileStatus,
    error,
    setError,
    scan,
    setScan,
    scanStatus,
    setScanStatus,
    projectIndexStatus,
    setProjectIndexStatus,
    gitStatus,
    setGitStatus,
    gitStatusLoading,
    setGitStatusLoading,
    gitActionError,
    setGitActionError,
    selectedGitPath,
    setSelectedGitPath,
    gitDiff,
    setGitDiff,
    gitDiffLoading,
    setGitDiffLoading,
    gitDiffError,
    setGitDiffError,
    railTool,
    setRailToolState,
    commandPaletteOpen,
    setCommandPaletteOpen,
    dockOpen,
    setDockOpen,
    insightsTab,
    setInsightsTab,
    centerTab,
    setCenterTab,
    dockTab,
    setDockTab,
    editorReveal,
    setEditorReveal,
  } = useWorkspaceProjectState();

  const {
    projectIntelligence,
    setProjectIntelligence,
  } = useProjectIntelligenceWorkspaceState(project?.path, project?.name ?? null);

  const checkpointInputGetterRef = useRef<
    () => import("@/core/runPersistence/types").RunCheckpointInput | null
  >(() => null);
  const getCheckpointInputForHook = useCallback(
    () => checkpointInputGetterRef.current(),
    [],
  );
  const {
    pendingRunCheckpoint,
    setPendingRunCheckpoint,
    settleRunCheckpoint,
    syncRunCheckpoint,
  } = useCheckpointWorkspaceState(project?.path, getCheckpointInputForHook);

  const recordSmartFileHistory = useCallback(
    (prompt: string, paths: readonly string[], success: boolean) => {
      if (!paths.length) return;
      const intent = detectPromptIntent(prompt);
      recordFileHistory({
        projectPath: project?.path ?? null,
        paths,
        prompt,
        featureTags: intentFeatureTags(intent),
        success,
      });
    },
    [project?.path],
  );
  const [smartFileSelection, setSmartFileSelection] =
    useState<SmartFileSelectionResult | null>(null);
  const {
    plan,
    setPlan,
    planRef,
    aiPlan,
    setAiPlan,
    aiPlanRef,
    aiPlanStatus,
    setAiPlanStatus,
    lastPlanPrompt,
    setLastPlanPrompt,
    planApplySession,
    setPlanApplySession,
    planApplyError,
    setPlanApplyError,
    executionSession,
    setExecutionSession,
    executionError,
    setExecutionError,
    builderSession,
    setBuilderSession,
    builderError,
    setBuilderError,
    builderControlRef,
    builderSkipApprovalRef,
    autoFixSession,
    setAutoFixSession,
    aiPatchSession,
    setAiPatchSession,
    patchStatus,
    setPatchStatus,
    patchError,
    setPatchError,
    aiPatchApproved,
    setAiPatchApproved,
    aiPatchApplyStatus,
    setAiPatchApplyStatus,
    aiPatchApplyError,
    setAiPatchApplyError,
    applyPlanSuccessRef,
    applyPlanActiveRunIdRef,
    applyPlanCompletedRunIdRef,
    lastContextSnapshotIdRef,
    editExplorationContentsRef,
    pipelineCoderResultRef,
    executionNoChangeGuardRef,
    createPlanErrorRef,
  } = useWorkspacePlanState();
  const {
    followUpChat,
    setFollowUpChat,
    setPendingAgentChat,
    agentChat,
  } = useFollowUpChatState(project?.path);
  const [followUpCheckpoint, setFollowUpCheckpoint] = useState<FollowUpCheckpoint | null>(
    null,
  );
  const [followUpSuccess, setFollowUpSuccess] = useState<FollowUpSuccessSnapshot | null>(
    null,
  );
  const [followUpSnapshots, setFollowUpSnapshots] = useState<FollowUpSnapshot[]>([]);
  const [followUpActivityRuns, setFollowUpActivityRuns] = useState<FollowUpActivityRun[]>(
    [],
  );
  const [projectHealth, setProjectHealth] = useState<ProjectHealthSnapshot | null>(null);
  const [followUpEscalation, setFollowUpEscalation] = useState<FollowUpEscalationState | null>(
    null,
  );
  const [featureInventory, setFeatureInventory] = useState<FeatureInventorySnapshot | null>(null);
  const [complexityRouting, setComplexityRouting] =
    useState<ComplexityRoutingDecision | null>(null);
  const {
    greenfieldRun,
    setGreenfieldRun,
    greenfieldRunControlRef,
    updateGreenfieldRun,
    resetGreenfieldRun,
    agentGreenfieldPanelActive,
    setAgentGreenfieldPanelActive,
  } = useGreenfieldRun();
  const {
    agentSession,
    setAgentSession,
    agentLoopSession,
    setAgentLoopSession,
    agentLoopError,
    setAgentLoopError,
    agentControlRef,
    agentLastExecRef,
  } = useAgentLoopWorkspaceState();

  const effectiveScan = useMemo(
    () =>
      resolveEffectiveProjectScan({
        scan,
        projectPath: project?.path ?? null,
        greenfieldRun,
      }),
    [scan, project?.path, greenfieldRun],
  );

  const repository = useMemo(
    () => (effectiveScan ? buildRepositoryIndex(effectiveScan) : null),
    [effectiveScan],
  );

  const repositorySearchFn = useCallback(
    (query: string) =>
      repository ? searchRepository(repository, query) : [],
    [repository],
  );

  const findSymbolReferencesFn = useCallback(
    (symbolName: string) =>
      repository ? findSymbolReferences(repository, symbolName) : [],
    [repository],
  );

  const repositoryRelevanceFn = useCallback(
    (prompt: string) => {
      if (!effectiveScan || !prompt.trim()) return null;
      return computeRepositoryRelevance(prompt, effectiveScan);
    },
    [effectiveScan],
  );

  const refreshSmartFileSelection = useCallback(
    (prompt: string, memory: SessionMemorySnapshot) => {
      if (!effectiveScan || !prompt.trim()) {
        setSmartFileSelection(null);
        return;
      }
      const effective = effectivePlanPrompt(prompt.trim(), memory);
      void (async () => {
        let semanticBoostPaths: string[] = [];
        if (api?.semanticSearch) {
          try {
            const hits = await api.semanticSearch(effective, 12);
            semanticBoostPaths = hits.map((h) => h.path);
          } catch {
            semanticBoostPaths = [];
          }
        }
        setSmartFileSelection(
          rankSmartFiles(effective, effectiveScan, {
            projectPath: project?.path ?? null,
            projectMemory: projectMemoryRef.current,
            sessionMemory: memory,
            semanticBoostPaths,
          }),
        );
      })();
    },
    [api, effectiveScan, project?.path],
  );

  const intelligenceServiceRef = useRef(new ProjectIntelligenceService(emptySessionMemory()));
  const followUpRunStartedAtRef = useRef<number | null>(null);
  const followUpActivityRunRef = useRef<FollowUpActivityRun | null>(null);
  const followUpEscalatedRef = useRef(false);
  const [sessionMemory, setSessionMemory] = useState<SessionMemorySnapshot>(
    emptySessionMemory(),
  );
  const sessionMemoryRef = useRef(sessionMemory);
  sessionMemoryRef.current = sessionMemory;
  const [sessionMemoryDiagnostics, setSessionMemoryDiagnostics] =
    useState<SessionMemoryDiagnostics | null>(null);
  const {
    refs: orchestrationRefs,
    actions: orchestrationActions,
    pipeline: orchestration,
  } = useWorkspaceOrchestration({
    aiPlanStatus,
    planApplyPhase: planApplySession?.phase ?? null,
    autoFixPhase: autoFixSession?.phase ?? null,
    lastPlanPrompt,
    planApplySession,
  });
  const {
    providerInvokeHostRef,
    providerInvokeStopRef,
    providerRequestSentRef,
  } = orchestrationRefs;
  const { publishFailureReport, beginStudioAction, finishStudioAction } =
    useWorkspaceStudioActions({
      orchestrationRefs,
      projectPath: project?.path,
      settleRunCheckpoint,
    });
  const {
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
  } = orchestrationActions;
  const {
    pipelineSession,
    pipelineRunning,
    pipelineError,
    pipelineRunActiveRef,
    buildRunning,
    buildError,
    buildMode,
    buildStatus,
    runMultiAgentPipeline,
    continueMultiAgentPipeline,
    continueMultiAgentPipelineRepair,
    cancelMultiAgentPipeline,
    runBuildLoop,
    continueBuildAfterReview,
    cancelBuildLoop,
    retryApplyPlanReview,
    restorePipelineCheckpoint,
    resumeMultiAgentPipeline,
    resumeBuildReview,
    setBuildError,
    releaseBuildRunForReview,
  } = orchestration;
  const {
    appPreview,
    previewTabNonce,
    requestPreviewTab,
    patchAppPreview,
  } = usePreviewWorkspaceState(setCenterTab);
  const [developerConsoleEnabled, setDeveloperConsoleEnabledState] = useState(
    () => executionLogService.getState().enabled,
  );
  const [developerConsole, setDeveloperConsole] = useState<ExecutionLogState>(
    () => executionLogService.getState(),
  );
  const memoryAnalytics = useMemo(
    () => computeMemoryAnalytics(agentMemoryStore),
    [agentMemoryStore],
  );

  const {
    contextSnapshot,
    setContextSnapshot,
    contextInspectorDraft,
    setContextInspectorDraft,
    contextHistory,
    setContextHistory,
    selectedContextId,
    setSelectedContextId,
    showContextRequestPreview,
    setShowContextRequestPreview,
    commitContextCapture,
    refreshContextInspectorDraft,
    selectContextSnapshot: selectContextSnapshotFn,
  } = useWorkspaceContextInspector({
    effectiveScan,
    projectPath: project?.path,
    sessionMemory,
    projectMemoryRef,
    providerHealthCacheRef,
    currentRunAnalyticsRef,
    lastContextSnapshotIdRef,
    lastPlanPrompt,
    plan,
    greenfieldRun,
  });

  const {
    persistAnalyticsRecord,
    selectAnalyticsRecord: selectAnalyticsRecordFn,
    openAnalyticsFromDashboard,
  } = useWorkspaceAnalyticsActions({
    projectPath: project?.path,
    setAnalyticsHistory,
    setSelectedAnalyticsId,
    setSelectedContextId,
    setRailToolState,
    currentRunAnalyticsRef,
    lastRecordedAnalyticsKeyRef,
  });

  const {
    saveProjectMemory: saveProjectMemoryFn,
    resolveMemoriesForPrompt,
    addAgentMemoryRecord: addAgentMemoryRecordFn,
    updateAgentMemoryRecord: updateAgentMemoryRecordFn,
    deleteAgentMemoryRecord: deleteAgentMemoryRecordFn,
    setAgentMemoryAutoSave: setAgentMemoryAutoSaveFn,
    acceptMemoryCandidate: acceptMemoryCandidateFn,
    acceptAllMemoryCandidates: acceptAllMemoryCandidatesFn,
    rejectMemoryCandidates: rejectMemoryCandidatesFn,
    exportAgentMemoryJson: exportAgentMemoryJsonFn,
    importAgentMemoryJson: importAgentMemoryJsonFn,
    offerMemoryCandidatesFromRun,
  } = useWorkspaceAgentMemoryActions({
    api,
    projectPath: project?.path,
    scan,
    projectMemoryRef,
    agentMemoryStoreRef,
    setProjectMemory,
    setProjectMemoryError,
    setAgentMemoryStore,
    setLastMemoryRetrieval,
    pendingMemoryCandidates,
    setPendingMemoryCandidates,
  });

  const {
    refreshGitStatus,
    selectGitPath,
    gitStage,
    gitUnstage,
    gitRestore,
    gitCommit,
  } = useWorkspaceGitWorkspace({
    api,
    selectedGitPath,
    setGitStatus,
    setGitStatusLoading,
    setGitActionError,
    setSelectedGitPath,
    setGitDiff,
    setGitDiffLoading,
    setGitDiffError,
    setSessionMemory,
  });

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [pendingPatch, setPendingPatch] = useState<Patch | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [editStatus, setEditStatus] = useState<EditStatus>("idle");
  const [editError, setEditError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [lastEditedPath, setLastEditedPath] = useState<string | null>(null);

  const {
    openFile,
    openPath,
    activateFile,
    closeFile,
    listDirectory,
    selectEditTarget,
    clearEditTarget,
    reviewPatch,
    discardPatch,
  } = useWorkspaceEditSurface({
    api,
    activePath,
    openFileTabs,
    openFilesByPath,
    setOpenFileTabs,
    setOpenFilesByPath,
    setActivePath,
    setFileStatus,
    setError,
    setActiveFile,
    plan: {
      setAiPatchSession,
      setPatchStatus,
      setPatchError,
      setAiPatchApproved,
      setAiPatchApplyStatus,
      setAiPatchApplyError,
    },
    setEditTarget,
    setPendingPatch,
    setReviewing,
    setEditError,
    setEditStatus,
    pendingPatch,
    setCenterTab,
  });

  const { projectProblems, problemsStatus, refreshProjectProblems } =
    useProjectProblems({
      api,
      projectPath: project?.path ?? null,
    });

  const clearEditorReveal = useCallback(() => {
    setEditorReveal(null);
  }, [setEditorReveal]);

  const openProblem = useCallback(
    (problem: ProjectProblem) => {
      setEditorReveal({ line: problem.line, column: problem.column });
      setCenterTab("editor");
      void openPath(problem.absFile);
    },
    [openPath, setCenterTab, setEditorReveal],
  );

  const { clearPlan, clearRunContextForNewSubmit, archiveActiveRunContextAfterSuccess } =
    useWorkspaceRunContextReset({
      plan: {
        setPlan,
        planRef,
        setAiPlan,
        aiPlanRef,
        setAiPlanStatus,
        setLastPlanPrompt,
        applyPlanActiveRunIdRef,
        applyPlanCompletedRunIdRef,
        setPlanApplySession,
        setPlanApplyError,
        setExecutionSession,
        setExecutionError,
        setBuilderSession,
        setBuilderError,
        setAutoFixSession,
        setAiPatchSession,
        setPatchStatus,
        setPatchError,
        setAiPatchApproved,
        setAiPatchApplyStatus,
        setAiPatchApplyError,
        createPlanErrorRef,
        lastContextSnapshotIdRef,
        editExplorationContentsRef,
        pipelineCoderResultRef,
        applyPlanSuccessRef,
        executionNoChangeGuardRef,
      },
      agentLoop: { setAgentLoopSession, setAgentLoopError },
      setSmartFileSelection,
      setSessionMemoryDiagnostics,
      setBuildError,
      setFollowUpEscalation,
      setFollowUpSuccess,
      setFollowUpCheckpoint,
      setVerification,
      setVerifyStatus,
      setVerifyError,
      setEditTarget,
      setPendingPatch,
      setReviewing,
      restorePipelineCheckpoint,
      updateGreenfieldRun,
    });

  const lastGoodScanRef = useRef<import("@/types").ProjectScan | null>(null);

  const applyScanResult = useCallback(
    (result: import("@/types").ProjectScan) => {
      const enriched = enrichProjectScan(result);
      lastGoodScanRef.current = enriched;
      setScan(enriched);
      setScanStatus("done");
      if (project?.path && api) {
        const inv = buildFeatureInventoryFromScan(enriched, project.path);
        setFeatureInventory(inv);
        void saveFeatureInventoryToDisk(api, inv);
      }
    },
    [api, project?.path, setFeatureInventory],
  );

  const runScan = useCallback(async () => {
    if (!api) return;
    if (!lastGoodScanRef.current) {
      setScanStatus("scanning");
    }
    try {
      if (api.getProjectIndexStatus) {
        const indexStatus = await api.getProjectIndexStatus();
        setProjectIndexStatus(indexStatus);
      }
      const result = await api.scanProject();
      if (result) {
        applyScanResult(result);
      } else {
        if (lastGoodScanRef.current) {
          setScan(lastGoodScanRef.current);
          setScanStatus("error");
        } else {
          setScan(null);
          setScanStatus("idle");
        }
      }
    } catch {
      if (lastGoodScanRef.current) {
        setScan(lastGoodScanRef.current);
      } else {
        setScan(null);
      }
      setScanStatus("error");
    }
  }, [api, applyScanResult, setProjectIndexStatus]);

  const directEdit = useWorkspaceDirectEdit({
    api,
    activePath,
    activeFile,
    openFilesByPath,
    setOpenFilesByPath,
    setActiveFile,
    setLastEditedPath,
    runScan,
    refreshProjectProblems,
  });

  const closeFileWithDraft = useCallback(
    (path: string) => {
      if (directEdit.isEditorDirty(path)) {
        const discard = window.confirm(
          "This file has unsaved changes. Close without saving?",
        );
        if (!discard) return;
      }
      directEdit.clearEditorDraft(path);
      closeFile(path);
    },
    [closeFile, directEdit],
  );

  useEffect(() => {
    if (!api?.onProjectIndexUpdated || !project?.path) return;
    const refreshFromIndex = async () => {
      try {
        const result = await api.scanProject();
        if (result) applyScanResult(result);
        if (api.getProjectIndexStatus) {
          setProjectIndexStatus(await api.getProjectIndexStatus());
        }
      } catch {
        /* keep last good scan */
      }
    };
    const offUpdated = api.onProjectIndexUpdated(() => {
      void refreshFromIndex();
    });
    const offStatus = api.onProjectIndexStatus?.((status) => {
      setProjectIndexStatus(status);
    });
    void api.getProjectIndexStatus?.().then(setProjectIndexStatus).catch(() => undefined);
    return () => {
      offUpdated();
      offStatus?.();
    };
  }, [api, project?.path, applyScanResult, setProjectIndexStatus]);

  const { resumePersistedRun, abandonPersistedRun } = useWorkspaceRunCheckpointActions({
    project,
    pendingRunCheckpoint,
    setPendingRunCheckpoint,
    plan: {
      setPlan,
      setAiPlan,
      setLastPlanPrompt,
      setBuilderSession,
      setExecutionSession,
      setPlanApplySession,
      builderControlRef,
    },
    agentLoop: { setAgentSession, setAgentLoopSession, agentControlRef },
    setRailToolState,
    runBuilderOrchestrator,
    runAgentOrchestrator,
    runMultiFileExecution,
    restorePipelineCheckpoint,
    resumeMultiAgentPipeline,
    resumeBuildReview,
  });


  const bindProjectSession = useCallback(
    async (projectPath: string, projectName?: string) => {
      let branch: string | null = null;
      if (api?.getGitBranch) {
        try {
          branch = await api.getGitBranch();
        } catch {
          branch = null;
        }
      }
      const loadedSession = await loadSessionMemoryFromDisk(api, projectPath, branch);
      setSessionMemory((prev) => setProjectContext(prev, projectPath, branch, loadedSession));
      const features = await loadFeatureInventoryFromDisk(api, projectPath);
      setFeatureInventory(features);
      setContextHistory(loadContextHistory(projectPath));
      setAnalyticsHistory(loadAnalyticsHistory(projectPath));
      setSelectedAnalyticsId(null);
      setContextSnapshot(null);
      setSelectedContextId(null);
      if (!api?.readProjectMemory) {
        setProjectMemory(EMPTY_PROJECT_MEMORY);
        setAgentMemoryStore(normalizeAgentMemoryStore(null, projectPath));
        return;
      }
      try {
        const raw = await api.readProjectMemory();
        const fallback =
          projectName ??
          projectPath.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ??
          "";
        const normalizedProject = normalizeProjectMemory(raw, fallback);
        setProjectMemory(normalizedProject);
        setProjectMemoryError(null);
        let memoryStore = await loadAgentMemoryFromDisk(api, projectPath);
        memoryStore = seedStoreFromLegacyProjectMemory(
          memoryStore,
          normalizedProject,
        );
        agentMemoryStoreRef.current = memoryStore;
        setAgentMemoryStore(memoryStore);
        if (memoryStore.memories.length > 0) {
          await saveAgentMemoryToDisk(api, memoryStore);
        }
      } catch {
        setProjectMemoryError("Could not load project memory.");
      }
      void loadRunCheckpointAsync(projectPath).then(setPendingRunCheckpoint);
      void refreshGitStatus();
      void api?.hydrateSemanticIndex?.();
    },
    [api, refreshGitStatus],
  );

  const { openProject, openProjectAt } = useWorkspaceProjectOpen({
    api,
    project: { setProject, setError },
    file: {
      setActiveFile,
      setActivePath,
      setOpenFileTabs,
      setOpenFilesByPath,
      setFileStatus,
      setScan,
      setProjectIndexStatus,
      setGitStatus,
      setSelectedGitPath,
      setGitDiff,
      setGitActionError,
      setGitDiffError,
    },
    plan: {
      setPlan,
      setAiPlan,
      setAiPlanStatus,
      setLastPlanPrompt,
      setPlanApplySession,
      setPlanApplyError,
      setAutoFixSession,
      setExecutionSession,
      setExecutionError,
      setBuilderSession,
      setBuilderError,
      builderControlRef,
      builderSkipApprovalRef,
      setAiPatchSession,
      setPatchStatus,
      setPatchError,
      setAiPatchApproved,
      setAiPatchApplyStatus,
      setAiPatchApplyError,
    },
    agentLoop: { setAgentSession },
    memory: { setProjectMemory, setProjectMemoryError },
    setSessionMemory,
    setSessionMemoryDiagnostics,
    setContextSnapshot,
    setContextInspectorDraft,
    setContextHistory,
    setSelectedContextId,
    setEditTarget,
    setPendingPatch,
    setReviewing,
    setEditStatus,
    setEditError,
    setCanUndo,
    setVerification,
    setVerifyStatus,
    setVerifyError,
    setLastEditedPath,
    runScan,
    bindProjectSession,
  });

  useEffect(() => {
    checkpointInputGetterRef.current = () => {
      if (!project?.path) return null;
      return {
        projectPath: project.path,
        builderSession,
        agentLoopSession,
        executionSession,
        pipelineSession,
        planApplySession,
        aiPlan,
        plan,
        agentSession,
        lastPlanPrompt,
        buildMode,
        buildRunning,
        pipelineRunning,
      };
    };
  }, [
    project?.path,
    builderSession,
    agentLoopSession,
    executionSession,
    pipelineSession,
    planApplySession,
    aiPlan,
    plan,
    agentSession,
    lastPlanPrompt,
    buildMode,
    buildRunning,
    pipelineRunning,
  ]);

  useEffect(() => {
    if (api?.loadRunCheckpoint) {
      setRunCheckpointStorePort(createElectronRunCheckpointPort(api));
      return () => setRunCheckpointStorePort(null);
    }
    setRunCheckpointStorePort(null);
    return undefined;
  }, [api]);

  useEffect(() => {
    syncRunCheckpoint();
  }, [syncRunCheckpoint]);

  useEffect(() => {
    const onBeforeUnload = () => syncRunCheckpoint();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [syncRunCheckpoint]);

  useEffect(() => {
    executionLogService.start();
    const unsub = executionLogService.subscribe(setDeveloperConsole);
    return () => {
      unsub();
      executionLogService.stop();
    };
  }, []);

  useEffect(() => {
    executionLogService.setProjectPath(project?.path ?? null);
  }, [project?.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const syncDock = () => setDockOpen(loadPanelLayout().dockOpen);
    window.addEventListener("bryantlabs:dock-changed", syncDock);
    return () => window.removeEventListener("bryantlabs:dock-changed", syncDock);
  }, []);

  const setDeveloperConsoleEnabled = useCallback((enabled: boolean) => {
    executionLogService.setEnabled(enabled);
    setDeveloperConsoleEnabledState(enabled);
  }, []);

  const openDock = useCallback(() => {
    window.dispatchEvent(new CustomEvent("bryantlabs:open-dock"));
  }, []);

  const toggleDock = useCallback(() => {
    window.dispatchEvent(new CustomEvent("bryantlabs:toggle-dock"));
  }, []);

  const openDeveloperConsole = useCallback(() => {
    setDeveloperConsoleEnabled(true);
    openDock();
    setDockTab("console");
  }, [setDeveloperConsoleEnabled, openDock]);

  const selectDeveloperConsoleRun = useCallback((runId: string | null) => {
    executionLogService.selectRun(runId);
  }, []);

  const viewCurrentDeveloperConsoleRun = useCallback(() => {
    executionLogService.viewCurrentRun();
  }, []);

  const applyMemoryClear = useCallback((scope: SessionMemoryClearScope) => {
    setSessionMemory((prev) => clearMemoryScope(prev, scope));
    if (scope === "all" || scope === "prompts") {
      setSessionMemoryDiagnostics(null);
    }
  }, []);

  const clearSessionMemoryFn = useCallback(
    () => applyMemoryClear("all"),
    [applyMemoryClear],
  );
  const clearPromptHistoryFn = useCallback(
    () => applyMemoryClear("prompts"),
    [applyMemoryClear],
  );
  const clearFailureHistoryFn = useCallback(
    () => applyMemoryClear("failures"),
    [applyMemoryClear],
  );

  const {
    pushAgent,
    exportAgentReport,
    clearAgentSession: clearAgentSessionFn,
  } = useWorkspaceAgentSessionActions({
    projectPath: project?.path,
    agentLoop: { agentSession, setAgentSession, agentLoopSession, agentLoopError },
    builderSession,
    executionSession,
    aiPlan,
    plan,
    lastPlanPrompt,
    greenfieldRun,
    verification,
  });

  const openProvidersView = useCallback(() => {
    setRailToolState("providers");
  }, []);

  const openGitPanel = useCallback(() => {
    setInsightsTab("git");
    setRailToolState("insights");
  }, []);

  useEffect(() => {
    if (!api) return;
    void refreshProviderStatus();
  }, [api, refreshProviderStatus]);

  useEffect(() => {
    if (!project?.path) {
      setFollowUpSnapshots([]);
      setFollowUpActivityRuns([]);
      return;
    }
    setFollowUpSnapshots(loadFollowUpSnapshots(project.path));
    setFollowUpActivityRuns(loadFollowUpActivityRuns(project.path));
  }, [project?.path]);

  const {
    agentRunHistory,
    selectedAgentRunId,
    selectedArtifactDiffPath,
    activeAgentRunId,
    beginAgentRun,
    selectAgentRun,
    focusArtifactDiff,
    resetActiveAgentRun,
    projectFacts,
    currentAppContext,
    persistAppContextMemory,
  } = useAgentRunWorkspaceContext({
    projectPath: project?.path,
    projectName: project?.name,
    lastPlanPrompt,
    greenfieldRun,
    agentGreenfieldPanelActive,
    buildStatusPhase: buildStatus.phase,
    planApplySession,
    autoFixPhase: autoFixSession?.phase ?? null,
    buildRunning,
    pipelineRunning,
    providerStatus,
    buildError,
    planApplyError,
    pipelineError,
    followUpEscalationNote: followUpEscalation?.note,
    plan,
    aiPlan,
    scan,
    featureInventory,
    sessionMemory,
    followUpChat,
    projectMemory,
    saveProjectMemoryFn,
    setProjectIntelligence,
  });

  const {
    inspectorSession,
    openRunInspector,
    closeRunInspector,
    setInspectorTab,
    setCenterInspectorActive,
    lockInspectorRun,
  } = useRunInspectorController();

  const {
    diagnosticReportSession,
    openDiagnosticReport,
    closeDiagnosticReport,
  } = useDiagnosticReportController();

  const {
    compareRunIds,
    compareSession,
    toggleCompareRun,
    clearCompareRuns,
    openRunCompare,
    openSelectedCompare,
    closeRunCompare,
  } = useRunCompareController();

  const selectAgentRunForWorkspace = useCallback(
    (runId: string | null) => {
      selectAgentRun(runId);
      if (runId) lockInspectorRun(runId);
    },
    [selectAgentRun, lockInspectorRun],
  );

  const {
    recordAgentUserMessage,
    recordFollowUpUserMessage,
    recordAgentStudioMessage,
    recordAgentGreenfieldSuccess,
    recordAgentActivityMessage,
    recordFollowUpFailureMessage,
  } = useAgentChatRecording({
    projectPath: project?.path,
    projectName: project?.name,
    scan,
    sessionMemory,
    followUpChat,
    lastPlanPrompt,
    greenfieldRun,
    setFollowUpChat,
    setPendingAgentChat,
    beginAgentRun,
    followUpRunStartedAtRef,
    followUpActivityRunRef,
    followUpEscalatedRef,
    projectMemoryRef,
    setFollowUpEscalation,
    setFollowUpSuccess,
    setProjectHealth,
    setAgentGreenfieldPanelActive,
    setGreenfieldRun,
    setSessionMemory,
    persistAppContextMemory,
  });

  const {
    appendGreenfieldRunLog,
    prepareGreenfieldCallBudget,
    prepareMultiPhaseGreenfieldCallBudget,
    canMakeAiCall,
    registerGreenfieldRunControl,
    cancelGreenfieldRun,
    triggerGreenfieldRepair,
  } = useWorkspaceGreenfieldRunHelpers({
    projectPath: project?.path,
    agentGreenfieldPanelActive,
    greenfieldRun,
    setGreenfieldRun,
    setCenterTab,
    setAgentGreenfieldPanelActive,
    greenfieldRunControlRef,
    providerInvokeHostRef,
    updateGreenfieldRun,
    persistAnalyticsRecord,
    recordAgentActivityMessage,
  });

  const {
    cancelApplyPlan,
    selectPlanApplyFile,
    setPlanApplyFileDecision,
    approveAllPlanApplyFiles,
    beginApplyPlanRun,
    completeApplyPlanRun,
    isStaleApplyPlanRun,
    ignoreStaleApplyPlanResult,
    startApplyPlan,
    runApplyPlanDirectRewrite,
  } = useWorkspacePlanApplyControls({
    api,
    project,
    scan,
    plan,
    planApplySession,
    planState: {
      planRef,
      setPlanApplySession,
      setPlanApplyError,
      applyPlanActiveRunIdRef,
      applyPlanCompletedRunIdRef,
    },
    greenfieldRun,
    appendGreenfieldRunLog,
    executeApplyPlan,
  });

  useWorkspaceStudioTestHooks({
    api,
    projectPath: project?.path,
    scan,
    scanStatus,
    greenfieldRun,
    greenfieldPanelActive: agentGreenfieldPanelActive,
    buildRunning,
    pipelineRunning,
    aiPlanStatus,
    autoFixPhase: autoFixSession?.phase ?? null,
    providerStatus,
    planApplySession,
    planApplyError,
    buildError,
    buildStatusPhase: buildStatus.phase,
    centerTab,
    appPreview,
    activeAgentRunId,
    openProjectAt,
    setFollowUpChat,
    beginAgentRun,
    setPlanApplySession,
    releaseBuildRunForReview,
    patchAppPreview,
    requestPreviewTab,
  });

  const syncAppContextBeforeEdit = useCallback(() => {
    if (!project?.path) return;
    const chat = loadFollowUpChat(project.path);
    const ctx = buildCurrentAppContext({
      scan,
      audit: auditProjectForEdit(scan),
      sessionMemory: sessionMemoryRef.current,
      chat,
      projectMemory: projectMemoryRef.current,
      projectFacts: deriveProjectFacts(sessionMemoryRef.current, chat),
      projectName: project.name,
    });
    if (ctx) persistAppContextMemory(ctx);
  }, [scan, project?.path, project?.name, persistAppContextMemory]);

  intelligenceServiceRef.current.update({
    scan,
    sessionMemory,
    projectMemory,
    agentMemory: agentMemoryStoreRef.current,
    featureInventory,
    health: projectHealth,
    followUpChat,
    snapshots: followUpSnapshots,
  });

  const refreshFeatureInventoryFn = useCallback(async () => {
    if (!scan || !project?.path || !api) return;
    const inv = intelligenceServiceRef.current.rebuildFeatureInventoryFromScan(project.path);
    if (inv) {
      setFeatureInventory(inv);
      await saveFeatureInventoryToDisk(api, inv);
    }
  }, [api, project?.path, scan]);

  const {
    recordFollowUpStudioMessage,
    dismissFollowUpSuccess,
    undoFollowUpChange,
    restoreFollowUpSnapshotFn,
    attemptFollowUpAutoEscalation,
    finalizeFollowUpActivityRunFromLogs,
  } = useWorkspaceFollowUpRecording({
    api,
    projectPath: project?.path,
    sessionMemory,
    lastPlanPrompt,
    greenfieldRun,
    planApplySession,
    followUpCheckpoint,
    followUpActivityRunRef,
    followUpRunStartedAtRef,
    followUpEscalatedRef,
    setFollowUpChat,
    setFollowUpSuccess,
    setFollowUpCheckpoint,
    setFollowUpSnapshots,
    setFollowUpActivityRuns,
    setProjectHealth,
    setSessionMemory,
    setFollowUpEscalation,
    setCanUndo,
    refreshFeatureInventoryFn,
    refreshProviderStatus,
    appendGreenfieldRunLog,
    runScan,
  });

  const {
    resolveAgentRunBlockReason,
    agentRunBlockReason,
    staleRunContextPresent,
    agentWorkflowBusy,
    setRailTool,
    runImproveAppMode,
    startUiAuditAdvisoryFix,
    startPreferredMemoryFix,
    resetAgentRunState,
  } = useWorkspaceAgentRunGates({
    greenfieldRun,
    agentGreenfieldPanelActive,
    buildRunning,
    pipelineRunning,
    aiPlanStatus,
    planApplySession,
    autoFixSession,
    plan,
    aiPlan,
    buildError,
    planApplyError,
    pipelineError,
    verification,
    builderSession,
    executionSession,
    followUpEscalation,
    setBuildError,
    setRailToolState,
    setGreenfieldRun,
    setAgentGreenfieldPanelActive,
    greenfieldRunControlRef,
    startAgent,
    recordAgentUserMessage,
    recordAgentActivityMessage,
    resetActiveAgentRun,
    cancelMultiAgentPipeline,
    cancelBuildLoop,
    clearRunContextForNewSubmit,
    cancelApplyPlan,
  });

  const persistSessionMemoryNow = useCallback(async () => {
    await saveSessionMemoryToDisk(api, sessionMemoryRef.current);
  }, [api]);

  const analyzeFeasibilityFn = useCallback(
    (prompt: string): FeasibilityResult =>
      intelligenceServiceRef.current.analyzeFeasibility(prompt),
    [],
  );

  useEffect(() => {
    setIntelligenceHost({
      buildIntelligenceForOperation: (opts) =>
        intelligenceServiceRef.current.getProjectContext(
          opts.prompt,
          opts.memoryRetrieval ?? null,
        ),
      applyComplexityRouting: async (prompt, fileCount, settings) => {
        const decision = intelligenceServiceRef.current.resolveRouting(
          prompt,
          fileCount,
          settings,
        );
        setComplexityRouting(decision);
        return { settings, decision };
      },
      persistSessionMemory: persistSessionMemoryNow,
      refreshFeatureInventory: refreshFeatureInventoryFn,
      recordPromptSent: () => {},
      analyzeFeasibility: analyzeFeasibilityFn,
    });
    return () => setIntelligenceHost(null);
  }, [api, analyzeFeasibilityFn, persistSessionMemoryNow, refreshFeatureInventoryFn]);

  useOrchestrationHostSync(
    orchestrationRefs,
    buildOrchestrationSyncInput({
      bridge: {
        api,
        project,
        scan,
        plan,
        aiPlan,
        lastPlanPrompt,
        sessionMemory,
        planApplySession,
        projectMemory: projectMemoryRef.current,
        projectIntelligence,
        aiPlanStatus,
        autoFixSession,
        greenfieldRun,
        buildRunning,
        pipelineRunning,
        agentGreenfieldPanelActive,
        editTarget,
        activeFile,
        activePath,
        pendingPatch,
        reviewing,
        verification,
        executionSession,
        aiPatchSession,
        aiPatchApproved,
        builderSession,
        agentLoopSession,
        scanStatus,
        repository,
        appPreview,
        patchAppPreview,
      },
      refs: {
        planRef,
        aiPlanRef,
        applyPlanSuccessRef,
        executionNoChangeGuardRef,
        pipelineCoderResultRef,
        lastContextSnapshotIdRef,
        editExplorationContentsRef,
        createPlanErrorRef,
        projectMemoryRef,
        aiCallTrackerRef,
        fallbackResolverRef,
        providerHealthInFlightRef,
        providerHealthCacheRef,
        currentRunAnalyticsRef,
        lastRecordedAnalyticsKeyRef,
        pipelineRunActiveRef,
        builderControlRef,
        builderSkipApprovalRef,
        agentControlRef,
        agentLastExecRef,
        applyPlanActiveRunIdRef,
      },
      setters: {
        setVerifyStatus,
        setVerifyError,
        setVerification,
        setSessionMemory,
        setSessionMemoryDiagnostics,
        setPendingPatch,
        setReviewing,
        setEditError,
        setEditStatus,
        setCanUndo,
        setLastEditedPath,
        setProviderStatus,
        setProviderFallbackRequest,
        setGreenfieldRun,
        setPlan,
        setAiPlan,
        setAiPlanStatus,
        setLastPlanPrompt,
        setPlanApplyError,
        setBuildError,
        setPlanApplySession,
        setCenterTab,
        setRailToolState,
        setPatchStatus,
        setPatchError,
        setAiPatchSession,
        setAiPatchApproved,
        setAiPatchApplyStatus,
        setAiPatchApplyError,
        setExecutionSession,
        setExecutionError,
        setBuilderSession,
        setBuilderError,
        setAgentLoopSession,
        setAgentLoopError,
        setAutoFixSession,
      },
      actions: {
        appendGreenfieldRunLog,
        updateGreenfieldRun,
        beginStudioAction,
        finishStudioAction,
        publishFailureReport,
        resetAiCallTracker,
        refreshProviderStatus,
        persistAnalyticsRecord,
        offerMemoryCandidatesFromRun,
        createPlan,
        runAIPlan,
        clearRunContextForNewSubmit,
        archiveActiveRunContextAfterSuccess,
        startApplyPlan,
        approveAllPlanApplyFiles,
        applyApprovedPlanFiles,
        cancelApplyPlan,
        executeApplyPlan,
        startAutoFixAfterApply,
        approveAutoFixRepair,
        commitContextCapture,
        invokePlannerCall,
        invokeCoderCall,
        invokeRepairCall,
        refreshSmartFileSelection,
        resolveMemoriesForPrompt,
        buildApplyPlanFailureReport,
        recordFollowUpUserMessage,
        recordAgentUserMessage,
        recordFollowUpFailureMessage,
        finalizeFollowUpActivityRunFromLogs,
        attemptFollowUpAutoEscalation,
        resolveAgentRunBlockReason,
        syncAppContextBeforeEdit,
        releaseBuildRunForReview,
        beginApplyPlanRun,
        isStaleApplyPlanRun,
        ignoreStaleApplyPlanResult,
        completeApplyPlanRun,
        requestPreviewTab,
        recordSmartFileHistory,
        setFollowUpCheckpoint,
        recordFollowUpStudioMessage,
        openPath,
        runScan,
        pushAgent,
        executeAIPlanForPrompt,
        createExecutionSessionFromPlans,
        executeMultiFileLoop,
        runAutoFixAutomatic,
        runAgentFollowUp: startAgent,
      },
    }),
  );

  const planApplyReviewing =
    planApplySession?.phase === "review" ||
    planApplySession?.phase === "waiting_for_review";

  const agentStartDisabledState = useMemo(
    () =>
      getAgentStartDisabledState({
        projectOpen: Boolean(project),
        scan,
        scanStatus,
        repository,
      }),
    [project, scan, scanStatus, repository],
  );

  const value = useWorkspaceContextValue({
    api,
    project,
    activeFile,
    activePath,
    fileStatus,
    error,
    scan,
    scanStatus,
    projectIndexStatus,
    repository,
    repositorySearchFn,
    findSymbolReferencesFn,
    repositoryRelevanceFn,
    smartFileSelection,
    plan,
    editTarget,
    pendingPatch,
    reviewing,
    editStatus,
    editError,
    canUndo,
    verification,
    verifyStatus,
    verifyError,
    lastEditedPath,
    projectProblems,
    problemsStatus,
    refreshProjectProblems,
    openProblem,
    editorReveal,
    clearEditorReveal,
    openProject,
    openFile,
    openPath,
    activateFile,
    closeFile: closeFileWithDraft,
    openFileTabs,
    editorContent: directEdit.editorContent,
    isEditorDirty: directEdit.isEditorDirty,
    updateEditorDraft: directEdit.updateEditorDraft,
    saveEditorFile: directEdit.saveEditorFile,
    revertEditorDraft: directEdit.revertEditorDraft,
    editorSaveStatus: directEdit.editorSaveStatus,
    editorSaveError: directEdit.editorSaveError,
    listDirectory,
    runScan,
    createPlan,
    clearPlan,
    aiPlan,
    aiPlanStatus,
    lastPlanPrompt,
    runAIPlan,
    sessionMemory,
    sessionMemoryDiagnostics,
    featureInventory,
    complexityRouting,
    analyzeFeasibilityFn,
    persistSessionMemoryNow,
    agentRunBlockReason,
    agentGreenfieldPanelActive,
    agentWorkflowBusy,
    setAgentGreenfieldPanelActive,
    cancelGreenfieldRun,
    triggerGreenfieldRepair,
    registerGreenfieldRunControl,
    clearSessionMemoryFn,
    clearPromptHistoryFn,
    clearFailureHistoryFn,
    projectMemory,
    projectMemoryError,
    saveProjectMemoryFn,
    projectIntelligence,
    agentMemoryStore,
    memoryAnalytics,
    lastMemoryRetrieval,
    pendingMemoryCandidates,
    addAgentMemoryRecordFn,
    updateAgentMemoryRecordFn,
    deleteAgentMemoryRecordFn,
    setAgentMemoryAutoSaveFn,
    acceptMemoryCandidateFn,
    acceptAllMemoryCandidatesFn,
    rejectMemoryCandidatesFn,
    exportAgentMemoryJsonFn,
    importAgentMemoryJsonFn,
    contextSnapshot,
    contextInspectorDraft,
    contextHistory,
    selectedContextId,
    showContextRequestPreview,
    setShowContextRequestPreview,
    selectContextSnapshotFn,
    refreshContextInspectorDraft,
    executionSession,
    executionError,
    startMultiFileExecution,
    runMultiFileExecution,
    cancelMultiFileExecution,
    retryExecutionStep,
    skipExecutionStep,
    regenerateExecutionStep,
    builderSession,
    builderError,
    startAutonomousBuild,
    pauseAutonomousBuild,
    resumeAutonomousBuild,
    stopAutonomousBuild,
    approveBuilderPhase,
    agentSession,
    exportAgentReport,
    clearAgentSessionFn,
    agentLoopSession,
    agentLoopError,
    agentStartDisabledState,
    startAgent,
    pauseAgent,
    resumeAgent,
    stopAgent,
    approveAgentAction,
    planApplySession,
    planApplyReviewing,
    planApplyError,
    startApplyPlan,
    runApplyPlanDirectRewrite,
    cancelApplyPlan,
    selectPlanApplyFile,
    setPlanApplyFileDecision,
    approveAllPlanApplyFiles,
    applyApprovedPlanFiles,
    buildRunning,
    buildError,
    buildStatus,
    runBuildLoop,
    continueBuildAfterReview,
    cancelBuildLoop,
    retryApplyPlanReview,
    followUpChat,
    agentChat,
    followUpCheckpoint,
    followUpSuccess,
    recordFollowUpUserMessage,
    recordAgentUserMessage,
    recordAgentStudioMessage,
    recordAgentActivityMessage,
    recordAgentGreenfieldSuccess,
    dismissFollowUpSuccess,
    undoFollowUpChange,
    followUpSnapshots,
    followUpActivityRuns,
    agentRunHistory,
    selectedAgentRunId,
    selectedArtifactDiffPath,
    activeAgentRunId,
    selectAgentRun: selectAgentRunForWorkspace,
    focusArtifactDiff,
    inspectorSession,
    openRunInspector,
    closeRunInspector,
    setInspectorTab,
    setCenterInspectorActive,
    lockInspectorRun,
    diagnosticReportSession,
    openDiagnosticReport,
    closeDiagnosticReport,
    compareRunIds,
    compareSession,
    toggleCompareRun,
    clearCompareRuns,
    openRunCompare,
    openSelectedCompare,
    closeRunCompare,
    projectHealth,
    projectFacts,
    currentAppContext,
    followUpEscalation,
    restoreFollowUpSnapshotFn,
    runImproveAppMode,
    startUiAuditAdvisoryFix,
    startPreferredMemoryFix,
    pipelineSession,
    pipelineRunning,
    pipelineError,
    runMultiAgentPipeline,
    continueMultiAgentPipeline,
    continueMultiAgentPipelineRepair,
    cancelMultiAgentPipeline,
    autoFixSession,
    approveAutoFixRepair,
    cancelAutoFix,
    aiPatchSession,
    patchStatus,
    patchError,
    aiPatchApproved,
    aiPatchApplyStatus,
    aiPatchApplyError,
    proposeAIPatch,
    approveAIPatch,
    discardAIPatchApproval,
    rejectAIPatch,
    applyAIPatch,
    selectEditTarget,
    clearEditTarget,
    proposeEdit,
    reviewPatch,
    discardPatch,
    applyPatch,
    undoLastEdit,
    runVerification,
    appPreview,
    patchAppPreview,
    openProjectAt,
    requestPreviewTab,
    previewTabNonce,
    railTool,
    setRailTool,
    centerTab,
    setCenterTab,
    dockTab,
    setDockTab,
    commandPaletteOpen,
    setCommandPaletteOpen,
    dockOpen,
    toggleDock,
    openDock,
    developerConsoleEnabled,
    setDeveloperConsoleEnabled,
    openDeveloperConsole,
    developerConsole,
    selectDeveloperConsoleRun,
    viewCurrentDeveloperConsoleRun,
    greenfieldRun,
    updateGreenfieldRun,
    resetGreenfieldRun,
    resetAgentRunState,
    staleRunContextPresent,
    clearRunContextForNewSubmit,
    archiveActiveRunContextAfterSuccess,
    appendGreenfieldRunLog,
    publishFailureReport,
    providerStatus,
    refreshProviderStatus,
    invokeGreenfieldCall,
    invokeGreenfieldRawCall,
    invokeGreenfieldReservedCompletion,
    providerInvokeStopRef,
    providerRequestSentRef,
    resetAiCallTracker,
    prepareGreenfieldCallBudget,
    prepareMultiPhaseGreenfieldCallBudget,
    canMakeAiCall,
    invokeRepairCall,
    openProvidersView,
    insightsTab,
    setInsightsTab,
    openGitPanel,
    analyticsHistory,
    selectedAnalyticsId,
    selectAnalyticsRecordFn,
    openAnalyticsFromDashboard,
    gitStatus,
    gitStatusLoading,
    gitActionError,
    selectedGitPath,
    gitDiff,
    gitDiffLoading,
    gitDiffError,
    refreshGitStatus,
    gitStage,
    gitUnstage,
    gitRestore,
    gitCommit,
    selectGitPath,
    pendingRunCheckpoint,
    resumePersistedRun,
    abandonPersistedRun,
  });

  return (
    <WorkspaceContext.Provider value={value}>
      <WorkspaceErrorBoundary>{children}</WorkspaceErrorBoundary>
      {providerFallbackRequest ? (
        <ProviderFallbackDialog
          request={providerFallbackRequest}
          onChoose={resolveProviderFallbackChoice}
          onCancel={() => resolveProviderFallbackChoice("cancel")}
        />
      ) : null}
      {pendingMemoryCandidates.length > 0 ? (
        <MemorySuggestionDialog
          candidates={pendingMemoryCandidates}
          onAccept={(index) => void acceptMemoryCandidateFn(index)}
          onAcceptAll={() => void acceptAllMemoryCandidatesFn()}
          onReject={rejectMemoryCandidatesFn}
        />
      ) : null}
      {pendingRunCheckpoint ? (
        <ResumeRunDialog
          checkpoint={pendingRunCheckpoint}
          onResume={() => void resumePersistedRun()}
          onAbandon={abandonPersistedRun}
        />
      ) : null}
    </WorkspaceContext.Provider>
  );
}

export type { WorkspaceState } from "@/app/workspace/workspaceState";
export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
