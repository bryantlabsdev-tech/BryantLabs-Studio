import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import { runTimelineStageStatus } from "@/core/agent/runTimeline";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";
import type { GreenfieldGenerationMetrics } from "@/core/greenfield/metrics";
import {
  type GreenfieldRunLogEntry,
  type RunLogStage,
  type RunLogStatus,
  RUN_LOG_STAGE_LABELS,
} from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GeneratedFile } from "@/core/greenfield/types";
import { collectGreenfieldMissingFiles, presentGreenfieldFilePaths } from "@/core/greenfield/missingFiles";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import {
  buildPlannerPreflightDiagnostics,
  parsePlannerPreflightFromLogDetails,
  readPreflightDiagnostics,
} from "@/core/planner/plannerPreflight";
import {
  parsePlanApplyTargetReport,
} from "@/core/planApply/collectTargets";
import {
  parseAiCallBudgetFromLogDetails,
} from "@/core/providers/aiCallBudgetDiagnostics";
import {
  stageLabelForAiCall,
  type AiCallUsageEntry,
} from "@/core/providers/greenfieldCallBudget";
import { outcomeLabel } from "@/core/agent/runOutcome";
import { computeRunHealth, type RunHealthScore } from "@/core/agent/runHealth";
import { extractRunFileDiffs, resolveAllowGeneratedFileDiffs } from "@/core/agent/runFileDiffs";
import { readProjectMemoryInjectionMeta } from "@/core/projectIntelligence/buildProjectMemoryContext";
import { estimateRunCostFromInspectorMetrics } from "@/core/analytics/runCostEstimate";
import { buildAgentTrace, type AgentTraceViewModel } from "@/core/agent/agentTrace";
import type { ProjectScan } from "@/types";

export type RunInspectorTab = "timeline" | "trace" | "events" | "ai" | "diffs" | "metrics";

export interface RunInspectorTimelineItem {
  readonly id: string;
  readonly time: string;
  readonly timestamp: number;
  readonly label: string;
  readonly status: RunLogStatus;
  readonly detail: string | null;
}

export interface RunInspectorEvent {
  readonly id: string;
  readonly time: string;
  readonly timestamp: number;
  readonly event: string;
  readonly status: RunLogStatus;
  readonly message: string;
  readonly detail: string | null;
}

export interface RunInspectorAiResponse {
  readonly rawPreview: string | null;
  readonly rawResponseLength: number | null;
  readonly parserPatternsAttempted: readonly string[];
  readonly parserFailureReasons: Readonly<Record<string, string>>;
  readonly repairAttempted: boolean;
  readonly repairSucceeded: boolean;
  readonly fallbackSkeletonCreated: boolean;
  readonly backupProviderAttempted: boolean;
  readonly backupProviderUsed: string | null;
  readonly backupProviderFailureReason: string | null;
  readonly plannedFiles: readonly string[];
  readonly proposedFiles: readonly string[];
  readonly parsedFiles: readonly string[];
  readonly expectedFiles: readonly string[];
  readonly missingFiles: readonly string[];
  readonly malformedBlocks: readonly string[];
  readonly warnings: readonly string[];
  readonly providerRequestSent: boolean;
  readonly exactFailureStage: string | null;
  readonly exactProviderError: string | null;
  readonly retryFailoverNotes: readonly string[];
}

export interface RunInspectorMetrics {
  readonly durationMs: number | null;
  readonly durationLabel: string;
  readonly tokensEstimated: number | null;
  readonly promptTokens: number | null;
  readonly responseTokens: number | null;
  readonly filesCreated: number;
  readonly filesModified: number;
  readonly commandsRun: readonly string[];
  readonly provider: string | null;
  readonly model: string | null;
  readonly aiCalls: number;
  readonly aiCallMax: number | null;
  readonly aiCallUsage: readonly AiCallUsageEntry[];
  readonly estimatedInputTokens: number | null;
  readonly estimatedOutputTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly costIsEstimated: boolean;
  readonly memoryInjected: boolean;
  readonly memoryContextSize: number | null;
  readonly memoryRecommendationUsed: boolean;
  readonly dependencyRepairs: readonly string[];
  readonly npmInstallRetried: boolean;
}

export interface RunInspectorPreflight {
  readonly gate: string | null;
  readonly providerCallAttempted: boolean;
  readonly providerBlockedReason: string | null;
  readonly skipReason: string | null;
  readonly route: string | null;
  readonly editableFilesCount: number;
  readonly targetFilesCount: number;
  readonly fallbackEligible: boolean;
  readonly fallbackAttempted: boolean;
  readonly fallbackUsed: boolean;
  readonly fallbackNotUsedReason: string | null;
  readonly promptClassification: string;
}

export interface RunInspectorApply {
  readonly plannedFiles: readonly string[];
  readonly allowedFiles: readonly string[];
  readonly rejectedFiles: readonly string[];
  readonly patchGenerationProviderCalls: number;
  readonly budgetMax: number | null;
  readonly budgetUsed: number | null;
  readonly budgetRemaining: number | null;
  readonly budgetExceeded: boolean;
  readonly budgetExceededReason: string | null;
  readonly patchProposalCount: number;
  readonly deterministicFallbackUsed: boolean;
  readonly applyFallbackNote: string | null;
}

