import type { GreenfieldDebugReport } from "@/core/greenfield/debug";
import type { GreenfieldGenerationMetrics } from "@/core/greenfield/metrics";
import {
  createRunLogEntry,
  type GreenfieldRunLogEntry,
} from "@/core/greenfield/runLog";
import type {
  GreenfieldLatestAction,
  RunFinalStatus,
} from "@/core/greenfield/runLog";
import type { GreenfieldRepairSnapshot } from "@/core/greenfield/repair";
import type {
  GeneratedFile,
  GreenfieldSetupResult,
} from "@/core/greenfield/types";
import type {
  StudioActionType,
  StudioWorkflowDetails,
} from "@/core/studioRun/types";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import type { AgentRouteDecisionTrace } from "@/core/agent/unifiedAgentRoute";
import type {
  UiAuditHistoryEntry,
  UiAuditResult,
} from "@/core/greenfield/uiAudit";
import type { ProjectMemoryInjectionMeta } from "@/core/projectIntelligence/types";
import type { VerificationResult } from "@/types";

/** Global Studio run observability (live log + summary). */
export interface GreenfieldRunSnapshot {
  /** Latest workflow kind (greenfield, AI plan, apply plan, etc.). */
  actionType: StudioActionType;
  /** Open project path for edit workflows. */
  projectPath: string | null;
  /** Per-action summary fields for non-greenfield runs. */
  workflow: StudioWorkflowDetails | null;
  /** Last standalone verification (Apply Plan / Verify button). */
  verification: VerificationResult | null;
  /** Structured root-cause report for the latest failure. */
  failureReport: StudioFailureReport | null;
  entries: GreenfieldRunLogEntry[];
  runStartedAt: number | null;
  filesWritten: string[];
  debug: GreenfieldDebugReport | null;
  generationMetrics: GreenfieldGenerationMetrics | null;
  generatedFiles: GeneratedFile[] | null;
  setupResult: GreenfieldSetupResult | null;
  greenfieldRepair: GreenfieldRepairSnapshot | null;
  targetFolder: string | null;
  provider: string | null;
  model: string | null;
  genStatus: string;
  writeStatus: string;
  setupStatus: string;
  writeError: string | null;
  finalMessage: string | null;
  /** Outcome of the last completed write → setup → preview pipeline. */
  runResult: RunFinalStatus;
  /** Most recent user action (e.g. a blocked re-write); does not override runResult. */
  latestAction: GreenfieldLatestAction | null;
  /** When runResult last became success (ms since epoch). */
  lastSuccessfulRunAt: number | null;
  /** Last greenfield (or other) success message preserved when a later action fails. */
  previousSuccessfulRunMessage: string | null;
  /** Stage-by-stage follow-up / apply run timeline (timestamps + durations). */
  runTimeline: RunTimelineSnapshot | null;
  /** When the current/last run finished (ms since epoch). */
  endedAt: number | null;
  /** Final run duration (ms). Frozen when the run is terminal. */
  durationMs: number | null;
  /** Post-preview rendered UI audit (greenfield). */
  uiAuditResult: UiAuditResult | null;
  /** UI audit attempts within this run (for pattern learning). */
  uiAuditHistory: readonly UiAuditHistoryEntry[];
  /** Post-apply frozen diffs (survives planApplySession clear). */
  appliedFileDiffs: readonly import("@/core/agent/runFileDiffs").RunFileDiff[];
  /** Active project memory injection metadata for the current run. */
  projectMemoryInjection: ProjectMemoryInjectionMeta | null;
  /** Latest composer routing decision for agent trace. */
  routeDecision: AgentRouteDecisionTrace | null;
  /** Latest execution mode decision (project-aware routing guard). */
  executionMode: import("@/core/agent/executionModeConfirmation").ExecutionModeDiagnostics | null;
}

const GREENFIELD_RUN_KEYS = [
  "actionType",
  "projectPath",
  "workflow",
  "verification",
  "failureReport",
  "entries",
  "runStartedAt",
  "filesWritten",
  "debug",
  "generationMetrics",
  "generatedFiles",
  "setupResult",
  "greenfieldRepair",
  "targetFolder",
  "provider",
  "model",
  "genStatus",
  "writeStatus",
  "setupStatus",
  "writeError",
  "finalMessage",
  "runResult",
  "latestAction",
  "lastSuccessfulRunAt",
  "previousSuccessfulRunMessage",
  "runTimeline",
  "endedAt",
  "durationMs",
  "uiAuditResult",
  "uiAuditHistory",
  "appliedFileDiffs",
  "projectMemoryInjection",
  "routeDecision",
] as const satisfies ReadonlyArray<keyof GreenfieldRunSnapshot>;

