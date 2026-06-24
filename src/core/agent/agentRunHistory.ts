import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { ExecutionDashboardViewModel } from "@/core/agent/executionDashboard";
import type { DiagnosticReportSnapshot } from "@/core/diagnostics/diagnosticReport";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import type { GreenfieldDebugReport } from "@/core/greenfield/debug";
import type { GreenfieldGenerationMetrics } from "@/core/greenfield/metrics";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GeneratedFile } from "@/core/greenfield/types";
import {
  normalizeStoredOutcome,
  outcomeToOverallStatus,
} from "@/core/agent/runOutcome";

const STORAGE_PREFIX = "bryantlabs.agentRunHistory.";
const MAX_RUNS = 50;

/** Persists greenfield / pre-project runs until a project folder is opened. */
export const SESSION_RUN_HISTORY_SCOPE = "__bryantlabs-session__";

export interface AgentRunArtifact {
  readonly runId: string;
  readonly runNumber: number;
  readonly prompt: string;
  readonly userMessageId: string | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly outcome: RunTerminalOutcome;
  readonly provider: string | null;
  readonly model: string | null;
  readonly filesModified: readonly string[];
  readonly fileDiffs: readonly RunFileDiff[];
  readonly logEntries?: readonly GreenfieldRunLogEntry[];
  readonly debug?: GreenfieldDebugReport | null;
  readonly generationMetrics?: GreenfieldGenerationMetrics | null;
  readonly generatedFiles?: readonly GeneratedFile[] | null;
  readonly card: AgentRunCardViewModel;
  readonly dashboard: ExecutionDashboardViewModel;
  readonly timeline: RunTimelineSnapshot | null;
  readonly diagnosticReport?: DiagnosticReportSnapshot;
  readonly diagnosticText?: string;
  readonly previousRunId?: string | null;
  readonly agentTrace?: import("@/core/agent/agentTrace").AgentTraceViewModel;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

/** Project path when open; otherwise session scope for pre-project greenfield runs. */
export function resolveRunHistoryScope(projectPath: string | undefined | null): string {
  const trimmed = projectPath?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : SESSION_RUN_HISTORY_SCOPE;
}

export function loadAgentRunHistory(scope: string): AgentRunArtifact[] {
  if (!scope) return [];
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentRunArtifact[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLoadedArtifact);
  } catch {
    return [];
  }
}

function normalizeLoadedArtifact(artifact: AgentRunArtifact): AgentRunArtifact {
  const outcome = normalizeStoredOutcome(artifact.outcome, artifact);
  if (outcome === artifact.outcome && artifact.card.overallStatus === outcomeToOverallStatus(outcome)) {
    return artifact;
  }
  const overallStatus = outcomeToOverallStatus(outcome);
  return {
    ...artifact,
    outcome,
    card: {
      ...artifact.card,
      overallStatus,
    },
    dashboard: {
      ...artifact.dashboard,
      overallStatus,
    },
  };
}

export function saveAgentRunHistory(
  scope: string,
  runs: readonly AgentRunArtifact[],
): void {
  if (!scope) return;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(runs.slice(-MAX_RUNS)));
  } catch {
    /* ignore quota */
  }
}

export function clearAgentRunHistory(scope: string): void {
  if (!scope) return;
  try {
    localStorage.removeItem(storageKey(scope));
  } catch {
    /* ignore */
  }
}

/** Move pre-project session runs into the opened project (deduped by runId). */
export function mergeSessionRunHistoryIntoProject(projectPath: string): AgentRunArtifact[] {
  const trimmed = projectPath.trim();
  if (!trimmed) return [];

  const sessionRuns = loadAgentRunHistory(SESSION_RUN_HISTORY_SCOPE);
  const projectRuns = loadAgentRunHistory(trimmed);
  if (sessionRuns.length === 0) return projectRuns;

  const seen = new Set(projectRuns.map((run) => run.runId));
  const merged = [...projectRuns];
  for (const run of sessionRuns) {
    if (seen.has(run.runId)) continue;
    seen.add(run.runId);
    merged.push(run);
  }
  const next = merged.slice(-MAX_RUNS);
  saveAgentRunHistory(trimmed, next);
  clearAgentRunHistory(SESSION_RUN_HISTORY_SCOPE);
  return next;
}

export function appendAgentRunArtifact(
  scope: string,
  artifact: AgentRunArtifact,
): AgentRunArtifact[] {
  return upsertAgentRunArtifact(scope, artifact);
}

export function upsertAgentRunArtifact(
  scope: string,
  artifact: AgentRunArtifact,
): AgentRunArtifact[] {
  const existing = loadAgentRunHistory(scope);
  const index = existing.findIndex((run) => run.runId === artifact.runId);
  const next =
    index >= 0
      ? existing.map((run, i) => (i === index ? artifact : run))
      : [...existing, artifact];
  const trimmed = next.slice(-MAX_RUNS);
  saveAgentRunHistory(scope, trimmed);
  return trimmed;
}

export function findAgentRunArtifact(
  history: readonly AgentRunArtifact[],
  runId: string | null | undefined,
): AgentRunArtifact | null {
  if (!runId) return null;
  return history.find((run) => run.runId === runId) ?? null;
}

export function artifactByUserMessageId(
  history: readonly AgentRunArtifact[],
  userMessageId: string | null | undefined,
): AgentRunArtifact | null {
  if (!userMessageId) return null;
  return history.find((run) => run.userMessageId === userMessageId) ?? null;
}

export function nextRunNumber(history: readonly AgentRunArtifact[]): number {
  if (history.length === 0) return 1;
  return Math.max(...history.map((run) => run.runNumber)) + 1;
}
