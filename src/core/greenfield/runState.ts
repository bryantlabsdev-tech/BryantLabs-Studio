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
