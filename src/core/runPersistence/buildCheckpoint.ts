import type { ExecutionSession } from "@/core/execution";
import type { PersistedRunCheckpoint, RunCheckpointInput } from "@/core/runPersistence/types";
import {
  normalizeBuilderForPersist,
  normalizeAgentLoopForPersist,
  normalizeExecutionForPersist,
  normalizePipelineForPersist,
} from "@/core/runPersistence/normalize";

const RESUMABLE_BUILDER = new Set([
  "ready",
  "running",
  "paused",
  "awaiting_approval",
]);

const RESUMABLE_AGENT_LOOP = new Set([
  "running",
  "paused",
  "awaiting_approval",
]);

const RESUMABLE_EXECUTION_PHASE = new Set(["ready", "running", "paused"]);

const RESUMABLE_PIPELINE = new Set([
  "queued",
  "planning",
  "coding",
  "verifying",
  "repairing",
  "awaiting_review",
]);

const RESUMABLE_PLAN_APPLY = new Set([
  "proposing",
  "review",
  "applying",
  "verifying",
]);

function executionIsIncomplete(session: ExecutionSession): boolean {
  return !session.steps.every(
    (s) =>
      s.status === "completed" ||
      s.status === "skipped" ||
      s.status === "failed",
  );
}

function builderStatusNote(status: string): string {
  switch (status) {
    case "awaiting_approval":
      return "Waiting for phase approval";
    case "paused":
      return "Paused";
    case "ready":
      return "Ready to continue";
    default:
      return "In progress";
  }
}

function agentLoopStatusNote(status: string): string {
  switch (status) {
    case "awaiting_approval":
      return "Waiting for action approval";
    case "paused":
      return "Paused";
    default:
      return "In progress";
  }
}

/** Build a checkpoint when any long-running studio work can be resumed. */
export function buildRunCheckpoint(
  input: RunCheckpointInput,
): PersistedRunCheckpoint | null {
  const savedAt = Date.now();

  if (
    input.builderSession &&
    RESUMABLE_BUILDER.has(input.builderSession.status)
  ) {
    const { session, interrupted } = normalizeBuilderForPersist(
      input.builderSession,
    );
    return {
      version: 1,
      projectPath: input.projectPath,
      savedAt,
      kind: "builder",
      label: `Autonomous build — ${session.goal.title}`,
      statusNote: builderStatusNote(session.status),
      interruptedWhileRunning: interrupted,
      builderSession: session,
      agentSession: input.agentSession,
    };
  }

  if (
    input.agentLoopSession &&
    RESUMABLE_AGENT_LOOP.has(input.agentLoopSession.status)
  ) {
    const { session, interrupted } = normalizeAgentLoopForPersist(
      input.agentLoopSession,
    );
    const goal =
      session.goal.length > 72
        ? `${session.goal.slice(0, 72)}…`
        : session.goal;
    return {
      version: 1,
      projectPath: input.projectPath,
      savedAt,
      kind: "studio_agent",
      label: `Agent — ${goal}`,
      statusNote: agentLoopStatusNote(session.status),
      interruptedWhileRunning: interrupted,
      agentLoopSession: session,
      agentSession: input.agentSession,
    };
  }

  if (
    input.pipelineSession &&
    RESUMABLE_PIPELINE.has(input.pipelineSession.status)
  ) {
    const { session, interrupted } = normalizePipelineForPersist(
      input.pipelineSession,
      input.pipelineRunning,
    );
    const prompt =
      session.prompt.length > 72
        ? `${session.prompt.slice(0, 72)}…`
        : session.prompt;
    return {
      version: 1,
      projectPath: input.projectPath,
      savedAt,
      kind: "pipeline",
      label: `Pipeline — ${prompt}`,
      statusNote:
        session.status === "awaiting_review"
          ? "Awaiting patch review"
          : "Pipeline in progress",
      interruptedWhileRunning: interrupted || input.pipelineRunning,
      pipelineSession: session,
      aiPlan: input.aiPlan,
      plan: input.plan,
      agentSession: input.agentSession,
      buildMode: input.buildMode,
      ...(input.planApplySession
        ? { planApplySession: input.planApplySession }
        : {}),
      ...(input.lastPlanPrompt
        ? { lastPlanPrompt: input.lastPlanPrompt }
        : {}),
    };
  }

  if (
    input.planApplySession &&
    RESUMABLE_PLAN_APPLY.has(input.planApplySession.phase)
  ) {
    const prompt =
      (input.lastPlanPrompt ?? input.planApplySession.prompt).length > 72
        ? `${(input.lastPlanPrompt ?? input.planApplySession.prompt).slice(0, 72)}…`
        : (input.lastPlanPrompt ?? input.planApplySession.prompt);
    return {
      version: 1,
      projectPath: input.projectPath,
      savedAt,
      kind: "build_review",
      label: `Build — ${prompt}`,
      statusNote:
        input.planApplySession.phase === "review" ||
        input.planApplySession.phase === "waiting_for_review"
          ? "Awaiting patch review"
          : "Build in progress",
      interruptedWhileRunning: input.buildRunning,
      planApplySession: input.planApplySession,
      aiPlan: input.aiPlan,
      plan: input.plan,
      agentSession: input.agentSession,
      buildMode: input.buildMode,
      ...(input.lastPlanPrompt
        ? { lastPlanPrompt: input.lastPlanPrompt }
        : {}),
    };
  }

  if (
    input.executionSession &&
    RESUMABLE_EXECUTION_PHASE.has(input.executionSession.phase) &&
    executionIsIncomplete(input.executionSession)
  ) {
    const { session, interrupted } = normalizeExecutionForPersist(
      input.executionSession,
    );
    const prompt =
      session.prompt.length > 72
        ? `${session.prompt.slice(0, 72)}…`
        : session.prompt;
    return {
      version: 1,
      projectPath: input.projectPath,
      savedAt,
      kind: "execution",
      label: `Execution — ${prompt}`,
      statusNote:
        session.phase === "paused"
          ? "Paused at step"
          : "Ready to continue",
      interruptedWhileRunning: interrupted,
      executionSession: session,
      aiPlan: input.aiPlan,
      plan: input.plan,
      agentSession: input.agentSession,
      ...(input.lastPlanPrompt
        ? { lastPlanPrompt: input.lastPlanPrompt }
        : {}),
    };
  }

  return null;
}
