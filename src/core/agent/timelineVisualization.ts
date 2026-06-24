import type { RunTimelineSnapshot, RunTimelineStageRecord } from "@/core/agent/runTimeline";

export interface TimelineBarItem {
  readonly id: string;
  readonly label: string;
  readonly durationMs: number;
  readonly durationLabel: string;
  readonly status: "success" | "failed" | "running" | "pending";
  readonly detail: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  plan_start: "Planning",
  plan_complete: "Planning",
  coder_start: "Provider",
  coder_complete: "Provider",
  patch_generated: "Apply",
  apply_start: "Apply",
  apply_complete: "Apply",
  typescript_start: "TypeScript",
  typescript_complete: "TypeScript",
  build_start: "Build",
  build_complete: "Build",
  preview_start: "Preview",
  preview_complete: "Preview",
  audit_start: "Audit",
  audit_complete: "Audit",
  run_complete: "Complete",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}m ${rem}s`;
}

function stageStatus(
  stage: RunTimelineStageRecord,
  timeline: RunTimelineSnapshot,
): TimelineBarItem["status"] {
  const failed = stage.detail?.toLowerCase() === "failed";
  if (failed) return "failed";
  if (timeline.status === "running" && stage.stage === timeline.lastStage) return "running";
  if (timeline.status === "failed") {
    const lastOk = timeline.lastSuccessfulStage;
    const stageIdx = timeline.stages.findIndex((item) => item.at === stage.at);
    const okIdx = timeline.stages.findIndex((item) => item.stage === lastOk);
    if (stageIdx > okIdx) return "pending";
  }
  return "success";
}

function aggregateStages(stages: readonly RunTimelineStageRecord[]): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const stage of stages) {
    if (stage.stage === "run_id" || stage.stage === "route") continue;
    const label = STAGE_LABELS[stage.stage] ?? stage.stage;
    buckets.set(label, (buckets.get(label) ?? 0) + Math.max(stage.stageDurationMs, 0));
  }
  return buckets;
}

export function buildTimelineVisualization(
  timeline: RunTimelineSnapshot | null | undefined,
): TimelineBarItem[] {
  if (!timeline || timeline.stages.length === 0) return [];

  const buckets = aggregateStages(timeline.stages);
  const order = [
    "Planning",
    "Provider",
    "Apply",
    "TypeScript",
    "Build",
    "Preview",
    "Audit",
    "Complete",
  ];

  const items: TimelineBarItem[] = [];
  for (const label of order) {
    const durationMs = buckets.get(label);
    if (durationMs == null || durationMs <= 0) continue;
    const stage = [...timeline.stages]
      .reverse()
      .find((item) => (STAGE_LABELS[item.stage] ?? item.stage) === label);
    items.push({
      id: label,
      label,
      durationMs,
      durationLabel: formatDuration(durationMs),
      status: stage ? stageStatus(stage, timeline) : "success",
      detail: stage?.detail ?? null,
    });
  }

  for (const [label, durationMs] of buckets) {
    if (order.includes(label)) continue;
    items.push({
      id: label,
      label,
      durationMs,
      durationLabel: formatDuration(durationMs),
      status: "success",
      detail: null,
    });
  }

  return items;
}

export function maxTimelineDuration(items: readonly TimelineBarItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.durationMs), 0);
}
