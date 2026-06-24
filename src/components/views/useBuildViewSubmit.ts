import { useCallback, useEffect, useRef, useState } from "react";
import { buildGreenfieldFallbackSourceFileCount } from "@/core/agent/agentGreenfieldDispatch";
import { isEmptyProjectFolder } from "@/core/agent/agentGreenfieldDispatch";
import { isGreenfieldRunActive } from "@/core/agent/agentRunMutex";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { StudioIntentKind } from "@/core/agent/classifyStudioIntent";
import {
  planPendingFolderResume,
  resolveFolderGateCancel,
  shouldResumePendingPrompt,
  type FolderSelectionGateState,
  type PendingFolderResume,
} from "@/core/agent/folderSelectionGate";
import { buildPlanPreviewLine } from "@/core/agent/planPreview";
import { validateAgentPrompt, LONG_PROMPT_AUTO_PROCEED_CHARS } from "@/core/agent/promptSubmission";
import { logAgentRoute, type ComposerModeOverride, type RouteAgentPromptResult } from "@/core/agent/unifiedAgentRoute";
import {
  detectGreenfieldForSubmit,
  emitFollowUpBlocked,
  evaluateBuildViewSubmit,
  GREENFIELD_BLOCKED_BY_ROUTE_DETAIL,
  GREENFIELD_BLOCKED_BY_ROUTE_LABEL,
  logBuildViewSubmitAccepted,
  resolveBuildViewSubmitRoute,
  resolveFollowUpSubmitAction,
} from "@/core/build/buildViewSubmitFlow";
import { studioEventBus } from "@/core/console/studioEventBus";
import type { FeasibilityResult } from "@/core/intelligence";
import type { BuildLoopStatus } from "@/core/build";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { PlanApplySession } from "@/core/planApply";
import { isProviderReady } from "@/core/providers/AnthropicProvider";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { CurrentAppContext } from "@/core/agent/agentAppContext";
import type { ProjectScan } from "@/types";

export interface UseBuildViewSubmitInput {
  readonly projectPath: string | null;
  readonly hasProject: boolean;
  readonly scan: ProjectScan | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly buildStatus: BuildLoopStatus;
  readonly planApplySession: PlanApplySession | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly agentRunHistory: readonly AgentRunArtifact[];
  readonly activeAgentRunId: string | null;
  readonly agentRunBlockReason: string | null;
  readonly staleRunContextPresent: boolean;
  readonly currentAppContext: CurrentAppContext | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly analyzeFeasibility: (prompt: string) => FeasibilityResult;
  readonly greenfieldIndexSyncPending: boolean;
  readonly setAgentGreenfieldPanelActive: (active: boolean) => void;
  readonly runBuildLoop: (prompt: string) => Promise<void>;
  readonly startAgent: (prompt: string) => Promise<void>;
  readonly openProject: () => Promise<void>;
  readonly openProjectAt: (path: string) => Promise<void>;
  readonly setRailTool: (tool: import("@/core/layout/types").RailTool) => void;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly appendGreenfieldRunLog: (
    stage: import("@/core/greenfield/runLog").GreenfieldRunLogEntry["stage"],
    status: import("@/core/greenfield/runLog").GreenfieldRunLogEntry["status"],
    message: string,
    details?: string,
  ) => void;
  readonly clearRunContextForNewSubmit: () => void;
  readonly resetAgentRunState: () => void;
  readonly recordAgentUserMessage: (text: string) => void;
  readonly recordAgentActivityMessage: (text: string) => void;
  readonly providerStatus: { provider?: string; model?: string } | null;
}

