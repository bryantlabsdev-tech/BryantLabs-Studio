import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useAgentRunViewModel } from "@/app/workspace/useAgentRunViewModel";
import { FollowUpChatHistory } from "@/components/views/FollowUpChatHistory";
import { FollowUpErrorBanner } from "@/components/views/FollowUpErrorBanner";
import { AgentGreenfieldOrchestrator } from "@/components/agent/AgentGreenfieldOrchestrator";
import { ProjectHealthCard } from "@/components/views/ProjectHealthCard";
import { ProjectMemoryPanel } from "@/components/views/ProjectMemoryPanel";
import { SnapshotHistoryPanel } from "@/components/views/SnapshotHistoryPanel";
import { RunHistorySearch } from "@/components/views/RunHistorySearch";
import { RunTimelineVisualization } from "@/components/views/RunTimelineVisualization";
import { AgentComposer } from "@/components/agent/AgentComposer";
import { deriveFollowUpComposerState } from "@/core/agent/deriveAgentOperationalActivity";
import { loadPanelLayout } from "@/core/layout/panelLayout";
import type { FollowUpSnapshot } from "@/core/build/followUpSnapshots";
import {
  collectFollowUpError,
  readFollowUpReviewFirst,
  suggestFollowUpRecoveryV2,
  writeFollowUpReviewFirst,
  type FollowUpRecoveryActionV2,
} from "@/core/build";
import { isExistingEditableProject } from "@/core/agent/projectIntentRouting";
import { logPromptSubmission } from "@/core/agent/promptSubmission";
import {
  artifactHasDiffContent,
  diffableFilesFromArtifact,
} from "@/core/agent/artifactDiffView";
import { findAgentRunArtifact } from "@/core/agent/agentRunHistory";
import { resolveDiagnosticReportBundle } from "@/core/diagnostics/diagnosticReport";
import { extractRunFileDiffs, resolveAllowGeneratedFileDiffs } from "@/core/agent/runFileDiffs";
import {
  ClarifyingQuestionGate,
  FeasibilityGate,
  FolderSelectionGate,
  PromptContextViewer,
  StaleRunGate,
} from "@/components/views/PromptContextViewer";
import { strongerModelSettingsPatch } from "@/core/build/modelEscalation";

import { normalizeProviderSettings } from "@/core/providers/orchestration";

import {
  classifyAppDomain,
  postCreatePlaceholderText,
  suggestComposerExamples,
} from "@/core/domain";
import { WELCOME_EXAMPLE_PROMPTS } from "@/core/onboarding/examplePrompts";
import { useBuildViewSubmit } from "@/components/views/useBuildViewSubmit";

const GREENFIELD_EXAMPLES = WELCOME_EXAMPLE_PROMPTS;

