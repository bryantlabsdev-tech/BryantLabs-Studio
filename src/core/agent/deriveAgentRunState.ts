import { deriveAgentRunCard, type AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import {
  deriveAgentRunStatus,
  type AgentRunStatusInput,
} from "@/core/agent/agentRunStatus";
import { deriveExecutionDashboard, type ExecutionDashboardViewModel } from "@/core/agent/executionDashboard";
import {
  resolveRunTerminalState,
  type RunTerminalState,
} from "@/core/agent/runTerminal";
import type { FollowUpRunStatus } from "@/core/build/followUpRun";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { ProjectScan } from "@/types";

export interface DeriveAgentRunStateInput extends AgentRunStatusInput {
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly scan: ProjectScan | null;
  readonly promptOverride?: string | null;
}

export interface AgentRunState {
  readonly runStatus: FollowUpRunStatus;
  readonly agentRunCard: AgentRunCardViewModel;
  readonly dashboard: ExecutionDashboardViewModel;
  readonly terminal: RunTerminalState;
  readonly prompt: string | null;
}

function resolvePrompt(input: DeriveAgentRunStateInput): string | null {
  if (input.promptOverride?.trim()) return input.promptOverride.trim();
  if (input.planApplySession?.prompt?.trim()) {
    return input.planApplySession.prompt.trim();
  }
  if (input.plan?.prompt?.trim()) return input.plan.prompt.trim();
  return null;
}

/**
 * Canonical run-state derivation for agent UI surfaces.
 * Progress, duration, and active flags come from the agent run card view model.
 */
export function deriveAgentRunState(
  input: DeriveAgentRunStateInput,
  now = Date.now(),
): AgentRunState {
  const runStatus = deriveAgentRunStatus({ ...input, now });
  const prompt = resolvePrompt(input);

  const agentRunCard = deriveAgentRunCard({
    runStatus,
    greenfieldRun: input.greenfieldRun,
    planApplySession: input.planApplySession,
    plan: input.plan,
    aiPlan: input.aiPlan,
    scan: input.scan,
    prompt,
    now,
  });

  const terminal = resolveRunTerminalState(input.greenfieldRun, now);

  const runStatusUnified: FollowUpRunStatus = {
    ...runStatus,
    progressPercent: agentRunCard.progressPercent,
    elapsedMs: agentRunCard.durationMs,
    isActive: agentRunCard.overallStatus === "running",
  };

  const dashboard = deriveExecutionDashboard({
    card: agentRunCard,
    timeline: input.greenfieldRun.runTimeline,
    prompt,
    greenfieldRun: input.greenfieldRun,
  });

  return {
    runStatus: runStatusUnified,
    agentRunCard,
    dashboard,
    terminal,
    prompt,
  };
}
