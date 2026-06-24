import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import {
  buildDeriveAgentRunStateInput,
  useSelectedAgentRunState,
} from "@/app/workspace/agentRunStateInput";
import { deriveAgentRunState } from "@/core/agent/deriveAgentRunState";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { isRunTerminal } from "@/core/agent/runTerminal";
import type { StudioIntentKind } from "@/core/agent/classifyStudioIntent";

export interface UseAgentRunViewModelOptions {
  readonly agentIntent?: StudioIntentKind | null;
  readonly promptOverride?: string | null;
  readonly greenfieldPanelActive?: boolean;
  readonly selectedAgentRunId?: string | null;
  readonly agentRunHistory?: readonly AgentRunArtifact[];
}

export function useAgentRunViewModel(options: UseAgentRunViewModelOptions = {}) {
  const {
    greenfieldRun,
    agentGreenfieldPanelActive,
    buildStatus,
    planApplySession,
    autoFixSession,
    buildRunning,
    pipelineRunning,
    providerStatus,
    buildError,
    planApplyError,
    pipelineError,
    followUpEscalation,
    plan,
    aiPlan,
    scan,
    agentChat,
    selectedAgentRunId: workspaceSelectedRunId,
    agentRunHistory: workspaceHistory,
    selectAgentRun,
  } = useWorkspace();

  const [tick, setTick] = useState(0);

  const greenfieldPanelActive =
    options.greenfieldPanelActive ?? agentGreenfieldPanelActive;

  const selectedAgentRunId =
    options.selectedAgentRunId !== undefined
      ? options.selectedAgentRunId
      : workspaceSelectedRunId;
  const agentRunHistory = options.agentRunHistory ?? workspaceHistory;

  const promptFromChat = useMemo(() => {
    if (options.promptOverride?.trim()) return options.promptOverride.trim();
    if (selectedAgentRunId) {
      const fromChat = [...agentChat].reverse().find((m) => m.role === "user")?.text;
      return fromChat?.trim() || null;
    }
    return null;
  }, [options.promptOverride, selectedAgentRunId, agentChat]);

  const deriveInput = useMemo(
    () =>
      buildDeriveAgentRunStateInput({
        greenfieldRun,
        greenfieldPanelActive,
        agentIntent: options.agentIntent ?? null,
        buildPhase: buildStatus.phase,
        planApplySession,
        autoFixPhase: autoFixSession?.phase ?? null,
        buildRunning,
        pipelineRunning,
        provider: greenfieldRun.provider ?? providerStatus?.provider ?? null,
        model: greenfieldRun.model ?? providerStatus?.model ?? null,
        buildError,
        planApplyError,
        pipelineError,
        escalationNote: followUpEscalation?.note ?? null,
        plan,
        aiPlan,
        scan,
        promptOverride: promptFromChat,
      }),
    [
      greenfieldRun,
      greenfieldPanelActive,
      options.agentIntent,
      buildStatus.phase,
      planApplySession,
      autoFixSession?.phase,
      buildRunning,
      pipelineRunning,
      providerStatus,
      buildError,
      planApplyError,
      pipelineError,
      followUpEscalation?.note,
      plan,
      aiPlan,
      scan,
      promptFromChat,
    ],
  );

  const selectedState = useSelectedAgentRunState({
    deriveInput,
    selectedAgentRunId,
    agentRunHistory,
    tick,
    options,
  });

  const liveState = useMemo(
    () => deriveAgentRunState(deriveInput, Date.now()),
    [deriveInput, tick],
  );

  const state = selectedState ?? liveState;

  useEffect(() => {
    if (selectedState) return;
    if (!state.runStatus.isActive || isRunTerminal(greenfieldRun)) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [state.runStatus.isActive, greenfieldRun, selectedState]);

  return {
    runStatus: state.runStatus,
    agentRunCard: state.agentRunCard,
    dashboard: state.dashboard,
    terminal: state.terminal,
    prompt: state.prompt,
    selectedArtifact: selectedState?.selectedArtifact ?? null,
    selectAgentRun,
    agentRunHistory,
    deriveInput,
  };
}