export function BuildView() {
  const {
    project,
    scan,
    scanStatus,
    buildRunning,
    buildError,
    buildStatus,
    runBuildLoop,
    startAgent,
    cancelBuildLoop,
    retryApplyPlanReview,
    triggerGreenfieldRepair,
    continueBuildAfterReview,
    planApplySession,
    planApplyError,
    pipelineRunning,
    pipelineError,
    greenfieldRun,
    setCenterTab,
    setRailTool,
    updateGreenfieldRun,
    appendGreenfieldRunLog,
    resetAgentRunState,
    staleRunContextPresent,
    clearRunContextForNewSubmit,
    archiveActiveRunContextAfterSuccess,
    providerStatus,
    agentChat,
    followUpCheckpoint,
    undoFollowUpChange,
    followUpSnapshots,
    agentRunHistory,
    activeAgentRunId,
    selectedAgentRunId,
    selectAgentRun,
    focusArtifactDiff,
    compareRunIds,
    toggleCompareRun,
    openSelectedCompare,
    projectHealth,
    currentAppContext,
    sessionMemory,
    followUpEscalation,
    restoreFollowUpSnapshot,
    requestPreviewTab,
    analyzeFeasibility,
    rescan,
    agentRunBlockReason,
    setAgentGreenfieldPanelActive,
    cancelGreenfieldRun,
    resetGreenfieldRun,
    recordAgentUserMessage,
    recordAgentGreenfieldSuccess,
    recordAgentActivityMessage,
    openDeveloperConsole,
    setCommandPaletteOpen,
    openProject,
    openProjectAt,
    openPath,
    openDiagnosticReport,
    openRunInspector,
  } = useWorkspace();

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reviewFirst, setReviewFirst] = useState(readFollowUpReviewFirst);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [greenfieldIndexSyncPending, setGreenfieldIndexSyncPending] = useState(false);
  const [composerPlaceholder, setComposerPlaceholder] = useState<string | null>(null);
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [agentFocusMode, setAgentFocusMode] = useState(
    () => loadPanelLayout().agentFocusMode,
  );
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastSuccessFocusRef = useRef<string | null>(null);
  const api = window.bryantlabs;

  const submit = useBuildViewSubmit({
    projectPath: project?.path ?? null,
    hasProject: Boolean(project),
    scan,
    scanStatus,
    buildRunning,
    pipelineRunning,
    buildStatus,
    planApplySession,
    greenfieldRun,
    agentRunHistory,
    activeAgentRunId,
    agentRunBlockReason,
    staleRunContextPresent,
    currentAppContext,
    sessionMemory,
    analyzeFeasibility,
    greenfieldIndexSyncPending,
    setAgentGreenfieldPanelActive,
    runBuildLoop,
    startAgent,
    openProject,
    openProjectAt,
    setRailTool,
    updateGreenfieldRun,
    appendGreenfieldRunLog,
    clearRunContextForNewSubmit,
    resetAgentRunState,
    recordAgentUserMessage,
    recordAgentActivityMessage,
    providerStatus,
  });

  const {
    prompt,
    setPrompt,
    modeOverride,
    setModeOverride,
    greenfieldMode,
    setGreenfieldMode,
    greenfieldPrompt,
    setGreenfieldPrompt,
    greenfieldRecoveryMode,
    setGreenfieldRecoveryMode,
    lastAgentIntent,
    setLastAgentIntent,
    feasibilityGate,
    setFeasibilityGate,
    clarityGate,
    setClarityGate,
    staleRunGate,
    setStaleRunGate,
    folderSelectionGate,
    setFolderSelectionGate,
    folderPickerError,
    setFolderPickerError,
    folderPickerBusy,
    setFolderPickerBusy,
    pendingFolderResumeRef,
    blockedMessage,
    setBlockedMessage,
    submissionPending,
    setSubmissionPending,
    submitStallMessage,
    submissionError,
    setSubmissionError,
    promptValidationWarning,
    providerSettings,
    setProviderSettings,
    active,
    greenfieldActive,
    awaitingReview,
    providerReady,
    composerDisabled,
    sendDisabled,
    emptyProjectFolder,
    dispatchPrompt,
    handleResetAgentState,
    proceedAfterStaleRunReset,
    proceedAfterFeasibility,
    proceedAfterClarity,
    resolveFolderGateCancel,
  } = submit;

  const hasProject = Boolean(project);

  const projectIndexReady = !hasProject || scan !== null || scanStatus === "idle";

  const lastUserPrompt = useMemo(() => {
    const fromChat = [...agentChat].reverse().find((m) => m.role === "user")?.text;
    if (fromChat?.trim()) return fromChat.trim();
    const last = sessionMemory.prompts[sessionMemory.prompts.length - 1];
    return last?.prompt?.trim() ?? "";
  }, [agentChat, sessionMemory.prompts]);

  const domainProfile = useMemo(
    () => classifyAppDomain({ prompt: lastUserPrompt }),
    [lastUserPrompt],
  );

  const examplePrompts = hasProject
    ? [...suggestComposerExamples(domainProfile)]
    : GREENFIELD_EXAMPLES;

  const hasExistingProject = hasProject && isExistingEditableProject(true, scan);

  useEffect(() => {
    if (hasExistingProject) {
      setGreenfieldMode(false);
      setGreenfieldPrompt("");
    }
  }, [hasExistingProject]);

  const greenfieldInitialFolder = useMemo(() => {
    if (!project?.path) return undefined;
    if (greenfieldMode || greenfieldRecoveryMode || emptyProjectFolder) {
      return { path: project.path, name: project.name };
    }
    return undefined;
  }, [project?.path, project?.name, emptyProjectFolder, greenfieldMode, greenfieldRecoveryMode]);

  const { runStatus, agentRunCard } = useAgentRunViewModel({
    agentIntent: lastAgentIntent,
    promptOverride: prompt.trim() || null,
    greenfieldPanelActive: greenfieldMode,
    selectedAgentRunId: null,
  });

  const liveFileDiffs = useMemo(
    () =>
      activeAgentRunId && agentRunCard
        ? extractRunFileDiffs({
            card: agentRunCard,
            planApplySession,
            generatedFiles: greenfieldRun.generatedFiles,
            appliedFileDiffs: greenfieldRun.appliedFileDiffs,
            allowGeneratedFiles: resolveAllowGeneratedFileDiffs(greenfieldRun),
          })
        : [],
    [activeAgentRunId, agentRunCard, planApplySession, greenfieldRun.generatedFiles],
  );

  const errorSurface = useMemo(
    () =>
      collectFollowUpError({
        buildError,
        planApplyError,
        pipelineError,
        failureReport: greenfieldRun.failureReport,
        greenfieldFinalMessage:
          greenfieldRun.setupStatus === "error" ||
          greenfieldRun.setupStatus === "repair_needed"
            ? greenfieldRun.finalMessage
            : null,
        ...(providerStatus?.provider ? { provider: providerStatus.provider } : {}),
        ...(providerStatus?.model ? { model: providerStatus.model } : {}),
      }),
    [
      buildError,
      planApplyError,
      pipelineError,
      greenfieldRun.failureReport,
      greenfieldRun.finalMessage,
      greenfieldRun.setupStatus,
      providerStatus,
    ],
  );

  const recoveryActions = useMemo(() => {
    if (!errorSurface) return [];
    const providerActions =
      providerSettings != null
        ? suggestFollowUpRecoveryV2(
            errorSurface.rawDetail ?? errorSurface.headline,
            providerSettings,
            providerStatus?.provider,
            { originalGreenfieldPrompt: greenfieldRun.workflow?.prompt ?? null },
          )
        : ([
            { kind: "retry" as const },
            { kind: "open_diagnostic_report" as const },
            { kind: "inspect_run" as const },
            { kind: "view_details" as const },
          ] satisfies FollowUpRecoveryActionV2[]);
    return providerActions;
  }, [
    errorSurface,
    providerSettings,
    providerStatus?.provider,
    greenfieldRun.workflow?.prompt,
  ]);

  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      document.getElementById("build-prompt")?.focus();
    });
  };

  useEffect(() => {
    const onFocusComposer = () => focusComposer();
    const onFillPrompt = (event: Event) => {
      const promptText = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!promptText) return;
      setPrompt(promptText);
      focusComposer();
    };
    const onFocusRunSearch = () => {
      window.requestAnimationFrame(() => {
        document.getElementById("run-history-search-input")?.focus();
      });
    };
    const onToggleReviewFirst = () => {
      setReviewFirst((prev) => {
        const next = !prev;
        writeFollowUpReviewFirst(next);
        return next;
      });
    };
    window.addEventListener("bryantlabs:focus-composer", onFocusComposer);
    window.addEventListener("bryantlabs:fill-prompt", onFillPrompt);
    window.addEventListener("bryantlabs:focus-run-search", onFocusRunSearch);
    window.addEventListener("bryantlabs:toggle-review-first", onToggleReviewFirst);
    const onAgentFocusChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ agentFocusMode: boolean }>).detail;
      if (detail) setAgentFocusMode(detail.agentFocusMode);
    };
    window.addEventListener("bryantlabs:agent-focus-changed", onAgentFocusChanged);
    return () => {
      window.removeEventListener("bryantlabs:focus-composer", onFocusComposer);
      window.removeEventListener("bryantlabs:fill-prompt", onFillPrompt);
      window.removeEventListener("bryantlabs:focus-run-search", onFocusRunSearch);
      window.removeEventListener("bryantlabs:toggle-review-first", onToggleReviewFirst);
      window.removeEventListener("bryantlabs:agent-focus-changed", onAgentFocusChanged);
    };
  }, []);

  useEffect(() => {
    const last = agentChat[agentChat.length - 1];
    if (!last || last.role !== "studio" || last.outcome !== "success") return;
    if (last.id === lastSuccessFocusRef.current) return;
    if (active || greenfieldMode) return;
    lastSuccessFocusRef.current = last.id;
    if (!composerPlaceholder) {
      setComposerPlaceholder("Describe the next change…");
    }
    focusComposer();
  }, [agentChat, active, greenfieldMode, composerPlaceholder]);

  const handleFolderGateCancel = () => {
    if (!folderSelectionGate) return;
    const cancel = resolveFolderGateCancel(folderSelectionGate);
    pendingFolderResumeRef.current = null;
    setFolderSelectionGate(null);
    setFolderPickerError(null);
    setFolderPickerBusy(false);
    setPrompt(cancel.prompt);
  };

  const handleStartNewProject = async () => {
    const gate = folderSelectionGate;
    if (!gate) return;
    if (!api) {
      setFolderPickerError("Opening a project requires the desktop app.");
      return;
    }
    setFolderPickerBusy(true);
    setFolderPickerError(null);
    const promptToPreserve = gate.pendingPrompt;
    setFolderSelectionGate(null);
    setPrompt(promptToPreserve);
    try {
      const res = await api.greenfieldSelectFolder();
      if (res === null) {
        setFolderSelectionGate({ pendingPrompt: promptToPreserve });
        return;
      }
      if ("error" in res) {
        setFolderPickerError(res.error);
        setFolderSelectionGate({ pendingPrompt: promptToPreserve });
        return;
      }
      pendingFolderResumeRef.current = {
        pendingPrompt: promptToPreserve,
        destination: "start_new",
      };
      await openProjectAt(res.path);
    } catch {
      setFolderPickerError("Could not open folder picker.");
      setFolderSelectionGate({ pendingPrompt: promptToPreserve });
      pendingFolderResumeRef.current = null;
    } finally {
      setFolderPickerBusy(false);
    }
  };

  const handleOpenExistingFolderWithoutGate = async () => {
    if (!api) {
      setFolderPickerError("Opening a project requires the desktop app.");
      return;
    }
    setFolderPickerBusy(true);
    setFolderPickerError(null);
    const promptToPreserve = prompt.trim();
    try {
      const res = await api.openProject();
      if (!res) return;
      if (promptToPreserve.length >= 4) {
        pendingFolderResumeRef.current = {
          pendingPrompt: promptToPreserve,
          destination: "open_existing",
        };
      }
      await openProjectAt(res.path);
    } catch {
      setFolderPickerError("Could not open folder picker.");
      pendingFolderResumeRef.current = null;
    } finally {
      setFolderPickerBusy(false);
    }
  };

  const handleStartNewProjectWithoutGate = async () => {
    if (!api) {
      setFolderPickerError("Opening a project requires the desktop app.");
      return;
    }
    setFolderPickerBusy(true);
    setFolderPickerError(null);
    const promptToPreserve = prompt.trim();
    try {
      const res = await api.greenfieldSelectFolder();
      if (res === null) return;
      if ("error" in res) {
        setFolderPickerError(res.error);
        return;
      }
      if (promptToPreserve.length >= 4) {
        pendingFolderResumeRef.current = {
          pendingPrompt: promptToPreserve,
          destination: "start_new",
        };
      }
      await openProjectAt(res.path);
    } catch {
      setFolderPickerError("Could not open folder picker.");
      pendingFolderResumeRef.current = null;
    } finally {
      setFolderPickerBusy(false);
    }
  };

  const handleOpenExistingFolder = async () => {
    const gate = folderSelectionGate;
    if (!gate) return;
    if (!api) {
      setFolderPickerError("Opening a project requires the desktop app.");
      return;
    }
    setFolderPickerBusy(true);
    setFolderPickerError(null);
    const promptToPreserve = gate.pendingPrompt;
    setFolderSelectionGate(null);
    setPrompt(promptToPreserve);
    try {
      const res = await api.openProject();
      if (!res) {
        setFolderSelectionGate({ pendingPrompt: promptToPreserve });
        return;
      }
      pendingFolderResumeRef.current = {
        pendingPrompt: promptToPreserve,
        destination: "open_existing",
      };
      await openProjectAt(res.path);
    } catch {
      setFolderPickerError("Could not open folder picker.");
      setFolderSelectionGate({ pendingPrompt: promptToPreserve });
      pendingFolderResumeRef.current = null;
    } finally {
      setFolderPickerBusy(false);
    }
  };

  const handleSubmissionError = (message: string) => {
    setSubmissionError(message);
    setBlockedMessage(message);
    setSubmissionPending(false);
    setGreenfieldMode(false);
    setGreenfieldRecoveryMode(false);
    setGreenfieldPrompt("");
    recordAgentActivityMessage(message);
    logPromptSubmission("submit.failed", {
      promptLength: prompt.trim().length,
      projectPath: project?.path ?? null,
      provider: providerSettings?.provider ?? null,
      route: "greenfield",
      phase: "failed",
    });
  };

  const openFailureDiagnosticReport = () => {
    const runId = selectedAgentRunId ?? activeAgentRunId;
    if (!runId) {
      setCenterTab("studioLog");
      return;
    }
    const artifact = findAgentRunArtifact(agentRunHistory, runId);
    const bundle = resolveDiagnosticReportBundle({
      runId,
      previousRunId: artifact?.previousRunId ?? null,
      prompt: artifact?.prompt ?? prompt.trim(),
      card: agentRunCard,
      greenfieldRun,
      artifact,
      projectPath: project?.path ?? null,
      route: greenfieldRun.runTimeline?.route ?? null,
      generationMode: greenfieldRun.actionType,
    });
    if (!bundle) {
      setCenterTab("studioLog");
      return;
    }
    openDiagnosticReport({
      runId,
      bundle,
      metadata: {
        runId,
        previousRunId: artifact?.previousRunId ?? null,
        prompt: artifact?.prompt ?? prompt.trim(),
        projectPath: project?.path ?? null,
        route: greenfieldRun.runTimeline?.route ?? null,
        generationMode: greenfieldRun.actionType,
      },
    });
  };

  const handleRecovery = async (action: FollowUpRecoveryActionV2) => {
    if (!api) return;
    if (action.kind === "greenfield_recovery") {
      setPrompt(action.prompt);
      dispatchPrompt(action.prompt);
      return;
    }
    if (action.kind === "retry") {
      const retryPrompt = prompt.trim();
      if (retryPrompt.length >= 4) void startAgent(retryPrompt);
      else dispatchPrompt();
      return;
    }
    if (action.kind === "open_providers") {
      setRailTool("providers");
      return;
    }
    if (action.kind === "switch_provider") {
      await api.saveProviderSettings({ provider: action.provider });
      const retryPrompt = prompt.trim();
      if (retryPrompt.length >= 4) void startAgent(retryPrompt);
      return;
    }
    if (action.kind === "stronger_model") {
      await api.saveProviderSettings(strongerModelSettingsPatch(action.step));
      const retryPrompt = prompt.trim();
      if (retryPrompt.length >= 4) void startAgent(retryPrompt);
      return;
    }
    if (action.kind === "view_details" || action.kind === "open_diagnostic_report") {
      openFailureDiagnosticReport();
      return;
    }
    if (action.kind === "inspect_run") {
      const runId = selectedAgentRunId ?? activeAgentRunId;
      if (runId) openRunInspector(runId);
      return;
    }
  };

  const handleRevision = () => {
    void retryApplyPlanReview();
  };

  const reviewChangedFiles = useMemo(
    () =>
      planApplySession?.files.filter(
        (file) => file.status === "ready" && file.diffStats?.changed,
      ) ?? [],
    [planApplySession?.files],
  );

  const runReview = useMemo(
    () =>
      awaitingReview
        ? {
            awaiting: true as const,
            planSummary: planApplySession?.planSummary,
            changedFiles: reviewChangedFiles,
            onApprove: () => void continueBuildAfterReview(),
            onReject: () => cancelBuildLoop(),
            onRevision: handleRevision,
          }
        : null,
    [
      awaitingReview,
      planApplySession?.planSummary,
      reviewChangedFiles,
      continueBuildAfterReview,
      cancelBuildLoop,
    ],
  );

  const handleOpenRunFile = (relPath: string) => {
    const abs =
      scan?.files.find((file) => file.path === relPath)?.absPath ??
      (project?.path ? `${project.path}/${relPath}` : null);
    if (abs) void openPath(abs);
  };

  const handleFocusRunDiff = useCallback(
    (runId: string, path?: string) => {
      const artifact = findAgentRunArtifact(agentRunHistory, runId);
      const resolvedPath =
        path ??
        (artifact ? diffableFilesFromArtifact(artifact)[0]?.path : undefined) ??
        (runId === activeAgentRunId ? liveFileDiffs[0]?.path : undefined) ??
        agentRunCard?.filesModified[0] ??
        agentRunCard?.patchImpact.files[0]?.path;
      if (resolvedPath) {
        focusArtifactDiff({ runId, path: resolvedPath });
      } else {
        selectAgentRun(runId);
      }
      setCenterTab("diff");
    },
    [
      agentRunHistory,
      activeAgentRunId,
      liveFileDiffs,
      agentRunCard,
      focusArtifactDiff,
      selectAgentRun,
      setCenterTab,
    ],
  );

  const handleScrollToRun = (runId: string) => {
    setHighlightedRunId(runId);
    const artifact = findAgentRunArtifact(agentRunHistory, runId);
    if (artifact && artifactHasDiffContent(artifact)) {
      const firstPath = diffableFilesFromArtifact(artifact)[0]?.path;
      if (firstPath) {
        focusArtifactDiff({ runId, path: firstPath });
      }
      setCenterTab("diff");
    }
    window.setTimeout(() => setHighlightedRunId(null), 2400);
  };

  const handleRequestRestore = (snap: FollowUpSnapshot) => {
    setPendingRestoreId(snap.id);
  };

  const handleConfirmRestore = (snap: FollowUpSnapshot) => {
    setPendingRestoreId(null);
    void restoreFollowUpSnapshot(snap);
  };

  const exitGreenfieldMode = () => {
    setGreenfieldMode(false);
    setGreenfieldRecoveryMode(false);
    setGreenfieldPrompt("");
    setLastAgentIntent(null);
  };

  const handleCancelGreenfield = () => {
    cancelGreenfieldRun();
    exitGreenfieldMode();
  };

  const handleCancelAgentRun = () => {
    if (greenfieldActive) handleCancelGreenfield();
    else cancelBuildLoop();
  };

  const handleGreenfieldRetry = () => {
    const retryPrompt = greenfieldPrompt.trim() || prompt.trim();
    cancelGreenfieldRun();
    resetGreenfieldRun();
    if (retryPrompt.length >= 4) {
      setGreenfieldPrompt(retryPrompt);
      setGreenfieldMode(true);
      setLastAgentIntent("greenfield");
    }
  };

  const handleGreenfieldComplete = async () => {
    try {
      await rescan();
    } finally {
      setGreenfieldIndexSyncPending(false);
    }
  };

  const handleGreenfieldSuccess = (input: {
    prompt: string;
    filesWritten: readonly string[];
    typecheckPassed: boolean;
    buildPassed: boolean;
    previewReady: boolean;
    uiAuditPassed: boolean;
  }) => {
    setGreenfieldIndexSyncPending(true);
    recordAgentGreenfieldSuccess(input);
    archiveActiveRunContextAfterSuccess();
    setGreenfieldMode(false);
    setGreenfieldRecoveryMode(false);
    setGreenfieldPrompt("");
    setLastAgentIntent("follow_up");
    setBlockedMessage(null);
    const profile = classifyAppDomain({ prompt: input.prompt });
    setComposerPlaceholder(postCreatePlaceholderText(profile));
    focusComposer();
  };

  const undoAvailable = Boolean(followUpCheckpoint);

  const defaultPlaceholder = hasProject
    ? "Describe a change… Use @codebase, @src/App.tsx, or @SymbolName"
    : "Describe an app to build…";

  const threadActive = agentChat.length > 0 || runStatus.isActive;

  const sendLabel =
    greenfieldActive && runStatus.greenfieldProgress
      ? runStatus.greenfieldProgress.composerLabel
      : active || greenfieldActive
        ? runStatus.waitingLabel || runStatus.currentLabel || "Working…"
        : "Run";

  const showComposerExamples =
    !threadActive && !prompt.trim() && !composerDisabled;

  const showProjectEmptyState =
    !hasProject && !greenfieldMode && !active && !folderSelectionGate;

  const lastChatOutcome = useMemo(() => {
    const last = [...agentChat].reverse().find((m) => m.role === "studio" && m.outcome);
    if (!last?.outcome) return null;
    return last.outcome;
  }, [agentChat]);

  const followUpComposerState = useMemo(
    () =>
      deriveFollowUpComposerState({
        lastOutcome: lastChatOutcome,
        runActive: active || greenfieldActive,
        awaitingReview,
        hasProject,
      }),
    [lastChatOutcome, active, greenfieldActive, awaitingReview, hasProject],
  );

  const effectivePlaceholder =
    composerPlaceholder ??
    (followUpComposerState.mode === "follow_up"
      ? followUpComposerState.placeholder
      : defaultPlaceholder);

  const composerSection = (
    <section className="build-view__composer build-view__composer-sticky">
      <div className="build-view__composer-scroll">
      <div className="build-view__composer-overlays">
        {followUpEscalation?.note ? (
          <p className="build-view__escalation plan__muted" role="status">
            {followUpEscalation.note}
          </p>
        ) : null}

        {folderSelectionGate && !active ? (
          <FolderSelectionGate
            pendingPrompt={folderSelectionGate.pendingPrompt}
            busy={folderPickerBusy}
            pickerError={folderPickerError}
            onStartNewProject={() => void handleStartNewProject()}
            onOpenExistingFolder={() => void handleOpenExistingFolder()}
            onCancel={handleFolderGateCancel}
          />
        ) : null}

        {clarityGate && !active ? (
          <ClarifyingQuestionGate
            question={clarityGate.question}
            onProceed={proceedAfterClarity}
            onCancel={() => setClarityGate(null)}
          />
        ) : null}

        {staleRunGate && !active ? (
          <StaleRunGate
            onResetAndStart={proceedAfterStaleRunReset}
            onCancel={() => setStaleRunGate(null)}
          />
        ) : null}

        {feasibilityGate && !active ? (
          <FeasibilityGate
            result={feasibilityGate}
            onProceed={proceedAfterFeasibility}
            onCancel={() => setFeasibilityGate(null)}
          />
        ) : null}

        {(blockedMessage || submissionError) ? (
          <div className="build-view__submission-error" role="alert">
            <p className="aipatch__error">{blockedMessage ?? submissionError}</p>
            {agentRunBlockReason || submissionError ? (
              <button
                type="button"
                className="prov-btn"
                onClick={handleResetAgentState}
              >
                Reset agent state
              </button>
            ) : null}
          </div>
        ) : null}

        {agentRunBlockReason && !blockedMessage && !submissionError && !greenfieldActive ? (
          <p className="plan__muted" role="status">
            {agentRunBlockReason}
          </p>
        ) : null}

        {greenfieldRun.setupStatus === "repair_needed" && !greenfieldActive ? (
          <div className="build-view__repair-banner" role="alert">
            <p>
              Setup needs repair before you can start another run. TypeScript or build
              failed after generation — Studio can try to fix it automatically.
            </p>
            <button
              type="button"
              className="prov-btn prov-btn--primary"
              onClick={() => void triggerGreenfieldRepair()}
            >
              Run repair
            </button>
          </div>
        ) : null}

        {greenfieldRun.setupStatus === "error" && !greenfieldActive ? (
          <div className="build-view__repair-banner build-view__repair-banner--error" role="alert">
            <p>
              {greenfieldRun.failureReport?.rootCauseLine ??
                greenfieldRun.finalMessage ??
                "Setup failed after generation."}
            </p>
            <div className="build-view__repair-banner-actions">
              {greenfieldRun.workflow?.prompt?.trim() ? (
                <button
                  type="button"
                  className="prov-btn prov-btn--primary"
                  onClick={() => dispatchPrompt(greenfieldRun.workflow!.prompt!)}
                >
                  Retry setup recovery
                </button>
              ) : null}
              <button
                type="button"
                className={greenfieldRun.workflow?.prompt?.trim() ? "prov-btn" : "prov-btn prov-btn--primary"}
                onClick={() => setCenterTab("studioLog")}
              >
                View setup errors
              </button>
              <button
                type="button"
                className="prov-btn"
                onClick={() => openDeveloperConsole()}
              >
                Developer console
              </button>
            </div>
          </div>
        ) : null}

        {errorSurface ? (
          <FollowUpErrorBanner
            error={errorSurface}
            actions={recoveryActions}
            onAction={(action) => void handleRecovery(action)}
          />
        ) : null}
      </div>

      <div className="build-view__composer-core">
      <RunTimelineVisualization
        greenfieldRun={greenfieldRun}
        buildRunning={buildRunning}
        buildPhase={buildStatus.phase}
        scanStatus={scanStatus}
        submissionPending={submissionPending}
        stallMessage={submitStallMessage}
        buildError={buildError}
        planApplyError={planApplyError}
        pipelineError={pipelineError}
        agentRunCard={agentRunCard}
        onResetAgentState={handleResetAgentState}
        onCancelRun={handleCancelAgentRun}
      />
      <AgentComposer
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={() => dispatchPrompt()}
        sendDisabled={sendDisabled}
        composerDisabled={composerDisabled}
        sendLabel={sendLabel}
        placeholder={effectivePlaceholder}
        active={active}
        awaitingReview={awaitingReview}
        greenfieldActive={greenfieldActive}
        reviewFirst={reviewFirst}
        onReviewFirstChange={(next) => {
          setReviewFirst(next);
          writeFollowUpReviewFirst(next);
        }}
        hasProject={hasProject}
        showExamples={showComposerExamples}
        examplePrompts={examplePrompts}
        onExampleClick={(ex) => {
          setPrompt(ex);
          focusComposer();
        }}
        modeOverride={modeOverride}
        onModeOverrideChange={setModeOverride}
        providerSettings={providerSettings}
        providerReady={providerReady}
        onProviderSettingsChange={(settings) =>
          setProviderSettings(normalizeProviderSettings(settings))
        }
        onOpenSettings={() => setRailTool("providers")}
        {...(active || awaitingReview || greenfieldActive
          ? { onCancel: handleCancelAgentRun }
          : {})}
        promptValidationWarning={promptValidationWarning}
        showProjectEmptyState={showProjectEmptyState}
        onStartNewProject={() => void handleStartNewProjectWithoutGate()}
        onOpenExistingFolder={() => void handleOpenExistingFolderWithoutGate()}
        projectPickerBusy={folderPickerBusy}
        followUpHeadline={followUpComposerState.headline}
        followUpSuggestions={followUpComposerState.suggestions}
        onFollowUpSuggestionClick={(text) => {
          setPrompt(text);
          focusComposer();
        }}
        compactControls
        projectScan={scan}
      />

      {folderPickerError ? (
        <p className="aipatch__error" role="alert">
          {folderPickerError}
        </p>
      ) : null}

      {hasProject && (greenfieldIndexSyncPending || !projectIndexReady) ? (
        <p className="plan__muted agent-composer__status">
          {greenfieldIndexSyncPending || scanStatus === "scanning"
            ? "Syncing project index after generation…"
            : "Project index not ready."}
        </p>
      ) : null}
      </div>
      </div>
    </section>
  );

  const advancedDrawer = advancedOpen ? (
    <section className="build-view__advanced-drawer" aria-label="Advanced tools">
      <div className="build-view__advanced-body">
        {hasProject ? (
          <ProjectMemoryPanel
            context={currentAppContext}
            scan={scan}
            runHistory={agentRunHistory}
          />
        ) : null}
        {hasProject ? (
          <button
            type="button"
            className="build-view__link"
            disabled={!projectIndexReady}
            onClick={() => setContextOpen(true)}
          >
            Context
          </button>
        ) : null}
        {hasProject ? (
          <SnapshotHistoryPanel
            snapshots={followUpSnapshots}
            open={snapshotsOpen}
            onToggle={() => setSnapshotsOpen((o) => !o)}
            pendingRestoreId={pendingRestoreId}
            onRequestRestore={handleRequestRestore}
            onConfirmRestore={handleConfirmRestore}
            onCancelRestore={() => setPendingRestoreId(null)}
          />
        ) : null}
        {hasProject && !greenfieldMode ? (
          <ProjectHealthCard health={projectHealth} />
        ) : null}
        <div className="build-view__advanced-links">
          {undoAvailable ? (
            <button
              type="button"
              className="build-view__link"
              onClick={() => void undoFollowUpChange()}
            >
              Undo last change
            </button>
          ) : null}
          <button type="button" className="build-view__link" onClick={() => setCenterTab("summary")}>
            Summary
          </button>
          <button type="button" className="build-view__link" onClick={() => setCenterTab("generated")}>
            Generated files
          </button>
          <button type="button" className="build-view__link" onClick={() => setRailTool("plan")}>
            Plan
          </button>
          <button type="button" className="build-view__link" onClick={() => setCenterTab("inspector")}>
            Run Inspector
          </button>
          <button type="button" className="build-view__link" onClick={() => openDeveloperConsole()}>
            Developer Console
          </button>
          <button type="button" className="build-view__link" onClick={() => setRailTool("providers")}>
            Providers
          </button>
          <button type="button" className="build-view__link" onClick={() => setRailTool("pipeline")}>
            Pipeline
          </button>
          <button type="button" className="build-view__link" onClick={() => setCommandPaletteOpen(true)}>
            Command palette
          </button>
        </div>
      </div>
    </section>
  ) : null;

  return (
    <div className="build-view build-view--cursor build-view--focused">
      <header className="build-view__thread-head build-view__thread-head--minimal">
        <div className="build-view__thread-head-primary">
          <span className="build-view__thread-title">Agent</span>
          <button
            type="button"
            className={`build-view__thread-action${agentFocusMode ? " build-view__thread-action--active" : ""}`}
            aria-pressed={agentFocusMode}
            title={agentFocusMode ? "Exit agent focus" : "Agent focus — widen conversation"}
            onClick={() => window.dispatchEvent(new CustomEvent("bryantlabs:toggle-agent-focus"))}
          >
            {agentFocusMode ? "Focus on" : "Focus"}
          </button>
          <button
            type="button"
            className={`build-view__thread-action${runHistoryOpen ? " build-view__thread-action--active" : ""}`}
            aria-expanded={runHistoryOpen}
            onClick={() => setRunHistoryOpen((open) => !open)}
          >
            History
          </button>
          <button
            type="button"
            className={`build-view__thread-action${advancedOpen ? " build-view__thread-action--active" : ""}`}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            More
          </button>
        </div>
        {runHistoryOpen ? (
          <RunHistorySearch
            history={agentRunHistory}
            activeRunId={activeAgentRunId}
            selectedRunId={selectedAgentRunId}
            compareRunIds={compareRunIds}
            onSelectRun={selectAgentRun}
            onToggleCompareRun={toggleCompareRun}
            onCompareRuns={openSelectedCompare}
            onScrollToRun={handleScrollToRun}
            projectPath={project?.path ?? null}
          />
        ) : null}
      </header>

      <div ref={chatScrollRef} className="build-view__scroll build-view__scroll--focused">
        <PromptContextViewer open={contextOpen} onClose={() => setContextOpen(false)} />

        <FollowUpChatHistory
          messages={agentChat}
          agentRunCard={agentRunCard}
          agentRunHistory={agentRunHistory}
          activeAgentRunId={activeAgentRunId}
          selectedRunId={selectedAgentRunId}
          highlightedRunId={highlightedRunId}
          onSelectRun={selectAgentRun}
          scrollContainerRef={chatScrollRef}
          greenfieldRun={greenfieldRun}
          projectPath={project?.path ?? null}
          onAgentRunCancel={handleCancelAgentRun}
          onAgentRunOpenConsole={() => openDeveloperConsole()}
          onAgentRunRetry={handleGreenfieldRetry}
          onAgentRunSwitchProvider={() => setRailTool("providers")}
          onOpenPreview={() => requestPreviewTab()}
          onOpenFile={handleOpenRunFile}
          onFocusRunDiff={handleFocusRunDiff}
          liveFileDiffs={liveFileDiffs}
          review={runReview}
          planApplySession={planApplySession}
          buildPhase={buildStatus.phase}
          scanStatus={scanStatus}
          emptyHint={
            hasProject
              ? "Describe a change — edits, features, polish, or fixes."
              : "Describe an app to build from scratch, or pick an example below."
          }
          emptyExamples={examplePrompts}
          onSuggestionClick={(step) => {
            setPrompt(step);
            dispatchPrompt(step);
          }}
        />

      </div>

      {advancedOpen ? advancedDrawer : null}
      {composerSection}

      {greenfieldMode && greenfieldInitialFolder ? (
        <AgentGreenfieldOrchestrator
          initialPrompt={greenfieldPrompt}
          initialFolder={greenfieldInitialFolder}
          greenfieldRecovery={greenfieldRecoveryMode}
          agentRunBlockReason={agentRunBlockReason}
          onGreenfieldComplete={handleGreenfieldComplete}
          onAgentGreenfieldSuccess={handleGreenfieldSuccess}
          onComplete={exitGreenfieldMode}
          onCancel={handleCancelGreenfield}
          onSubmissionError={handleSubmissionError}
        />
      ) : null}
    </div>
  );
}
