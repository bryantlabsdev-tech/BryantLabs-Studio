import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import { inferOutcomeFromSnapshot, type RunOutcome } from "@/core/agent/runOutcome";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

export type RunTerminalOutcome = RunOutcome;

export interface RunTerminalState {
  readonly isTerminal: boolean;
  readonly outcome: RunTerminalOutcome | null;
  readonly endedAtMs: number | null;
  readonly durationMs: number | null;
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function endedAtFromTimeline(timeline: RunTimelineSnapshot | null): number | null {
  if (!timeline) return null;
  if (timeline.completedAt != null) return timeline.completedAt;
  const lastStage = timeline.stages[timeline.stages.length - 1];
  return lastStage?.at ?? null;
}

function durationFromTimeline(timeline: RunTimelineSnapshot | null): number | null {
  if (!timeline?.totalDurationMs && timeline?.totalDurationMs !== 0) return null;
  return Math.max(0, timeline.totalDurationMs);
}

function resolveEndedAtMs(run: GreenfieldRunSnapshot): number | null {
  if (run.endedAt != null) return run.endedAt;
  const fromTimeline = endedAtFromTimeline(run.runTimeline);
  if (fromTimeline != null) return fromTimeline;
  if (run.latestAction?.at) {
    const fromAction = parseTimestampMs(run.latestAction.at);
    if (fromAction != null) return fromAction;
  }
  const lastEntry = run.entries[run.entries.length - 1];
  return parseTimestampMs(lastEntry?.timestamp);
}

function resolveTerminalOutcome(run: GreenfieldRunSnapshot): RunTerminalOutcome | null {
  return inferOutcomeFromSnapshot(run);
}

export function resolveRunTerminalState(
  run: GreenfieldRunSnapshot,
  now = Date.now(),
): RunTerminalState {
  const outcome = resolveTerminalOutcome(run);
  const isTerminal = outcome != null;

  if (!isTerminal) {
    return {
      isTerminal: false,
      outcome: null,
      endedAtMs: null,
      durationMs: null,
    };
  }

  const endedAtMs = resolveEndedAtMs(run) ?? now;
  const durationMs =
    run.durationMs ??
    durationFromTimeline(run.runTimeline) ??
    (run.runStartedAt != null ? Math.max(0, endedAtMs - run.runStartedAt) : 0);

  return {
    isTerminal: true,
    outcome,
    endedAtMs,
    durationMs,
  };
}

export function isRunTerminal(run: GreenfieldRunSnapshot, now = Date.now()): boolean {
  return resolveRunTerminalState(run, now).isTerminal;
}

export function getRunEndedAtMs(run: GreenfieldRunSnapshot, now = Date.now()): number | null {
  return resolveRunTerminalState(run, now).endedAtMs;
}

export function getRunDurationMs(run: GreenfieldRunSnapshot, now = Date.now()): number {
  const terminal = resolveRunTerminalState(run, now);
  if (terminal.isTerminal && terminal.durationMs != null) {
    return terminal.durationMs;
  }

  const endedAtMs = run.endedAt ?? terminal.endedAtMs;
  const startedAt = run.runStartedAt;

  if (endedAtMs != null && startedAt != null) {
    return Math.max(0, endedAtMs - startedAt);
  }
  if (run.durationMs != null) {
    return Math.max(0, run.durationMs);
  }
  const timelineDuration = durationFromTimeline(run.runTimeline);
  if (timelineDuration != null) {
    return timelineDuration;
  }
  if (startedAt != null && !terminal.isTerminal) {
    return Math.max(0, now - startedAt);
  }
  return 0;
}

export function resolveEffectiveRunActive(input: {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly followUpActive: boolean;
  readonly now?: number;
}): boolean {
  if (isRunTerminal(input.greenfieldRun, input.now)) return false;
  return input.followUpActive;
}
