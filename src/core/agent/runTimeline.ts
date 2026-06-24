export type RunTimelineStageId =
  | "run_id"
  | "route"
  | "audit_start"
  | "audit_complete"
  | "explore_start"
  | "explore_complete"
  | "plan_start"
  | "plan_complete"
  | "coder_start"
  | "coder_complete"
  | "patch_generated"
  | "waiting_for_review"
  | "apply_start"
  | "apply_complete"
  | "typescript_start"
  | "typescript_complete"
  | "build_start"
  | "build_complete"
  | "preview_start"
  | "preview_complete"
  | "run_complete";

export type RunTimelineStatus = "running" | "complete" | "failed";

export interface RunTimelineStageRecord {
  readonly stage: RunTimelineStageId;
  readonly at: number;
  /** Milliseconds since run start. */
  readonly elapsedMs: number;
  /** Milliseconds since previous stage. */
  readonly stageDurationMs: number;
  readonly detail: string | null;
}

export interface RunTimelineSnapshot {
  readonly runId: string;
  readonly route: string;
  readonly startedAt: number;
  readonly stages: readonly RunTimelineStageRecord[];
  readonly lastStage: RunTimelineStageId | null;
  readonly lastSuccessfulStage: RunTimelineStageId | null;
  readonly status: RunTimelineStatus;
  readonly completedAt: number | null;
  readonly totalDurationMs: number | null;
  readonly failureDetail: string | null;
}

type TimelinePatchFn = (timeline: RunTimelineSnapshot) => void;

let activeTimeline: RunTimelineSnapshot | null = null;
let lastTimeline: RunTimelineSnapshot | null = null;
let onPatch: TimelinePatchFn | null = null;

const TERMINAL_STAGES = new Set<RunTimelineStageId>(["run_complete"]);

function persistTimeline(timeline: RunTimelineSnapshot): void {
  lastTimeline = timeline;
  onPatch?.(timeline);
}

export function bindRunTimelinePersistence(fn: TimelinePatchFn | null): void {
  onPatch = fn;
}

export function getActiveRunTimeline(): RunTimelineSnapshot | null {
  return activeTimeline;
}

export function getLastRunTimeline(): RunTimelineSnapshot | null {
  return lastTimeline;
}

function appendStage(
  timeline: RunTimelineSnapshot,
  stage: RunTimelineStageId,
  detail?: string | null,
): RunTimelineSnapshot {
  const now = Date.now();
  const prev = timeline.stages.at(-1);
  const elapsedMs = now - timeline.startedAt;
  const stageDurationMs = prev ? now - prev.at : 0;
  const record: RunTimelineStageRecord = {
    stage,
    at: now,
    elapsedMs,
    stageDurationMs,
    detail: detail?.trim() ? detail.trim() : null,
  };

  const normalizedDetail = detail?.trim().toLowerCase() ?? "";
  const stageFailed = normalizedDetail === "failed";
  const lastSuccessfulStage =
    TERMINAL_STAGES.has(stage) || stageFailed
      ? timeline.lastSuccessfulStage
      : stage;

  const next: RunTimelineSnapshot = {
    ...timeline,
    stages: [...timeline.stages, record],
    lastStage: stage,
    lastSuccessfulStage,
  };

  const detailSuffix = record.detail ? ` detail=${record.detail}` : "";
  console.log(
    `[run:${stage}] run_id=${timeline.runId} elapsed_ms=${elapsedMs} stage_duration_ms=${stageDurationMs}${detailSuffix}`,
  );

  return next;
}

export function beginRunTimeline(opts: {
  route: string;
  runId?: string;
}): string {
  const runId = opts.runId ?? `run-${Date.now()}`;
  const startedAt = Date.now();
  let timeline: RunTimelineSnapshot = {
    runId,
    route: opts.route,
    startedAt,
    stages: [],
    lastStage: null,
    lastSuccessfulStage: null,
    status: "running",
    completedAt: null,
    totalDurationMs: null,
    failureDetail: null,
  };
  timeline = appendStage(timeline, "run_id", runId);
  timeline = appendStage(timeline, "route", opts.route);
  activeTimeline = timeline;
  persistTimeline(timeline);
  return runId;
}

