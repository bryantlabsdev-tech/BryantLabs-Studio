import type {
  PipelineRunStatus,
  PipelineSession,
  PipelineStageId,
  PipelineStageRecord,
} from "@/core/pipeline/types";
import {
  PIPELINE_STAGE_ORDER,
  newPipelineRunId,
} from "@/core/pipeline/types";
import type { ProviderId } from "@/core/providers/types";

function emptyStage(id: PipelineStageId): PipelineStageRecord {
  return {
    id,
    status: "pending",
    provider: id === "verifier" ? "local" : "gemini",
    model: id === "verifier" ? "local" : "",
    startedAt: null,
    endedAt: null,
    durationMs: null,
    estimatedTokens: 0,
    summary: "",
    error: null,
    contextSnapshotId: null,
  };
}

export function createPipelineSession(prompt: string): PipelineSession {
  return {
    runId: newPipelineRunId(),
    prompt: prompt.trim(),
    startedAt: Date.now(),
    status: "queued",
    stages: PIPELINE_STAGE_ORDER.map(emptyStage),
    plannerOutput: null,
    verification: null,
    repairAttempts: 0,
    error: null,
  };
}

export function getPipelineStage(
  session: PipelineSession,
  id: PipelineStageId,
): PipelineStageRecord | undefined {
  return session.stages.find((s) => s.id === id);
}

export function patchPipelineStage(
  session: PipelineSession,
  id: PipelineStageId,
  patch: Partial<PipelineStageRecord>,
): PipelineSession {
  return {
    ...session,
    stages: session.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

export function startPipelineStage(
  session: PipelineSession,
  id: PipelineStageId,
  opts: {
    provider: ProviderId | "local";
    model: string;
    estimatedTokens?: number;
  },
): PipelineSession {
  const now = Date.now();
  let next = patchPipelineStage(session, id, {
    status: "running",
    provider: opts.provider,
    model: opts.model,
    startedAt: now,
    endedAt: null,
    durationMs: null,
    estimatedTokens: opts.estimatedTokens ?? 0,
    error: null,
  });
  const statusMap: Partial<Record<PipelineStageId, PipelineRunStatus>> = {
    planner: "planning",
    coder: "coding",
    verifier: "verifying",
    repair: "repairing",
  };
  if (statusMap[id]) {
    next = { ...next, status: statusMap[id]! };
  }
  return next;
}

export function finishPipelineStage(
  session: PipelineSession,
  id: PipelineStageId,
  ok: boolean,
  summary: string,
  opts?: { error?: string; contextSnapshotId?: string },
): PipelineSession {
  const stage = getPipelineStage(session, id);
  const endedAt = Date.now();
  const durationMs =
    stage?.startedAt != null ? endedAt - stage.startedAt : null;
  let next = patchPipelineStage(session, id, {
    status: ok ? "success" : "failed",
    endedAt,
    durationMs,
    summary,
    error: ok ? null : (opts?.error ?? "Stage failed"),
    ...(opts?.contextSnapshotId ? { contextSnapshotId: opts.contextSnapshotId } : {}),
  });
  if (!ok) {
    next = { ...next, status: "failed", error: opts?.error ?? `${id} failed` };
  }
  return next;
}

export function skipPipelineStage(
  session: PipelineSession,
  id: PipelineStageId,
  reason: string,
): PipelineSession {
  return patchPipelineStage(session, id, {
    status: "skipped",
    summary: reason,
  });
}

export function completePipelineSession(
  session: PipelineSession,
  ok: boolean,
): PipelineSession {
  return {
    ...session,
    status: ok ? "completed" : "failed",
  };
}

export function cancelPipelineSession(session: PipelineSession): PipelineSession {
  return { ...session, status: "cancelled" };
}

export function pipelineRunLogMessage(
  stage: PipelineStageId | "pipeline",
  event: "started" | "running" | "success" | "failed" | "completed",
): string {
  return `[${stage}] ${event}`;
}

export function isTerminalPipelineStatus(
  status: PipelineRunStatus,
): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  );
}