export interface RunInspectorViewModel {
  readonly runId: string;
  readonly runNumber: number | null;
  readonly prompt: string;
  readonly outcome: RunTerminalOutcome | null;
  readonly outcomeLabel: string;
  readonly route: string | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly timeline: readonly RunInspectorTimelineItem[];
  readonly events: readonly RunInspectorEvent[];
  readonly aiResponse: RunInspectorAiResponse;
  readonly fileDiffs: readonly RunFileDiff[];
  readonly metrics: RunInspectorMetrics;
  readonly preflight: RunInspectorPreflight | null;
  readonly apply: RunInspectorApply | null;
  readonly health: RunHealthScore | null;
  readonly trace: AgentTraceViewModel;
  readonly hasData: boolean;
}

export interface BuildRunInspectorInput {
  readonly runId: string;
  readonly runNumber?: number | null;
  readonly prompt: string;
  readonly outcome?: RunTerminalOutcome | null;
  readonly route?: string | null;
  readonly startedAt?: number | null;
  readonly endedAt?: number | null;
  readonly durationMs?: number | null;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly card?: AgentRunCardViewModel | null;
  readonly artifact?: AgentRunArtifact | null;
  readonly aiPlan?: AIPlanResult | null;
  readonly planApplySession?: import("@/core/planApply").PlanApplySession | null;
  readonly scan?: ProjectScan | null;
}

interface TimelineMilestone {
  readonly key: string;
  readonly label: string;
  readonly stages: readonly RunLogStage[];
  readonly match?: (entry: GreenfieldRunLogEntry) => boolean;
}

const TIMELINE_MILESTONES: readonly TimelineMilestone[] = [
  { key: "prompt", label: "Prompt Submitted", stages: ["prompt"] },
  {
    key: "greenfield",
    label: "Greenfield Detected",
    stages: ["folder", "generation"],
    match: (entry) =>
      entry.stage === "folder" ||
      /greenfield|new app|creating app/i.test(entry.message),
  },
  {
    key: "provider_request",
    label: "Provider Request Sent",
    stages: ["provider", "provider_call", "ai_call"],
  },
  { key: "provider_response", label: "Provider Response Received", stages: ["provider_response"] },
  {
    key: "parser",
    label: "Files Parsed",
    stages: ["parser"],
    match: (entry) => entry.status === "success" || entry.status === "running",
  },
  { key: "write", label: "Files Written", stages: ["write", "approve"] },
  { key: "npm", label: "npm install", stages: ["npm_install"] },
  { key: "build", label: "Build", stages: ["build", "typescript"] },
  {
    key: "preview",
    label: "Preview Ready",
    stages: ["preview"],
    match: (entry) => entry.status === "success",
  },
];

const STAGE_EVENT_BASE: Partial<Record<RunLogStage, string>> = {
  folder: "greenfield.detect",
  prompt: "prompt",
  generation: "generation",
  provider: "provider",
  provider_call: "provider",
  provider_response: "provider",
  provider_health: "provider.health",
  provider_fallback: "provider.fallback",
  parser: "parser",
  review: "review",
  approve: "approve",
  write: "file",
  npm_install: "npm",
  typescript: "typescript",
  build: "build",
  preview: "preview",
  ui_audit: "ui.audit",
  ui_repair: "ui.repair",
  greenfield_repair: "greenfield.repair",
  ai_plan: "plan",
  apply_plan: "apply",
  studio_agent: "agent",
  pipeline: "pipeline",
  pipeline_complete: "pipeline",
  error: "error",
};