export function greenfieldRunSnapshotsEqual(
  a: GreenfieldRunSnapshot,
  b: GreenfieldRunSnapshot,
): boolean {
  for (const key of GREENFIELD_RUN_KEYS) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

export function applyGreenfieldRunUpdate(
  prev: GreenfieldRunSnapshot,
  patch:
    | Partial<GreenfieldRunSnapshot>
    | ((prev: GreenfieldRunSnapshot) => Partial<GreenfieldRunSnapshot>),
): GreenfieldRunSnapshot {
  const resolved = typeof patch === "function" ? patch(prev) : patch;
  let changed = false;
  for (const key of Object.keys(resolved) as (keyof GreenfieldRunSnapshot)[]) {
    if (!Object.is(prev[key], resolved[key])) {
      changed = true;
      break;
    }
  }
  if (!changed) return prev;
  const next = { ...prev, ...resolved };
  return greenfieldRunSnapshotsEqual(prev, next) ? prev : next;
}

export function emptyGreenfieldRun(): GreenfieldRunSnapshot {
  return {
    actionType: "idle",
    projectPath: null,
    workflow: null,
    verification: null,
    failureReport: null,
    entries: [],
    runStartedAt: null,
    filesWritten: [],
    debug: null,
    generationMetrics: null,
    generatedFiles: null,
    setupResult: null,
    greenfieldRepair: null,
    targetFolder: null,
    provider: null,
    model: null,
    genStatus: "idle",
    writeStatus: "idle",
    setupStatus: "idle",
    writeError: null,
    finalMessage: null,
    runResult: "idle",
    latestAction: null,
    lastSuccessfulRunAt: null,
    previousSuccessfulRunMessage: null,
    runTimeline: null,
    endedAt: null,
    durationMs: null,
    uiAuditResult: null,
    uiAuditHistory: [],
    appliedFileDiffs: [],
    projectMemoryInjection: null,
    routeDecision: null,
    executionMode: null,
  };
}

export function appendGreenfieldRunEntry(
  snapshot: GreenfieldRunSnapshot,
  stage: GreenfieldRunLogEntry["stage"],
  status: GreenfieldRunLogEntry["status"],
  message: string,
  detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
): GreenfieldRunSnapshot {
  return {
    ...snapshot,
    entries: [
      ...snapshot.entries,
      createRunLogEntry(stage, status, message, detailsOrOpts),
    ],
    runStartedAt: snapshot.runStartedAt ?? Date.now(),
  };
}

/** Close stale running rows from a prior run so later failures do not bleed across runs. */
export function sealSupersededRunningLogEntries(
  entries: readonly GreenfieldRunLogEntry[],
  newRunStartedAt: number,
): GreenfieldRunLogEntry[] {
  return entries.map((entry) => {
    if (entry.status !== "running") return entry;
    const at = Date.parse(entry.timestamp);
    if (!Number.isFinite(at) || at >= newRunStartedAt) return entry;
    const suffix = "[superseded by new run]";
    return {
      ...entry,
      status: "success",
      details: [entry.details, suffix].filter(Boolean).join("\n"),
    };
  });
}

/** Close in-flight log rows so diagnostics do not stop at a dangling stage. */
export function completeDanglingRunningLogEntries(
  entries: readonly GreenfieldRunLogEntry[],
  status: "success" | "failed",
  reason: string,
  runStartedAt?: number | null,
): GreenfieldRunLogEntry[] {
  const detail = reason.trim();
  return entries.map((entry) => {
    if (entry.status !== "running") return entry;
    if (runStartedAt != null) {
      const at = Date.parse(entry.timestamp);
      if (Number.isFinite(at) && at < runStartedAt) return entry;
    }
    return {
      ...entry,
      status,
      ...(entry.details?.trim() || detail
        ? { details: entry.details?.trim() || detail }
        : {}),
    };
  });
}

/** Mark in-flight log rows as failed so diagnostics do not stop at a dangling stage. */
export function finalizeDanglingRunningLogEntries(
  entries: readonly GreenfieldRunLogEntry[],
  reason: string,
  runStartedAt?: number | null,
): GreenfieldRunLogEntry[] {
  const detail = reason.trim();
  if (!detail) return [...entries];
  return completeDanglingRunningLogEntries(entries, "failed", detail, runStartedAt);
}