export function useBuildViewSubmit(input: UseBuildViewSubmitInput) {
  const [prompt, setPrompt] = useState("");
  const [modeOverride, setModeOverride] = useState<ComposerModeOverride>("auto");
  const [greenfieldMode, setGreenfieldMode] = useState(false);
  const [greenfieldPrompt, setGreenfieldPrompt] = useState("");
  const [greenfieldRecoveryMode, setGreenfieldRecoveryMode] = useState(false);
  const [lastAgentIntent, setLastAgentIntent] = useState<StudioIntentKind | null>(null);
  const [feasibilityGate, setFeasibilityGate] = useState<FeasibilityResult | null>(null);
  const [clarityGate, setClarityGate] = useState<{ prompt: string; question: string } | null>(null);
  const [staleRunGate, setStaleRunGate] = useState<{
    prompt: string;
    intent: StudioIntentKind;
    route: RouteAgentPromptResult;
  } | null>(null);
  const [folderSelectionGate, setFolderSelectionGate] =
    useState<FolderSelectionGateState | null>(null);
  const [folderPickerError, setFolderPickerError] = useState<string | null>(null);
  const [folderPickerBusy, setFolderPickerBusy] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [submissionPending, setSubmissionPending] = useState(false);
  const [submissionAt, setSubmissionAt] = useState<number | null>(null);
  const [submitStallMessage, setSubmitStallMessage] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [promptValidationWarning, setPromptValidationWarning] = useState<string | null>(null);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);

  const pendingFolderResumeRef = useRef<PendingFolderResume | null>(null);
  const submitLockRef = useRef(false);
  const activeSubmitPromptRef = useRef<string | null>(null);
  const api = window.bryantlabs;

  useEffect(() => {
    if (!api) return;
    void api.getProviderSettings().then((s) => {
      setProviderSettings(normalizeProviderSettings(s));
    });
  }, [api, input.buildRunning, input.pipelineRunning]);

  useEffect(() => {
    setFeasibilityGate(null);
    setClarityGate(null);
    setPromptValidationWarning(validateAgentPrompt(prompt).warning);
  }, [prompt]);

  useEffect(() => {
    input.setAgentGreenfieldPanelActive(greenfieldMode);
    return () => input.setAgentGreenfieldPanelActive(false);
  }, [greenfieldMode, input.setAgentGreenfieldPanelActive]);

  const active = input.buildRunning || input.pipelineRunning;
  const greenfieldActive =
    greenfieldMode || isGreenfieldRunActive(input.greenfieldRun, greenfieldMode);
  const awaitingReview =
    input.buildStatus.phase === "review" ||
    input.planApplySession?.phase === "review" ||
    input.planApplySession?.phase === "waiting_for_review";
  const providerReady = providerSettings ? isProviderReady(providerSettings) : false;
  const composerDisabled =
    Boolean(input.agentRunBlockReason) ||
    active ||
    greenfieldActive ||
    awaitingReview ||
    input.greenfieldIndexSyncPending ||
    (input.hasProject && input.scanStatus === "scanning");
  const sendDisabled =
    composerDisabled || submissionPending || !providerReady || prompt.trim().length < 4;

  const greenfieldFallbackCount = buildGreenfieldFallbackSourceFileCount(
    input.greenfieldRun,
    input.projectPath ?? undefined,
    input.scan,
  );
  const emptyProjectFolder = isEmptyProjectFolder({
    scan: input.scan,
    scanStatus: input.scanStatus,
    ...(greenfieldFallbackCount !== undefined
      ? { fallbackSourceFileCount: greenfieldFallbackCount }
      : {}),
  });

  const releaseSubmitLock = useCallback(() => {
    submitLockRef.current = false;
    activeSubmitPromptRef.current = null;
  }, []);

  useEffect(() => {
    if (!active && !submissionPending && !greenfieldActive) {
      releaseSubmitLock();
    }
  }, [active, submissionPending, greenfieldActive, releaseSubmitLock]);

  useEffect(() => {
    if (!submissionPending && submissionAt === null) return;
    const hasActivity =
      input.greenfieldRun.entries.length > 0 ||
      input.greenfieldRun.genStatus === "running" ||
      input.buildRunning ||
      input.pipelineRunning ||
      greenfieldActive;
    if (hasActivity) {
      setSubmissionPending(false);
      setSubmitStallMessage(null);
      return;
    }
    const timer = window.setTimeout(() => {
      if (
        input.greenfieldRun.entries.length === 0 &&
        !input.buildRunning &&
        !input.pipelineRunning &&
        input.greenfieldRun.genStatus !== "running"
      ) {
        setSubmitStallMessage(
          "Run started but no agent events have been received yet.",
        );
      }
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [
    submissionPending,
    submissionAt,
    input.greenfieldRun.entries.length,
    input.greenfieldRun.genStatus,
    input.buildRunning,
    input.pipelineRunning,
    greenfieldActive,
  ]);

  const flowInput = useCallback(
    (trimmed: string) => ({
      trimmed,
      hasProject: input.hasProject,
      projectPath: input.projectPath,
      scan: input.scan,
      scanStatus: input.scanStatus,
      modeOverride,
      greenfieldRun: input.greenfieldRun,
      lastArtifact:
        input.agentRunHistory.length > 0
          ? input.agentRunHistory[input.agentRunHistory.length - 1] ?? null
          : null,
      greenfieldFallbackCount,
      currentAppContext: input.currentAppContext,
      sessionMemory: input.sessionMemory,
      analyzeFeasibility: input.analyzeFeasibility,
      activeAgentRunId: input.activeAgentRunId,
      providerSettings,
      providerStatus: input.providerStatus,
    }),
    [
      input,
      modeOverride,
      greenfieldFallbackCount,
      providerSettings,
    ],
  );

  const startFollowUpRun = useCallback(
    (trimmed: string, route: Pick<RouteAgentPromptResult, "execution" | "intent">) => {
      const effectivePrompt = prompt.trim().length >= 4 ? prompt.trim() : trimmed;
      const action = resolveFollowUpSubmitAction({
        hasProject: input.hasProject,
        routeExecution: route.execution,
        emptyProjectFolder,
        scan: input.scan,
        scanStatus: input.scanStatus,
        ...(greenfieldFallbackCount !== undefined
          ? { fallbackSourceFileCount: greenfieldFallbackCount }
          : {}),
        filesWritten: input.greenfieldRun.filesWritten,
      });

      if (action.kind === "no_project") {
        setFolderSelectionGate({ pendingPrompt: trimmed });
        return;
      }
      if (action.kind === "greenfield" || action.kind === "greenfield_recovery") {
        setGreenfieldRecoveryMode(action.kind === "greenfield_recovery");
        setGreenfieldPrompt(trimmed);
        setGreenfieldMode(true);
        return;
      }
      if (action.kind === "blocked_scan") {
        setBlockedMessage(action.reason);
        return;
      }
      if (action.greenfieldBlockedByRoute) {
        input.appendGreenfieldRunLog(
          "pipeline",
          "success",
          GREENFIELD_BLOCKED_BY_ROUTE_LABEL,
          GREENFIELD_BLOCKED_BY_ROUTE_DETAIL,
        );
      }
      setLastAgentIntent(route.intent);
      if (action.kind === "agent_loop" || action.kind === "build_loop") {
        void input.startAgent(effectivePrompt);
        return;
      }
    },
    [prompt, input, emptyProjectFolder, greenfieldFallbackCount],
  );

  const buildFreshFollowUpRoute = useCallback(
    (trimmed: string): Pick<RouteAgentPromptResult, "execution" | "intent"> => {
      const route = resolveBuildViewSubmitRoute(flowInput(trimmed));
      return { execution: route.execution, intent: route.intent };
    },
    [flowInput],
  );

  const proceedWithSubmit = useCallback(
    (trimmed: string, route: RouteAgentPromptResult) => {
      if (submitLockRef.current) {
        if (activeSubmitPromptRef.current === trimmed) return;
        setSubmissionError("A run is already in progress. Wait for it to finish.");
        return;
      }
      submitLockRef.current = true;
      activeSubmitPromptRef.current = trimmed;

      logBuildViewSubmitAccepted(flowInput(trimmed), route);
      setBlockedMessage(null);
      setLastAgentIntent(route.intent);
      setSubmissionPending(true);
      setSubmissionAt(Date.now());
      setSubmitStallMessage(null);
      studioEventBus.emit({
        type: "intent.classified",
        timestamp: Date.now(),
        projectPath: input.projectPath,
        intent: route.intent,
      });
      input.recordAgentUserMessage(trimmed);

      const gate = evaluateBuildViewSubmit(flowInput(trimmed), route);
      if (gate.kind === "folder") {
        setFolderSelectionGate({ pendingPrompt: gate.pendingPrompt });
        return;
      }
      if (gate.kind === "blocked" && gate.openProject) {
        void input.openProject();
        return;
      }
      if (gate.kind === "greenfield") {
        if (!gate.recovery) input.clearRunContextForNewSubmit();
        input.recordAgentActivityMessage(
          route.activityNote ??
            "Greenfield Detection · Folder Empty: true · Generation Mode Activated",
        );
        input.updateGreenfieldRun({
          actionType: "greenfield",
          runStartedAt: Date.now(),
          runResult: "running",
          targetFolder: input.projectPath,
          routeDecision: route.decision,
        });
        setGreenfieldRecoveryMode(gate.recovery);
        setGreenfieldPrompt(gate.prompt);
        setGreenfieldMode(true);
        return;
      }

      setGreenfieldMode(false);
      setGreenfieldRecoveryMode(false);
      setGreenfieldPrompt("");
      input.recordAgentActivityMessage(buildPlanPreviewLine(trimmed));

      if (gate.kind === "clarity") {
        setClarityGate({ prompt: gate.prompt, question: gate.question });
        return;
      }
      if (gate.kind === "feasibility") {
        setFeasibilityGate(gate.result);
        return;
      }
      if (gate.kind === "follow_up") {
        if (trimmed.length >= LONG_PROMPT_AUTO_PROCEED_CHARS) {
          input.recordAgentActivityMessage(
            `Long prompt (${trimmed.length.toLocaleString()} chars) — proceeding without feasibility confirmation.`,
          );
        }
        startFollowUpRun(gate.prompt, gate.route);
      }
    },
    [flowInput, input, startFollowUpRun],
  );

  const dispatchPrompt = useCallback(
    (text?: string) => {
      const trimmed = (text ?? prompt).trim();
      const validation = validateAgentPrompt(trimmed);
      setPromptValidationWarning(validation.warning);
      if (!validation.ok) {
        setSubmissionError(validation.error);
        setBlockedMessage(validation.error);
        return;
      }
      setSubmissionError(null);
      if (trimmed.length < 4) return;
      if (submitLockRef.current || active || submissionPending || greenfieldActive) {
        if (activeSubmitPromptRef.current === trimmed) return;
        setSubmissionError("A run is already in progress. Wait for it to finish.");
        return;
      }
      if (!providerReady) {
        const msg = "Connect an AI provider in Settings before sending prompts.";
        setBlockedMessage(msg);
        setSubmissionError(msg);
        input.setRailTool("providers");
        return;
      }
      if (input.agentRunBlockReason) {
        setBlockedMessage(input.agentRunBlockReason);
        setSubmissionError(input.agentRunBlockReason);
        emitFollowUpBlocked(input.projectPath, input.agentRunBlockReason);
        return;
      }
      setPrompt(text ?? prompt);

      const route = resolveBuildViewSubmitRoute(flowInput(trimmed));
      logAgentRoute(route.mode, route.reason, input.projectPath);
      input.updateGreenfieldRun({ routeDecision: route.decision });
      detectGreenfieldForSubmit(flowInput(trimmed), route);

      if (route.execution === "blocked") {
        setSubmissionPending(false);
        releaseSubmitLock();
        setBlockedMessage(route.blockedReason);
        setSubmissionError(route.blockedReason ?? "Prompt could not be routed.");
        input.recordAgentUserMessage(trimmed);
        if (route.needsEmptyFolder) void input.openProject();
        return;
      }
      if (input.staleRunContextPresent) {
        setStaleRunGate({ prompt: trimmed, intent: route.intent, route });
        return;
      }
      proceedWithSubmit(trimmed, route);
    },
    [
      prompt,
      active,
      submissionPending,
      greenfieldActive,
      providerReady,
      input,
      flowInput,
      releaseSubmitLock,
      proceedWithSubmit,
    ],
  );

  const handleResetAgentState = useCallback(() => {
    setSubmissionError(null);
    setBlockedMessage(null);
    setSubmitStallMessage(null);
    setSubmissionPending(false);
    setSubmissionAt(null);
    setStaleRunGate(null);
    setFeasibilityGate(null);
    setClarityGate(null);
    setFolderSelectionGate(null);
    setFolderPickerError(null);
    setFolderPickerBusy(false);
    pendingFolderResumeRef.current = null;
    setGreenfieldMode(false);
    setGreenfieldRecoveryMode(false);
    setGreenfieldPrompt("");
    input.resetAgentRunState();
  }, [input]);

  const proceedAfterStaleRunReset = useCallback(() => {
    const gate = staleRunGate;
    if (!gate) return;
    setStaleRunGate(null);
    handleResetAgentState();
    setPrompt(gate.prompt);
    proceedWithSubmit(gate.prompt, gate.route);
  }, [staleRunGate, handleResetAgentState, proceedWithSubmit]);

  const proceedAfterFeasibility = useCallback(() => {
    const trimmed = prompt.trim();
    setFeasibilityGate(null);
    if (trimmed.length >= 4) {
      input.recordAgentActivityMessage(buildPlanPreviewLine(trimmed));
      startFollowUpRun(trimmed, buildFreshFollowUpRoute(trimmed));
    }
  }, [prompt, input, startFollowUpRun, buildFreshFollowUpRoute]);

  const proceedAfterClarity = useCallback(() => {
    const trimmed = prompt.trim();
    setClarityGate(null);
    if (trimmed.length < 4) return;
    input.recordAgentActivityMessage(buildPlanPreviewLine(trimmed));
    const feasibility = input.analyzeFeasibility(trimmed);
    if (feasibility.requiresConfirmation) {
      setFeasibilityGate(feasibility);
      return;
    }
    startFollowUpRun(trimmed, buildFreshFollowUpRoute(trimmed));
  }, [prompt, input, startFollowUpRun, buildFreshFollowUpRoute]);

  const resumePendingFolderPrompt = useCallback(() => {
    const pending = pendingFolderResumeRef.current;
    if (
      !shouldResumePendingPrompt({
        pending,
        hasProject: input.hasProject,
        scanStatus: input.scanStatus,
      }) ||
      !pending
    ) {
      return;
    }
    pendingFolderResumeRef.current = null;
    const { prompt: pendingPrompt, modeOverride: resumeModeOverride } =
      planPendingFolderResume({ pending, modeOverride });

    const route = resolveBuildViewSubmitRoute({
      ...flowInput(pendingPrompt),
      modeOverride: resumeModeOverride,
    });

    setPrompt(pendingPrompt);
    setFolderSelectionGate(null);
    setFolderPickerError(null);

    if (route.execution === "blocked") {
      setSubmissionPending(false);
      setBlockedMessage(route.blockedReason);
      setSubmissionError(route.blockedReason ?? "Prompt could not be routed.");
      return;
    }
    if (input.staleRunContextPresent) {
      setStaleRunGate({ prompt: pendingPrompt, intent: route.intent, route });
      return;
    }
    proceedWithSubmit(pendingPrompt, route);
  }, [flowInput, input, modeOverride, proceedWithSubmit]);

  useEffect(() => {
    resumePendingFolderPrompt();
  }, [input.hasProject, input.scanStatus, input.projectPath, resumePendingFolderPrompt]);

  return {
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
    submissionAt,
    submitStallMessage,
    setSubmitStallMessage,
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
    greenfieldFallbackCount,
    dispatchPrompt,
    startFollowUpRun,
    buildFreshFollowUpRoute,
    proceedWithSubmit,
    handleResetAgentState,
    proceedAfterStaleRunReset,
    proceedAfterFeasibility,
    proceedAfterClarity,
    releaseSubmitLock,
    resolveFolderGateCancel,
    planPendingFolderResume,
    shouldResumePendingPrompt,
  };
}
