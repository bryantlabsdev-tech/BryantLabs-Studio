import { useMemo } from "react";
import type { DeriveAgentRunStateInput } from "@/core/agent/deriveAgentRunState";
import { findAgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { FollowUpRunStatus } from "@/core/build/followUpRun";
import type { UseAgentRunViewModelOptions } from "@/app/workspace/useAgentRunViewModel";

export function buildDeriveAgentRunStateInput(input: {
  readonly greenfieldRun: DeriveAgentRunStateInput["greenfieldRun"];
  readonly greenfieldPanelActive: boolean;
  readonly agentIntent: DeriveAgentRunStateInput["agentIntent"];
  readonly buildPhase: DeriveAgentRunStateInput["buildPhase"];
  readonly planApplySession: DeriveAgentRunStateInput["planApplySession"];
  readonly autoFixPhase: DeriveAgentRunStateInput["autoFixPhase"];
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly provider: DeriveAgentRunStateInput["provider"];
  readonly model: DeriveAgentRunStateInput["model"];
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly escalationNote: string | null | undefined;
  readonly plan: DeriveAgentRunStateInput["plan"];
  readonly aiPlan: DeriveAgentRunStateInput["aiPlan"];
  readonly scan: DeriveAgentRunStateInput["scan"];
  readonly promptOverride: string | null;
}): DeriveAgentRunStateInput {
  return {
    greenfieldRun: input.greenfieldRun,
    greenfieldPanelActive: input.greenfieldPanelActive,
    agentIntent: input.agentIntent,
    buildPhase: input.buildPhase,
    planApplyPhase: input.planApplySession?.phase ?? null,
    planApplySession: input.planApplySession,
    autoFixPhase: input.autoFixPhase,
    buildRunning: input.buildRunning,
    pipelineRunning: input.pipelineRunning,
    recentLogs: input.greenfieldRun.entries,
    runStartedAt: input.greenfieldRun.runStartedAt,
    provider: input.provider,
    model: input.model,
    buildError: input.buildError,
    planApplyError: input.planApplyError,
    pipelineError: input.pipelineError,
    escalationNote: input.escalationNote ?? null,
    plan: input.plan,
    aiPlan: input.aiPlan,
    scan: input.scan,
    promptOverride: input.promptOverride,
  };
}

export function useSelectedAgentRunState(input: {
  readonly deriveInput: DeriveAgentRunStateInput;
  readonly selectedAgentRunId: string | null;
  readonly agentRunHistory: readonly import("@/core/agent/agentRunHistory").AgentRunArtifact[];
  readonly tick: number;
  readonly options: UseAgentRunViewModelOptions;
}) {
  return useMemo(() => {
    const selected = findAgentRunArtifact(input.agentRunHistory, input.selectedAgentRunId);
    if (selected) {
      const runStatus: FollowUpRunStatus = {
        phase: selected.outcome === "success" ? "done" : "failed",
        progressPercent: selected.card.progressPercent,
        currentLabel: selected.card.currentStep?.label ?? selected.card.title,
        waitingLabel: "",
        nextLabel: null,
        elapsedMs: selected.card.durationMs,
        provider: selected.card.provider,
        model: selected.card.model,
        currentFile: null,
        isActive: false,
        activity: [],
        escalationNote: null,
        greenfieldProgress: null,
      };
      return {
        runStatus,
        agentRunCard: selected.card,
        dashboard: selected.dashboard,
        terminal: {
          isTerminal: true,
          outcome: selected.outcome,
          endedAtMs: selected.endedAt,
          durationMs: selected.durationMs,
        },
        prompt: selected.prompt,
        selectedArtifact: selected,
      };
    }
    return null;
  }, [
    input.agentRunHistory,
    input.selectedAgentRunId,
    input.tick,
    input.deriveInput,
    input.options,
  ]);
}