export function recordRunTimelineStage(
  stage: RunTimelineStageId,
  detail?: string | null,
): RunTimelineSnapshot | null {
  if (!activeTimeline) return null;
  const next = appendStage(activeTimeline, stage, detail);
  activeTimeline = next;
  persistTimeline(next);
  return next;
}

function finalizeTimeline(
  status: Exclude<RunTimelineStatus, "running">,
  detail?: string | null,
): RunTimelineSnapshot | null {
  if (!activeTimeline) return null;
  let timeline = activeTimeline;
  if (timeline.lastStage !== "run_complete") {
    timeline = appendStage(
      timeline,
      "run_complete",
      detail ?? (status === "complete" ? "ok" : "failed"),
    );
  }
  const completedAt = Date.now();
  const finalized: RunTimelineSnapshot = {
    ...timeline,
    status,
    completedAt,
    totalDurationMs: completedAt - timeline.startedAt,
    failureDetail: status === "failed" ? (detail?.trim() || null) : null,
  };
  activeTimeline = null;
  persistTimeline(finalized);
  logRunTimelineSummary(finalized);
  return finalized;
}

export function completeRunTimeline(detail?: string | null): RunTimelineSnapshot | null {
  return finalizeTimeline("complete", detail);
}

export function failRunTimeline(detail?: string | null): RunTimelineSnapshot | null {
  return finalizeTimeline("failed", detail);
}

export function logRunTimelineSummary(timeline: RunTimelineSnapshot): void {
  const lines = [
    `[run:timeline] run_id=${timeline.runId} route=${timeline.route} status=${timeline.status} last_stage=${timeline.lastStage ?? "none"} last_successful_stage=${timeline.lastSuccessfulStage ?? "none"} total_ms=${timeline.totalDurationMs ?? "n/a"}`,
    ...timeline.stages.map(
      (s) =>
        `  ${s.stage} +${s.elapsedMs}ms (+${s.stageDurationMs}ms)${s.detail ? ` — ${s.detail}` : ""}`,
    ),
  ];
  console.log(lines.join("\n"));
}

export function runTimelineStageStatus(
  stage: RunTimelineStageRecord,
  timeline: RunTimelineSnapshot,
): import("@/core/greenfield/runLog").RunLogStatus {
  const normalizedDetail = stage.detail?.trim().toLowerCase() ?? "";
  if (normalizedDetail === "failed") return "failed";
  if (timeline.status === "running") {
    return stage.stage === timeline.lastStage ? "running" : "success";
  }
  if (timeline.status === "complete") return "success";

  const lastOk = timeline.lastSuccessfulStage;
  if (!lastOk) return "success";

  const stageIdx = timeline.stages.findIndex((item) => item.at === stage.at);
  const lastOkIdx = timeline.stages.findIndex((item) => item.stage === lastOk);
  if (stageIdx >= 0 && lastOkIdx >= 0) {
    if (stageIdx <= lastOkIdx) return "success";
    if (stage.stage === timeline.lastStage) return "failed";
    if (stageIdx > lastOkIdx) return "pending";
  }
  return "success";
}

export function formatRunTimelineForSummary(
  timeline: RunTimelineSnapshot | null | undefined,
): string[] {
  if (!timeline || timeline.stages.length === 0) return [];
  const header = [
    "",
    "Run timeline:",
    `  run_id: ${timeline.runId}`,
    `  route: ${timeline.route}`,
    `  status: ${timeline.status}`,
    `  last_stage: ${timeline.lastStage ?? "(none)"}`,
    `  last_successful_stage: ${timeline.lastSuccessfulStage ?? "(none)"}`,
    `  total_ms: ${timeline.totalDurationMs ?? "(running)"}`,
  ];
  const stages = timeline.stages.map(
    (s) =>
      `  ${s.stage}: +${s.elapsedMs}ms (+${s.stageDurationMs}ms)${s.detail ? ` — ${s.detail}` : ""}`,
  );
  return [...header, ...stages];
}