function formatClockTime(timestamp: number | string): string {
  const ms = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(ms)) return "--:--:--";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function entryTimestamp(entry: GreenfieldRunLogEntry): number {
  const parsed = Date.parse(entry.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventNameForEntry(entry: GreenfieldRunLogEntry): string {
  const base = STAGE_EVENT_BASE[entry.stage] ?? entry.stage.replace(/_/g, ".");
  if (entry.status === "success") {
    if (entry.stage === "provider" || entry.stage === "provider_call" || entry.stage === "ai_call") {
      return "provider.request";
    }
    if (entry.stage === "provider_response") return "provider.response";
    if (entry.stage === "parser") return "parser.success";
    if (entry.stage === "write") return "file.write";
    if (entry.stage === "build") return "build.success";
    if (entry.stage === "preview") return "preview.ready";
    if (entry.stage === "npm_install") return "npm.install";
    if (entry.stage === "typescript") return "typescript.success";
    return `${base}.success`;
  }
  if (entry.status === "failed") {
    if (entry.stage === "parser") return "parser.fail";
    if (entry.stage === "build") return "build.fail";
    if (entry.stage === "preview") return "preview.fail";
    if (entry.stage === "npm_install") return "npm.fail";
    return `${base}.fail`;
  }
  if (entry.status === "running") {
    if (entry.stage === "parser") return "parser.start";
    if (entry.stage === "build") return "build.start";
    if (entry.stage === "preview") return "preview.start";
    if (entry.stage === "npm_install") return "npm.start";
    if (entry.stage === "provider" || entry.stage === "provider_call") return "provider.request";
    return `${base}.start`;
  }
  return `${base}.${entry.status}`;
}

function pickMilestoneEntry(
  entries: readonly GreenfieldRunLogEntry[],
  milestone: TimelineMilestone,
): GreenfieldRunLogEntry | null {
  for (const entry of entries) {
    if (!milestone.stages.includes(entry.stage)) continue;
    if (milestone.match && !milestone.match(entry)) continue;
    if (entry.status === "pending") continue;
    return entry;
  }
  return null;
}

function deriveTimeline(
  entries: readonly GreenfieldRunLogEntry[],
  runTimeline: RunTimelineSnapshot | null | undefined,
  actionType: string,
): RunInspectorTimelineItem[] {
  const items: RunInspectorTimelineItem[] = [];

  for (const milestone of TIMELINE_MILESTONES) {
    if (milestone.key === "greenfield" && actionType !== "greenfield") continue;
    const entry = pickMilestoneEntry(entries, milestone);
    if (!entry) continue;
    items.push({
      id: `milestone-${milestone.key}`,
      time: formatClockTime(entryTimestamp(entry)),
      timestamp: entryTimestamp(entry),
      label: milestone.label,
      status: entry.status,
      detail: entry.message.trim() || null,
    });
  }

  if (items.length === 0 && runTimeline?.stages.length) {
    for (const stage of runTimeline.stages) {
      if (stage.stage === "run_id" || stage.stage === "route") continue;
      items.push({
        id: `timeline-${stage.stage}-${stage.at}`,
        time: formatClockTime(stage.at),
        timestamp: stage.at,
        label: stage.stage.replace(/_/g, " "),
        status: runTimelineStageStatus(stage, runTimeline),
        detail: stage.detail,
      });
    }
  }

  return items.sort((a, b) => a.timestamp - b.timestamp);
}

function derivePreflight(input: BuildRunInspectorInput): RunInspectorPreflight | null {
  const fromAiPlan = readPreflightDiagnostics(input.aiPlan ?? null);
  if (fromAiPlan) {
    return {
      gate: fromAiPlan.gate,
      providerCallAttempted: fromAiPlan.providerCallAttempted,
      providerBlockedReason: fromAiPlan.providerBlockedReason,
      skipReason: fromAiPlan.skipReason,
      route: fromAiPlan.route,
      editableFilesCount: fromAiPlan.editableFilesCount,
      targetFilesCount: fromAiPlan.targetFilesCount,
      fallbackEligible: fromAiPlan.fallbackEligible,
      fallbackAttempted: fromAiPlan.fallbackAttempted,
      fallbackUsed: fromAiPlan.fallbackUsed,
      fallbackNotUsedReason: fromAiPlan.fallbackNotUsedReason,
      promptClassification: fromAiPlan.promptClassification,
    };
  }

  const route =
    input.route ??
    input.greenfieldRun.runTimeline?.route ??
    input.artifact?.timeline?.route ??
    null;

  for (let i = input.greenfieldRun.entries.length - 1; i >= 0; i -= 1) {
    const entry = input.greenfieldRun.entries[i];
    if (entry.stage !== "ai_plan" || !entry.details?.trim()) continue;
    const parsed = parsePlannerPreflightFromLogDetails(entry.details);
    if (!parsed) continue;
    return {
      gate: parsed.gate,
      providerCallAttempted: parsed.providerCallAttempted,
      providerBlockedReason: parsed.providerBlockedReason,
      skipReason: parsed.skipReason,
      route: parsed.route ?? route,
      editableFilesCount: parsed.editableFilesCount,
      targetFilesCount: parsed.targetFilesCount,
      fallbackEligible: parsed.fallbackEligible,
      fallbackAttempted: parsed.fallbackAttempted,
      fallbackUsed: parsed.fallbackUsed,
      fallbackNotUsedReason: parsed.fallbackNotUsedReason,
      promptClassification: parsed.promptClassification,
    };
  }

  const diagnostics = buildPlannerPreflightDiagnostics({
    userPrompt: input.prompt,
    plan: null,
    route,
  });
  if (input.greenfieldRun.entries.length === 0 && !input.aiPlan) return null;
  return {
    gate: null,
    providerCallAttempted: countAiCalls(input.greenfieldRun.entries) > 0,
    providerBlockedReason: null,
    skipReason: null,
    route,
    editableFilesCount: diagnostics.editableFilesCount,
    targetFilesCount: diagnostics.targetFilesCount,
    fallbackEligible: diagnostics.fallbackEligible,
    fallbackAttempted: false,
    fallbackUsed: false,
    fallbackNotUsedReason: diagnostics.fallbackNotUsedReason,
    promptClassification: diagnostics.promptClassification,
  };
}

function countPatchGenerationProviderCalls(
  entries: readonly GreenfieldRunLogEntry[],
): number {
  return entries.filter(
    (entry) =>
      entry.stage === "ai_call" &&
      /coder|apply_plan/i.test(`${entry.message} ${entry.details ?? ""}`),
  ).length;
}

function countPatchProposals(input: BuildRunInspectorInput): number {
  const fromSession =
    input.planApplySession?.files.filter(
      (file) => file.status === "ready" && file.diffStats?.changed,
    ).length ?? 0;
  if (fromSession > 0) return fromSession;

  const fromApplied = (input.greenfieldRun.appliedFileDiffs ?? []).filter(
    (diff) => diff.linesAdded + diff.linesRemoved > 0 || (diff.after?.length ?? 0) > 0,
  ).length;
  if (fromApplied > 0) return fromApplied;

  return (input.artifact?.fileDiffs ?? []).filter(
    (diff) => diff.linesAdded + diff.linesRemoved > 0 || (diff.after?.length ?? 0) > 0,
  ).length;
}

function readDeterministicApplyFallback(
  entries: readonly GreenfieldRunLogEntry[],
): { used: boolean; note: string | null } {
  const fallbackEntry = entries.find(
    (entry) =>
      entry.stage === "apply_plan" &&
      entry.status === "success" &&
      /deterministic patch proposal/i.test(entry.message),
  );
  if (!fallbackEntry) return { used: false, note: null };

  const budgetEntry = entries.find(
    (entry) =>
      entry.stage === "apply_plan" &&
      entry.message.includes("Patch generation budget blocked"),
  );
  const budgetReason = budgetEntry?.details
    ? parseAiCallBudgetFromLogDetails(budgetEntry.details)?.budgetExceededReason
    : null;

  const note = budgetReason
    ? `Provider coder failed (${budgetReason}); deterministic fallback patch used.`
    : "Provider coder failed or was unavailable; deterministic fallback patch used.";

  return { used: true, note };
}

function deriveApply(input: BuildRunInspectorInput): RunInspectorApply | null {
  let targetReport: ReturnType<typeof parsePlanApplyTargetReport> = null;
  let budget: ReturnType<typeof parseAiCallBudgetFromLogDetails> = null;

  for (let i = input.greenfieldRun.entries.length - 1; i >= 0; i -= 1) {
    const entry = input.greenfieldRun.entries[i];
    if (!entry.details?.trim()) continue;
    if (!targetReport && entry.stage === "apply_plan" && entry.message.includes("Apply targets")) {
      targetReport = parsePlanApplyTargetReport(entry.details);
    }
    if (!budget && entry.stage === "apply_plan" && entry.message.includes("budget")) {
      budget = parseAiCallBudgetFromLogDetails(entry.details);
    }
    if (targetReport && budget) break;
  }

  const plannedFromAi =
    input.aiPlan?.ok && input.aiPlan.plan?.files.length
      ? input.aiPlan.plan.files.map((file) => file.path)
      : [];
  const plannedFiles = targetReport?.plannedFiles.length
    ? targetReport.plannedFiles
    : plannedFromAi;

  const proposalCount = countPatchProposals(input);
  const fallback = readDeterministicApplyFallback(input.greenfieldRun.entries);

  if (
    plannedFiles.length === 0 &&
    !targetReport &&
    !budget &&
    proposalCount === 0 &&
    !input.planApplySession &&
    !fallback.used
  ) {
    return null;
  }

  return {
    plannedFiles,
    allowedFiles: targetReport?.allowlistedFiles ?? targetReport?.patchTargets ?? [],
    rejectedFiles: targetReport?.rejectedFiles ?? [],
    patchGenerationProviderCalls: countPatchGenerationProviderCalls(
      input.greenfieldRun.entries,
    ),
    budgetMax: budget?.maxCalls ?? null,
    budgetUsed: budget?.usedCalls ?? null,
    budgetRemaining: budget?.remainingCalls ?? null,
    budgetExceeded: budget?.budgetExceeded ?? false,
    budgetExceededReason: budget?.budgetExceededReason ?? null,
    patchProposalCount: proposalCount,
    deterministicFallbackUsed: fallback.used,
    applyFallbackNote: fallback.note,
  };
}

function deriveEvents(entries: readonly GreenfieldRunLogEntry[]): RunInspectorEvent[] {
  return entries.map((entry) => ({
    id: entry.id,
    time: formatClockTime(entryTimestamp(entry)),
    timestamp: entryTimestamp(entry),
    event: eventNameForEntry(entry),
    status: entry.status,
    message: entry.message,
    detail: entry.details?.trim() || null,
  }));
}

function deriveAiResponse(input: {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly artifact?: AgentRunArtifact | null;
  readonly card?: AgentRunCardViewModel | null;
  readonly aiPlan?: AIPlanResult | null;
  readonly planApplySession?: import("@/core/planApply").PlanApplySession | null;
}): RunInspectorAiResponse {
  const markerAudit =
    input.greenfieldRun.debug?.markerAudit ??
    input.artifact?.debug?.markerAudit ??
    null;

  const generatedFiles =
    input.greenfieldRun.generatedFiles ??
    input.artifact?.generatedFiles ??
    null;

  const parsedFromFiles = (generatedFiles ?? []).map((file) => file.path);
  const parsedFromAudit = markerAudit?.completeMarkerPairs ?? [];
  const parsedFiles =
    parsedFromFiles.length > 0 ? parsedFromFiles : [...parsedFromAudit];

  const plannedFromAiPlan =
    input.aiPlan?.ok && input.aiPlan.plan?.files.length
      ? input.aiPlan.plan.files.map((file) => file.path)
      : [];
  const plannedFromSession = input.planApplySession?.files.map((file) => file.relPath) ?? [];
  const plannedFromTimeline = (input.greenfieldRun.runTimeline?.stages ?? [])
    .filter((stage) => stage.stage === "plan_complete" && stage.detail && stage.detail !== "failed")
    .flatMap((stage) =>
      stage.detail!.includes("/") || stage.detail!.includes(".")
        ? stage.detail!.split(",").map((file) => file.trim()).filter(Boolean)
        : [],
    );
  const plannedFiles = [
    ...new Set([...plannedFromAiPlan, ...plannedFromSession, ...plannedFromTimeline]),
  ];

  const proposedFromSession = (input.planApplySession?.files ?? [])
    .filter((file) => file.status === "ready" || file.proposal)
    .map((file) => file.relPath);
  const proposedFromApplied = (input.greenfieldRun.appliedFileDiffs ?? []).map(
    (diff) => diff.path,
  );
  const proposedFromArtifact = (input.artifact?.fileDiffs ?? [])
    .filter((diff) => (diff.after?.length ?? 0) > 0 || diff.linesAdded + diff.linesRemoved > 0)
    .map((diff) => diff.path);
  const proposedFiles = [
    ...new Set([
      ...proposedFromSession,
      ...proposedFromApplied,
      ...proposedFromArtifact,
    ]),
  ];

  const have = presentGreenfieldFilePaths(input.greenfieldRun);
  const missingFiles = collectGreenfieldMissingFiles(input.greenfieldRun);

  const warnings: string[] = [];
  if (markerAudit) {
    if (markerAudit.detectedFileStarts.length > markerAudit.completeMarkerPairs.length) {
      warnings.push(
        `${markerAudit.detectedFileStarts.length - markerAudit.completeMarkerPairs.length} file marker(s) started but not completed.`,
      );
    }
    if (!markerAudit.hasExampleOutputFormat) {
      warnings.push("Prompt did not include the example @@FILE@@ output format.");
    }
    if (!markerAudit.explicitlyRequiresAllSeven) {
      warnings.push("Prompt did not explicitly require all seven greenfield files.");
    }
  }

  for (const entry of input.greenfieldRun.entries) {
    if (entry.stage === "parser" && entry.status === "failed") {
      warnings.push(entry.message);
    }
    if (entry.stage === "parser" && entry.details?.trim()) {
      warnings.push(entry.details.trim());
    }
  }

  const applyFallback = readDeterministicApplyFallback(input.greenfieldRun.entries);
  if (applyFallback.note) {
    warnings.push(applyFallback.note);
  }

  const parseTrace =
    input.greenfieldRun.debug?.parseTrace ??
    input.artifact?.debug?.parseTrace ??
    null;

  const rawPreview =
    parseTrace?.rawResponsePreview ??
    markerAudit?.rawResponsePreview ??
    input.greenfieldRun.debug?.markerAudit?.rawResponsePreview ??
    input.artifact?.diagnosticReport?.aiResponsePreview ??
    null;

  const expectedFiles = markerAudit?.requiredFiles ?? [...GREENFIELD_FILE_PATHS];
  const malformedBlocks = [
    ...new Set([
      ...missingFiles,
      ...(markerAudit
        ? markerAudit.detectedFileStarts.filter(
            (path) => !markerAudit.completeMarkerPairs.includes(path) && !have.has(path),
          )
        : []),
    ]),
  ];

  const retryFailoverNotes: string[] = [];
  let providerRequestSent = countAiCalls(input.greenfieldRun.entries) > 0;
  let exactFailureStage: string | null = null;
  let exactProviderError: string | null = null;
  let backupProviderAttempted = parseTrace?.backupProviderAttempted ?? false;
  let backupProviderUsed = parseTrace?.backupProviderUsed ?? null;
  let backupProviderFailureReason = parseTrace?.backupProviderFailureReason ?? null;

  for (const entry of input.greenfieldRun.entries) {
    if (entry.stage === "provider" && entry.status === "failed" && entry.message) {
      exactProviderError = entry.details?.trim() || entry.message;
      exactFailureStage = /budget|max ai calls/i.test(exactProviderError)
        ? "budget"
        : /preflight|api key|missing key/i.test(exactProviderError)
          ? "preflight"
          : /cancel/i.test(exactProviderError)
            ? "cancelled"
            : "provider_blocked";
    }
    if (
      entry.stage === "provider_call" ||
      (entry.stage === "ai_call" && entry.status !== "failed")
    ) {
      providerRequestSent = true;
    }
    if (
      entry.details?.includes("[provider_fallback]") ||
      entry.details?.includes("[provider_retry]") ||
      entry.details?.includes("[provider_preflight]")
    ) {
      retryFailoverNotes.push(entry.details.trim());
    }
    if (entry.details?.includes("[provider_fallback]") && /selected/i.test(entry.message)) {
      backupProviderAttempted = true;
      backupProviderUsed = entry.message.trim() || backupProviderUsed;
    }
    if (entry.stage === "parser" && entry.status === "failed" && !exactFailureStage) {
      exactFailureStage = "parser";
      exactProviderError = entry.details?.trim() || entry.message;
    }
  }

  const latestDetail = input.greenfieldRun.latestAction?.detail?.trim();
  if (!exactProviderError && latestDetail) {
    exactProviderError = latestDetail;
  }

  return {
    rawPreview,
    rawResponseLength: parseTrace?.rawResponseLength ?? (rawPreview ? rawPreview.length : null),
    parserPatternsAttempted: parseTrace?.parserPatternsAttempted ?? [],
    parserFailureReasons: parseTrace?.parserFailureReasons ?? {},
    repairAttempted: parseTrace?.repairAttempted ?? false,
    repairSucceeded: parseTrace?.repairSucceeded ?? false,
    fallbackSkeletonCreated: parseTrace?.fallbackSkeletonCreated ?? false,
    backupProviderAttempted,
    backupProviderUsed,
    backupProviderFailureReason,
    plannedFiles,
    proposedFiles,
    parsedFiles,
    expectedFiles,
    missingFiles,
    malformedBlocks,
    warnings: [...new Set(warnings.filter(Boolean))],
    providerRequestSent,
    exactFailureStage,
    exactProviderError,
    retryFailoverNotes: [...new Set(retryFailoverNotes.filter(Boolean))],
  };
}

function countAiCalls(entries: readonly GreenfieldRunLogEntry[]): number {
  return entries.filter(
    (entry) =>
      entry.stage === "provider_call" ||
      entry.stage === "ai_call" ||
      entry.stage === "provider" ||
      entry.stage === "provider_response",
  ).length;
}

function deriveCommands(entries: readonly GreenfieldRunLogEntry[]): string[] {
  const commands: string[] = [];
  for (const entry of entries) {
    if (entry.stage === "npm_install") commands.push("npm install");
    if (entry.stage === "build") commands.push("npm run build");
    if (entry.stage === "typescript") commands.push("tsc --noEmit");
    if (entry.stage === "preview") commands.push("vite preview / dev server");
    if (/npm (run|install)/i.test(entry.message)) commands.push(entry.message.trim());
  }
  return [...new Set(commands)];
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}m ${rem}s`;
}

function deriveAiCallUsageFromLog(
  entries: readonly GreenfieldRunLogEntry[],
): { readonly maxCalls: number | null; readonly usage: readonly AiCallUsageEntry[] } {
  const aiEntries = entries.filter((entry) => entry.stage === "ai_call");
  let maxCalls: number | null = null;
  const usage: AiCallUsageEntry[] = [];

  for (const entry of aiEntries) {
    const budget = parseAiCallBudgetFromLogDetails(entry.details ?? "");
    if (budget?.maxCalls != null) maxCalls = budget.maxCalls;
    const parts = entry.message.split(" · ");
    const stage = parts[0]?.trim() ?? "unknown";
    const provider = parts[1]?.trim() ?? "—";
    const model = parts[2]?.trim() ?? "—";
    const index = usage.length + 1;
    const label = stageLabelForAiCall(stage);
    const callMax = budget?.maxCalls ?? maxCalls ?? 0;
    usage.push({
      index,
      maxCalls: callMax,
      stage,
      label,
      ok: entry.status === "success",
      provider,
      model,
      summary: `${index}/${callMax || "?"} ${label}`,
    });
  }

  return { maxCalls, usage };
}

function deriveMetrics(input: {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly artifact?: AgentRunArtifact | null;
  readonly card?: AgentRunCardViewModel | null;
  readonly durationMs?: number | null;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly fileDiffs: readonly RunFileDiff[];
}): RunInspectorMetrics {
  const metrics: GreenfieldGenerationMetrics | null =
    input.greenfieldRun.generationMetrics ?? input.artifact?.generationMetrics ?? null;

  const durationMs =
    input.durationMs ??
    input.greenfieldRun.durationMs ??
    input.artifact?.durationMs ??
    input.card?.durationMs ??
    null;

  const tokensEstimated = metrics
    ? metrics.estimatedPromptTokens + metrics.estimatedResponseTokens
    : null;

  let filesCreated = 0;
  let filesModified = 0;
  for (const diff of input.fileDiffs) {
    const hasChanges =
      diff.linesAdded + diff.linesRemoved > 0 ||
      (diff.before?.length ?? 0) > 0 ||
      (diff.after?.length ?? 0) > 0;
    if (!hasChanges) continue;
    if (!diff.before || diff.before.length === 0) filesCreated += 1;
    else filesModified += 1;
  }

  const baseMetrics = {
    durationMs,
    durationLabel: formatDuration(durationMs),
    tokensEstimated,
    promptTokens: metrics?.estimatedPromptTokens ?? null,
    responseTokens: metrics?.estimatedResponseTokens ?? null,
    filesCreated,
    filesModified,
    commandsRun: deriveCommands(input.greenfieldRun.entries),
    provider:
      input.provider ??
      input.greenfieldRun.provider ??
      input.artifact?.provider ??
      input.card?.provider ??
      null,
    model:
      input.model ??
      input.greenfieldRun.model ??
      input.artifact?.model ??
      input.card?.model ??
      null,
    aiCalls: countAiCalls(input.greenfieldRun.entries),
    ...(() => {
      const aiUsage = deriveAiCallUsageFromLog(input.greenfieldRun.entries);
      return {
        aiCallMax: aiUsage.maxCalls,
        aiCallUsage: aiUsage.usage,
      };
    })(),
  };

  const cost = estimateRunCostFromInspectorMetrics(baseMetrics);
  const memoryMeta = readProjectMemoryInjectionMeta(input.greenfieldRun);
  const setupResult = input.greenfieldRun.setupResult;

  return {
    ...baseMetrics,
    estimatedInputTokens: cost?.estimatedInputTokens ?? null,
    estimatedOutputTokens: cost?.estimatedOutputTokens ?? null,
    estimatedCostUsd: cost?.estimatedCostUsd ?? null,
    costIsEstimated: cost?.isEstimated ?? false,
    memoryInjected: memoryMeta?.injected ?? false,
    memoryContextSize: memoryMeta?.contextSize ?? null,
    memoryRecommendationUsed: memoryMeta?.recommendationUsed ?? false,
    dependencyRepairs: setupResult?.dependencyRepairs ?? [],
    npmInstallRetried: setupResult?.installRetried ?? false,
  };
}

export function buildRunInspectorViewModel(input: BuildRunInspectorInput): RunInspectorViewModel {
  const artifact = input.artifact ?? null;
  const card = input.card ?? artifact?.card ?? null;
  const entries = input.greenfieldRun.entries.length
    ? input.greenfieldRun.entries
    : artifact?.logEntries ?? [];
  const fileDiffs = extractRunFileDiffs({
    card:
      card ??
      ({
        filesModified: artifact?.filesModified ?? [],
        patchImpact: { files: [], totalAdded: 0, totalRemoved: 0 },
      } as unknown as AgentRunCardViewModel),
    planApplySession: input.planApplySession ?? null,
    generatedFiles: input.greenfieldRun.generatedFiles,
    appliedFileDiffs: input.greenfieldRun.appliedFileDiffs,
    allowGeneratedFiles: resolveAllowGeneratedFileDiffs(input.greenfieldRun),
    ...(artifact?.fileDiffs ? { artifactFileDiffs: artifact.fileDiffs } : {}),
  });
  const route =
    input.route ??
    input.greenfieldRun.runTimeline?.route ??
    artifact?.timeline?.route ??
    null;
  const outcome = input.outcome ?? artifact?.outcome ?? null;

  const timeline = deriveTimeline(
    entries,
    input.greenfieldRun.runTimeline ?? artifact?.timeline ?? null,
    input.greenfieldRun.actionType,
  );
  const events = deriveEvents(entries);
  const aiResponse = deriveAiResponse({
    greenfieldRun: input.greenfieldRun,
    artifact,
    card,
    aiPlan: input.aiPlan ?? null,
    planApplySession: input.planApplySession ?? null,
  });
  const metrics = deriveMetrics({
    greenfieldRun: input.greenfieldRun,
    artifact,
    card,
    durationMs: input.durationMs ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    fileDiffs,
  });

  const hasData =
    entries.length > 0 ||
    fileDiffs.length > 0 ||
    Boolean(aiResponse.rawPreview) ||
    Boolean(outcome) ||
    Boolean(input.aiPlan);

  const preflight = derivePreflight(input);
  const apply = deriveApply(input);
  const health = artifact && entries.length > 0
    ? computeRunHealth({
        artifact,
        entries,
        timeline: input.greenfieldRun.runTimeline ?? artifact.timeline ?? null,
      })
    : null;

  const trace =
    artifact?.agentTrace ??
    buildAgentTrace({
      prompt: input.prompt,
      route,
      generationMode: input.greenfieldRun.actionType,
      greenfieldRun: input.greenfieldRun,
      fileDiffs,
      scan: input.scan ?? null,
      outcome,
    });

  return {
    runId: input.runId,
    runNumber: input.runNumber ?? artifact?.runNumber ?? null,
    prompt: input.prompt,
    outcome,
    outcomeLabel: outcome ? outcomeLabel(outcome) : "Unknown",
    route,
    startedAt:
      input.startedAt ??
      input.greenfieldRun.runStartedAt ??
      artifact?.startedAt ??
      null,
    endedAt:
      input.endedAt ?? input.greenfieldRun.endedAt ?? artifact?.endedAt ?? null,
    timeline,
    events,
    aiResponse,
    fileDiffs,
    metrics,
    preflight,
    apply,
    health,
    trace,
    hasData,
  };
}

export interface RunInspectorExportBundle {
  readonly viewModel: RunInspectorViewModel;
  readonly text: string;
  readonly json: string;
}

function section(title: string, lines: string[]): string {
  return [`## ${title}`, ...lines, ""].join("\n");
}

export function formatRunInspectorText(model: RunInspectorViewModel): string {
  const lines: string[] = [
    "BryantLabs Studio — Run Inspector",
    `Run ID: ${model.runId}`,
    model.runNumber != null ? `Run #: ${model.runNumber}` : "",
    `Outcome: ${model.outcomeLabel}`,
    model.route ? `Route: ${model.route}` : "",
    `Prompt: ${model.prompt}`,
    "",
  ].filter(Boolean);

  if (model.timeline.length > 0) {
    lines.push(
      section(
        "Timeline",
        model.timeline.map(
          (item) =>
            `${item.time} ${item.label} [${item.status}]${item.detail ? ` — ${item.detail}` : ""}`,
        ),
      ),
    );
  }

  if (model.events.length > 0) {
    lines.push(
      section(
        "Event stream",
        model.events.map(
          (event) =>
            `${event.time} ${event.event} [${event.status}] ${event.message}${event.detail ? `\n  ${event.detail}` : ""}`,
        ),
      ),
    );
  }

  lines.push(
    section("Metrics", [
      `Duration: ${model.metrics.durationLabel}`,
      `Tokens (est.): ${model.metrics.tokensEstimated ?? "—"}`,
      `Files created: ${model.metrics.filesCreated}`,
      `Files modified: ${model.metrics.filesModified}`,
      `Commands: ${model.metrics.commandsRun.join(", ") || "—"}`,
      `Provider: ${model.metrics.provider ?? "—"}`,
      `Model: ${model.metrics.model ?? "—"}`,
      `AI calls: ${model.metrics.aiCalls}`,
      model.metrics.aiCallMax != null
        ? `AI call budget: ${model.metrics.aiCalls}/${model.metrics.aiCallMax}`
        : "AI call budget: —",
      ...(model.metrics.aiCallUsage.length > 0
        ? [
            "AI call sequence:",
            ...model.metrics.aiCallUsage.map(
              (entry) =>
                `  ${entry.summary} · ${entry.provider} · ${entry.ok ? "ok" : "failed"}`,
            ),
          ]
        : ["AI call sequence: —"]),
    ]),
  );

  if (model.preflight) {
    lines.push(
      section("Planner preflight", [
        `Gate: ${model.preflight.gate ?? "—"}`,
        `Provider call attempted: ${model.preflight.providerCallAttempted}`,
        `Provider blocked reason: ${model.preflight.providerBlockedReason ?? "—"}`,
        `Route: ${model.preflight.route ?? model.route ?? "—"}`,
        `Prompt classification: ${model.preflight.promptClassification}`,
      ]),
    );
  }

  if (model.apply) {
    lines.push(
      section("Apply plan", [
        `Planned files: ${model.apply.plannedFiles.join(", ") || "—"}`,
        `Allowed files: ${model.apply.allowedFiles.join(", ") || "—"}`,
        `Rejected files: ${model.apply.rejectedFiles.join(", ") || "—"}`,
        `Patch generation provider calls: ${model.apply.patchGenerationProviderCalls}`,
        `Budget: ${model.apply.budgetUsed ?? "—"}/${model.apply.budgetMax ?? "—"} (${model.apply.budgetRemaining ?? "—"} remaining)`,
        `Budget exceeded: ${model.apply.budgetExceeded}`,
        `Budget exceeded reason: ${model.apply.budgetExceededReason ?? "—"}`,
        `Patch proposal count: ${model.apply.patchProposalCount}`,
        `Deterministic fallback used: ${model.apply.deterministicFallbackUsed}`,
        `Apply fallback note: ${model.apply.applyFallbackNote ?? "—"}`,
      ]),
    );
  }

  lines.push(
    section("AI response", [
      `Raw response length: ${model.aiResponse.rawResponseLength ?? "—"}`,
      `Parser patterns attempted: ${model.aiResponse.parserPatternsAttempted.join(", ") || "—"}`,
      `Repair attempted: ${model.aiResponse.repairAttempted}`,
      `Repair succeeded: ${model.aiResponse.repairSucceeded}`,
      `Fallback skeleton created: ${model.aiResponse.fallbackSkeletonCreated}`,
      `Backup provider attempted: ${model.aiResponse.backupProviderAttempted}`,
      `Backup provider used: ${model.aiResponse.backupProviderUsed ?? "—"}`,
      `Backup failure reason: ${model.aiResponse.backupProviderFailureReason ?? "—"}`,
      `Planned files (${model.aiResponse.plannedFiles.length}): ${model.aiResponse.plannedFiles.join(", ") || "—"}`,
      `Proposed edits (${model.aiResponse.proposedFiles.length}): ${model.aiResponse.proposedFiles.join(", ") || "—"}`,
      `Parsed files (${model.aiResponse.parsedFiles.length}): ${model.aiResponse.parsedFiles.join(", ") || "—"}`,
      `Missing files (${model.aiResponse.missingFiles.length}): ${model.aiResponse.missingFiles.join(", ") || "—"}`,
      `Warnings: ${model.aiResponse.warnings.join("; ") || "—"}`,
      Object.keys(model.aiResponse.parserFailureReasons).length > 0
        ? `Parser failure reasons:\n${Object.entries(model.aiResponse.parserFailureReasons)
            .map(([pattern, reason]) => `  - ${pattern}: ${reason}`)
            .join("\n")}`
        : "Parser failure reasons: —",
      model.aiResponse.rawPreview ? `\nRaw preview:\n${model.aiResponse.rawPreview}` : "Raw preview: —",
    ]),
  );

  if (model.fileDiffs.length > 0) {
    lines.push(
      section(
        "File diffs",
        model.fileDiffs.flatMap((diff) => [
          `${diff.path} (+${diff.linesAdded}/−${diff.linesRemoved})`,
          ...(diff.before
            ? ["--- before", diff.before.slice(0, 2000)]
            : ["--- before (empty)"]),
          ...(diff.after
            ? ["+++ after", diff.after.slice(0, 2000)]
            : ["+++ after (empty)"]),
          "",
        ]),
      ),
    );
  }

  return lines.join("\n");
}

export function buildRunInspectorExport(model: RunInspectorViewModel): RunInspectorExportBundle {
  const payload = {
    exportedAt: new Date().toISOString(),
    inspector: model,
    logStageLabels: RUN_LOG_STAGE_LABELS,
  };
  return {
    viewModel: model,
    text: formatRunInspectorText(model),
    json: JSON.stringify(payload, null, 2),
  };
}

export function exportRunInspectorJson(bundle: RunInspectorExportBundle): void {
  const blob = new Blob([bundle.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `run-inspector-${bundle.viewModel.runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportRunInspectorTxt(bundle: RunInspectorExportBundle): void {
  const blob = new Blob([bundle.text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `run-inspector-${bundle.viewModel.runId}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyRunInspectorText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type { GeneratedFile };
