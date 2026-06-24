import type {
  PipelineAnalyticsSummary,
  PipelineSession,
  PipelineStageId,
} from "@/core/pipeline/types";

export interface StoredPipelineRun {
  readonly runId: string;
  readonly at: number;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly repairAttempts: number;
  readonly stages: readonly {
    id: PipelineStageId;
    durationMs: number | null;
    ok: boolean;
  }[];
}

const STORAGE_KEY = "bryantlabs.pipelineRuns.v1";
const MAX_RUNS = 200;

function readRuns(): StoredPipelineRun[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPipelineRun[]) : [];
  } catch {
    return [];
  }
}

function writeRuns(runs: StoredPipelineRun[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    // ignore
  }
}

export function recordPipelineRun(session: PipelineSession, ok: boolean): void {
  const durationMs = Date.now() - session.startedAt;
  const entry: StoredPipelineRun = {
    runId: session.runId,
    at: Date.now(),
    ok,
    durationMs,
    repairAttempts: session.repairAttempts,
    stages: session.stages.map((s) => ({
      id: s.id,
      durationMs: s.durationMs,
      ok: s.status === "success" || s.status === "skipped",
    })),
  };
  writeRuns([entry, ...readRuns()]);
}

export function pipelineRunsForProject(projectPath: string | null): StoredPipelineRun[] {
  void projectPath;
  return readRuns();
}

export function computePipelineAnalytics(
  runs: readonly StoredPipelineRun[],
): PipelineAnalyticsSummary {
  const totalRuns = runs.length;
  const successfulRuns = runs.filter((r) => r.ok).length;
  const failedRuns = totalRuns - successfulRuns;
  const successRatePercent =
    totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

  const repairRuns = runs.filter((r) => r.repairAttempts > 0);
  const repairSuccessRatePercent =
    repairRuns.length > 0
      ? (repairRuns.filter((r) => r.ok).length / repairRuns.length) * 100
      : null;

  const durations = runs.map((r) => r.durationMs).filter((d) => d >= 0);
  const averageDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  const stageDurations: Partial<Record<PipelineStageId, number[]>> = {};
  for (const run of runs) {
    for (const stage of run.stages) {
      if (stage.durationMs == null) continue;
      stageDurations[stage.id] = [
        ...(stageDurations[stage.id] ?? []),
        stage.durationMs,
      ];
    }
  }
  const averageStageDurationMs: Partial<Record<PipelineStageId, number>> = {};
  for (const [id, values] of Object.entries(stageDurations) as [
    PipelineStageId,
    number[],
  ][]) {
    averageStageDurationMs[id] = Math.round(
      values.reduce((a, b) => a + b, 0) / values.length,
    );
  }

  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    successRatePercent,
    repairSuccessRatePercent,
    averageDurationMs,
    averageStageDurationMs,
  };
}
