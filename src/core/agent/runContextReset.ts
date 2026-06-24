import { isAgentRunActive, type AgentRunMutexInput } from "@/core/agent/agentRunMutex";
import { isTerminalRunResult } from "@/core/agent/runOutcome";
import type { AIPlanStatus } from "@/app/orchestration/types";
import type { PlanApplySession } from "@/core/planApply";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";

export interface StaleRunContextInput {
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplySession: PlanApplySession | null;
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly verification: unknown;
  readonly builderSession: unknown;
  readonly executionSession: unknown;
  readonly followUpEscalation: unknown;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly mutex: AgentRunMutexInput;
}

/** True when the workspace is idle after a successful terminal run — safe for the next prompt. */
export function isSuccessfulTerminalIdleContext(
  input: StaleRunContextInput,
): boolean {
  if (isAgentRunActive(input.mutex)) return false;
  if (input.mutex.buildRunning || input.mutex.pipelineRunning) return false;
  if (input.planApplySession != null) return false;

  if (input.aiPlanStatus === "error") return false;
  if (Boolean(input.buildError?.trim())) return false;
  if (Boolean(input.planApplyError?.trim())) return false;
  if (Boolean(input.pipelineError?.trim())) return false;
  if (input.followUpEscalation != null) return false;
  if (input.greenfieldRun.failureReport != null) return false;

  return input.greenfieldRun.runResult === "success";
}

/** Leftover workspace state that could conflict with a new run (failed/abandoned/incomplete). */
export function hasAbandonedRunArtifacts(input: StaleRunContextInput): boolean {
  return (
    input.plan != null ||
    input.aiPlan != null ||
    input.planApplySession != null ||
    input.aiPlanStatus === "error" ||
    Boolean(input.buildError?.trim()) ||
    Boolean(input.planApplyError?.trim()) ||
    Boolean(input.pipelineError?.trim()) ||
    input.verification != null ||
    input.builderSession != null ||
    input.executionSession != null ||
    input.followUpEscalation != null ||
    isTerminalRunResult(input.greenfieldRun.runResult) ||
    input.greenfieldRun.failureReport != null
  );
}

export function hasStaleRunContext(input: StaleRunContextInput): boolean {
  if (isAgentRunActive(input.mutex)) return false;
  if (isSuccessfulTerminalIdleContext(input)) return false;
  return hasAbandonedRunArtifacts(input);
}

export function hashPrompt(prompt: string): string {
  const text = prompt.trim();
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function promptPreview(prompt: string, max = 120): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export interface RunSubmitDebugContext {
  readonly prompt: string;
  readonly runId: string | null;
  readonly previousRunId: string | null;
  readonly route: string | null;
  readonly provider: string | null;
  readonly model: string | null;
}

export function logRunSubmitDebug(context: RunSubmitDebugContext): void {
  console.info(
    [
      "[agent:submit:debug]",
      `prompt="${promptPreview(context.prompt)}"`,
      `hash=${hashPrompt(context.prompt)}`,
      context.runId ? `runId=${context.runId}` : null,
      context.previousRunId ? `previousRunId=${context.previousRunId}` : null,
      context.route ? `route=${context.route}` : null,
      context.provider ? `provider=${context.provider}` : null,
      context.model ? `model=${context.model}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

export function greenfieldFailureReport(
  run: GreenfieldRunSnapshot,
): StudioFailureReport | null {
  return run.failureReport ?? null;
}
