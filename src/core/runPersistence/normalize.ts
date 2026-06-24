import type { BuilderSession } from "@/core/builder";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { ExecutionSession } from "@/core/execution";
import type { PipelineSession } from "@/core/pipeline/types";

export function normalizeBuilderForPersist(
  session: BuilderSession,
): { session: BuilderSession; interrupted: boolean } {
  if (session.status === "running") {
    return { session: { ...session, status: "paused" }, interrupted: true };
  }
  return { session, interrupted: false };
}

export function normalizeAgentLoopForPersist(
  session: AgentLoopSession,
): { session: AgentLoopSession; interrupted: boolean } {
  if (session.status === "running") {
    return { session: { ...session, status: "paused" }, interrupted: true };
  }
  return { session, interrupted: false };
}

export function normalizeExecutionForPersist(
  session: ExecutionSession,
): { session: ExecutionSession; interrupted: boolean } {
  if (session.phase === "running") {
    return {
      session: {
        ...session,
        phase: "paused",
        pausedAtStepId:
          session.pausedAtStepId ?? session.currentStepId ?? null,
      },
      interrupted: true,
    };
  }
  return { session, interrupted: false };
}

export function normalizePipelineForPersist(
  session: PipelineSession,
  pipelineRunning: boolean,
): { session: PipelineSession; interrupted: boolean } {
  const active = new Set([
    "queued",
    "planning",
    "coding",
    "verifying",
    "repairing",
  ]);
  if (pipelineRunning && active.has(session.status)) {
    return { session, interrupted: true };
  }
  return { session, interrupted: false };
}
