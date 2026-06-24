import type { GreenfieldDebugReport } from "@/core/greenfield/debug";
import { formatDebugReport } from "@/core/greenfield/debug";
import type { GreenfieldGenerationMetrics } from "@/core/greenfield/metrics";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import {
  formatTypeScriptDiagnosticsSummarySection,
  type TypeScriptCheckDetails,
} from "@/core/greenfield/tscDiagnostics";
import { BRYANTLABS_AGENT_DISPLAY_NAME } from "@/core/studioRun/types";
import type { CommandResult } from "@/types";

export type RunLogStatus = "pending" | "running" | "success" | "failed";

export type RunLogStage =
  | "folder"
  | "provider"
  | "prompt"
  | "generation"
  | "provider_response"
  | "parser"
  | "review"
  | "approve"
  | "write"
  | "npm_install"
  | "typescript"
  | "build"
  | "runtime_smoke"
  | "preview"
  | "ui_audit"
  | "ui_repair"
  | "greenfield_repair"
  | "ai_plan"
  | "apply_plan"
  | "multi_file_execution"
  | "autonomous_builder"
  | "studio_agent"
  | "ai_patch_propose"
  | "ai_patch_apply"
  | "safe_edit"
  | "verification"
  | "auto_fix"
  | "ai_call"
  | "provider_health"
  | "provider_call"
  | "provider_fallback"
  | "pipeline"
  | "pipeline_planner"
  | "pipeline_coder"
  | "pipeline_verifier"
  | "pipeline_repair"
  | "pipeline_complete"
  | "error";

export const RUN_LOG_STAGE_LABELS: Record<RunLogStage, string> = {
  folder: "Folder",
  provider: "Provider",
  prompt: "Prompt",
  generation: "Generation",
  provider_response: "Provider response",
  parser: "Parser",
  review: "Review",
  approve: "Approve",
  write: "Write",
  npm_install: "npm install",
  typescript: "TypeScript",
  build: "Build",
  runtime_smoke: "Runtime smoke",
  preview: "Preview",
  ui_audit: "UI audit",
  ui_repair: "UI repair",
  greenfield_repair: "Greenfield repair",
  ai_plan: "AI Plan",
  apply_plan: "Apply Plan",
  multi_file_execution: "Multi-File Execution",
  autonomous_builder: "Autonomous Builder",
  studio_agent: BRYANTLABS_AGENT_DISPLAY_NAME,
  ai_patch_propose: "AI Patch (propose)",
  ai_patch_apply: "AI Patch (apply)",
  safe_edit: "Safe Edit",
  verification: "Verification",
  auto_fix: "Auto Fix",
  ai_call: "AI call",
  provider_health: "Provider health",
  provider_call: "Provider call",
  provider_fallback: "Provider fallback",
  pipeline: "Pipeline",
  pipeline_planner: "Pipeline · Planner",
  pipeline_coder: "Pipeline · Coder",
  pipeline_verifier: "Pipeline · Verifier",
  pipeline_repair: "Pipeline · Repair",
  pipeline_complete: "Pipeline · Complete",
  error: "Error",
};

export type RunLogFailureRole = "root" | "downstream" | "skipped" | "none";

export interface GreenfieldRunLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly stage: RunLogStage;
  readonly status: RunLogStatus;
  readonly message: string;
  readonly details?: string;
  readonly failureRole?: RunLogFailureRole;
}

export interface RunLogEntryOptions {
  readonly details?: string;
  readonly failureRole?: RunLogFailureRole;
}

export type RunFinalStatus =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "aborted"
  | "interrupted";

export interface GreenfieldLatestAction {
  readonly status: RunLogStatus;
  readonly summary: string;
  readonly detail?: string;
  readonly stage?: RunLogStage;
  readonly at: string;
}

export interface GreenfieldRunSummary {
  /** Same as runResult; kept for existing callers. */
  readonly finalStatus: RunFinalStatus;
  readonly runResult: RunFinalStatus;
  readonly latestAction: GreenfieldLatestAction | null;
  readonly lastSuccessfulRunAt: string | null;
  readonly targetFolder: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly filesGenerated: readonly string[];
  readonly filesWritten: readonly string[];
  readonly commandsRun: readonly string[];
  readonly errors: readonly string[];
  readonly typescriptResult: string | null;
  readonly buildResult: string | null;
  readonly previewResult: string | null;
  readonly totalDurationMs: number | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly repairStatus: string | null;
  readonly repairAttempts: readonly string[];
  readonly filesRepaired: readonly string[];
  readonly firstFailureLine: string | null;
}

let entrySeq = 0;

export function createRunLogEntry(
  stage: RunLogStage,
  status: RunLogStatus,
  message: string,
  detailsOrOpts?: string | RunLogEntryOptions,
): GreenfieldRunLogEntry {
  entrySeq += 1;
  const opts =
    typeof detailsOrOpts === "string"
      ? { details: detailsOrOpts }
      : (detailsOrOpts ?? {});
  return {
    id: `gf-log-${entrySeq}`,
    timestamp: new Date().toISOString(),
    stage,
    status,
    message,
    ...(opts.details ? { details: opts.details } : {}),
    ...(opts.failureRole && opts.failureRole !== "none"
      ? { failureRole: opts.failureRole }
      : {}),
  };
}

const FAILURE_ROLE_LABELS: Record<Exclude<RunLogFailureRole, "none">, string> = {
  root: "ROOT FAILURE",
  downstream: "DOWNSTREAM",
  skipped: "SKIPPED",
};

export function formatRunLogFailureRole(role: RunLogFailureRole | undefined): string {
  if (!role || role === "none") return "";
  return FAILURE_ROLE_LABELS[role];
}

/** Map IPC write errors to run-log messages (preserve filesystem detail). */
export function writeFailureLogMessage(error: string): string {
  return error;
}

/** Summary line for Latest Action when a write is blocked or fails. */
export function latestActionSummaryForWriteFailure(error: string): string {
  if (/not empty/i.test(error)) {
    return `Write blocked — ${error}`;
  }
  return `Write failed — ${error}`;
}

export function createLatestAction(
  status: RunLogStatus,
  summary: string,
  opts?: { detail?: string; stage?: RunLogStage },
): GreenfieldLatestAction {
  return {
    status,
    summary,
    at: new Date().toISOString(),
    ...(opts?.detail ? { detail: opts.detail } : {}),
    ...(opts?.stage ? { stage: opts.stage } : {}),
  };
}

/** Index of the last successful preview log entry (completed pipeline). */
export function findLastPreviewSuccessIndex(
  entries: readonly GreenfieldRunLogEntry[],
): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.stage === "preview" && e.status === "success") return i;
  }
  return -1;
}

/** Log entries that belong to the last completed pipeline (ignores later write retries). */
export function pipelineRunEntries(
  entries: readonly GreenfieldRunLogEntry[],
): readonly GreenfieldRunLogEntry[] {
  const end = findLastPreviewSuccessIndex(entries);
  if (end >= 0) return entries.slice(0, end + 1);
  return entries;
}

export function commandResultLine(cmd: CommandResult): string {
  const parts = [
    cmd.command,
    `exit ${cmd.exitCode ?? "—"}`,
    cmd.ok ? "ok" : "failed",
    `${cmd.durationMs}ms`,
  ];
  if (cmd.timedOut) parts.push("timed out");
  if (cmd.truncated) parts.push("output truncated");
  return parts.join(" · ");
}

export function deriveRunResult(
  entries: readonly GreenfieldRunLogEntry[],
  flags: {
    genStatus: string;
    writeStatus: string;
    setupStatus: string;
  },
): RunFinalStatus {
  if (entries.length === 0) return "idle";

  const previewSuccessIdx = findLastPreviewSuccessIndex(entries);
  if (previewSuccessIdx >= 0) return "success";

  const pipeline = pipelineRunEntries(entries);
  if (pipeline.some((e) => e.status === "failed")) return "failed";

  const hasActiveFlags =
    flags.genStatus === "running" ||
    flags.writeStatus === "writing" ||
    flags.setupStatus === "running" ||
    flags.setupStatus === "repairing" ||
    flags.setupStatus === "repair_needed";

  const lastTerminal = [...entries]
    .reverse()
    .find((e) => e.status === "success" || e.status === "failed");
  if (!hasActiveFlags && entries.some((e) => e.status === "running") && lastTerminal) {
    return lastTerminal.status === "success" ? "success" : "failed";
  }

  if (
    hasActiveFlags ||
    entries.some((e) => e.status === "running")
  ) {
    return "running";
  }

  const last = entries[entries.length - 1];
  if (last?.stage === "preview" && last.status === "failed") return "failed";
  if (last?.stage === "build" && last.status === "success") return "success";
  return entries.length > 0 ? "failed" : "idle";
}

/** @deprecated Use deriveRunResult */
export const deriveFinalStatus = deriveRunResult;

const GREENFIELD_PIPELINE_STAGES: ReadonlySet<RunLogStage> = new Set([
  "generation",
  "parser",
  "review",
  "approve",
]);

export function isGreenfieldPipelineLog(
  entries: readonly GreenfieldRunLogEntry[],
): boolean {
  return entries.some(
    (entry) =>
      GREENFIELD_PIPELINE_STAGES.has(entry.stage) ||
      (entry.stage === "provider_call" && entry.details?.includes("greenfield")) ||
      (entry.stage === "ai_call" && entry.details?.includes("stage=greenfield")),
  );
}

function lastRunLogEntryForStage(
  entries: readonly GreenfieldRunLogEntry[],
  stage: RunLogStage,
): GreenfieldRunLogEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.stage === stage && entry.status !== "running") return entry;
  }
  return null;
}

function stageVerificationResult(entry: GreenfieldRunLogEntry | null): string | null {
  if (!entry) return null;
  if (entry.status === "success") return "passed";
  if (entry.status === "failed") {
    return entry.details ? `failed (${entry.details})` : `failed (${entry.message})`;
  }
  return null;
}

export function deriveVerificationFromRunLog(entries: readonly GreenfieldRunLogEntry[]): {
  readonly commandsRun: readonly string[];
  readonly typescriptResult: string | null;
  readonly buildResult: string | null;
  readonly previewResult: string | null;
} {
  const pipeline = pipelineRunEntries(entries);
  const commandsRun: string[] = [];

  for (const stage of ["npm_install", "typescript", "build"] as const) {
    const entry = lastRunLogEntryForStage(pipeline, stage);
    if (entry?.details) {
      commandsRun.push(entry.details);
    }
  }

  const previewEntry = lastRunLogEntryForStage(pipeline, "preview");
  const previewResult = previewEntry
    ? `${previewEntry.status}: ${previewEntry.message}`
    : null;

  return {
    commandsRun,
    typescriptResult: stageVerificationResult(lastRunLogEntryForStage(pipeline, "typescript")),
    buildResult: stageVerificationResult(lastRunLogEntryForStage(pipeline, "build")),
    previewResult,
  };
}

export function deriveRunDurationMsFromLog(
  runStartedAt: number | null,
  entries: readonly GreenfieldRunLogEntry[],
): number | null {
  if (runStartedAt == null || entries.length === 0) return null;
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry?.timestamp) return null;
  const endedMs = Date.parse(lastEntry.timestamp);
  if (!Number.isFinite(endedMs)) return null;
  return Math.max(0, endedMs - runStartedAt);
}

export function deriveRepairFromRunLog(
  entries: readonly GreenfieldRunLogEntry[],
): {
  status: string;
  attempts: string[];
  filesRepaired: string[];
} | null {
  const repairEntries = entries.filter((e) => e.stage === "greenfield_repair");
  if (repairEntries.length === 0) return null;

  const applied = entries.filter(
    (e) =>
      e.stage === "greenfield_repair" &&
      e.status === "success" &&
      /Repair attempt \d+ applied/i.test(e.message),
  );
  const attempts = applied.map((e) => {
    const detail = e.details ? ` (${e.details})` : "";
    return `${e.message}${detail}`;
  });
  const filesRepaired = applied
    .map((e) => e.details)
    .filter((d): d is string => Boolean(d));

  if (attempts.length === 0) return null;

  const failed = repairEntries.some((e) => e.status === "failed");
  return {
    status: failed ? "failed" : "repaired",
    attempts,
    filesRepaired,
  };
}

export function buildRunSummary(opts: {
  entries: readonly GreenfieldRunLogEntry[];
  runStartedAt: number | null;
  targetFolder: string | null;
  provider: string | null;
  model: string | null;
  filesGenerated: readonly string[];
  filesWritten: readonly string[];
  setupResult: GreenfieldSetupResult | null;
  writeError: string | null;
  finalMessage: string | null;
  genStatus: string;
  writeStatus: string;
  setupStatus: string;
  runResult?: RunFinalStatus | null;
  latestAction?: GreenfieldLatestAction | null;
  lastSuccessfulRunAt?: number | null;
  greenfieldRepair?: import("@/core/greenfield/repair").GreenfieldRepairSnapshot | null;
}): GreenfieldRunSummary {
  const commandsRun: string[] = [];
  let typescriptResult: string | null = null;
  let buildResult: string | null = null;

  if (opts.setupResult?.install) {
    commandsRun.push(commandResultLine(opts.setupResult.install));
  }
  if (opts.setupResult?.typecheck) {
    commandsRun.push(commandResultLine(opts.setupResult.typecheck));
    typescriptResult = opts.setupResult.typecheck.ok
      ? "passed"
      : `failed (exit ${opts.setupResult.typecheck.exitCode ?? "—"})`;
  }
  if (opts.setupResult?.build) {
    commandsRun.push(commandResultLine(opts.setupResult.build));
    buildResult = opts.setupResult.build.ok
      ? "passed"
      : `failed (exit ${opts.setupResult.build.exitCode ?? "—"})`;
  }

  const fromLog = deriveVerificationFromRunLog(opts.entries);
  for (const command of fromLog.commandsRun) {
    if (!commandsRun.includes(command)) {
      commandsRun.push(command);
    }
  }
  if (!typescriptResult && fromLog.typescriptResult) {
    typescriptResult = fromLog.typescriptResult;
  }
  if (!buildResult && fromLog.buildResult) {
    buildResult = fromLog.buildResult;
  }

  const runResult =
    opts.runResult ??
    deriveRunResult(opts.entries, {
      genStatus: opts.genStatus,
      writeStatus: opts.writeStatus,
      setupStatus: opts.setupStatus,
    });

  const errors: string[] = [];
  for (const e of pipelineRunEntries(opts.entries)) {
    if (e.status === "failed") errors.push(`[${e.stage}] ${e.message}`);
  }
  if (
    opts.writeError &&
    runResult !== "success" &&
    !errors.includes(opts.writeError)
  ) {
    errors.push(opts.writeError);
  }
  if (
    opts.finalMessage &&
    runResult === "failed" &&
    (opts.setupStatus === "error" || opts.genStatus === "error")
  ) {
    errors.push(opts.finalMessage);
  }

  const previewResult =
    fromLog.previewResult ??
    (() => {
      const previewEntry = [...opts.entries]
        .reverse()
        .find((e) => e.stage === "preview" && e.status !== "running");
      return previewEntry
        ? `${previewEntry.status}: ${previewEntry.message}`
        : null;
    })();

  const startedAt =
    opts.runStartedAt !== null
      ? new Date(opts.runStartedAt).toISOString()
      : opts.entries[0]?.timestamp ?? null;
  const endedAt = opts.entries[opts.entries.length - 1]?.timestamp ?? null;
  const totalDurationMs =
    deriveRunDurationMsFromLog(opts.runStartedAt, opts.entries) ??
    (opts.runStartedAt !== null && endedAt
      ? new Date(endedAt).getTime() - opts.runStartedAt
      : null);

  const lastSuccessfulRunAt =
    opts.lastSuccessfulRunAt != null
      ? new Date(opts.lastSuccessfulRunAt).toISOString()
      : runResult === "success"
        ? endedAt
        : null;

  const repair = opts.greenfieldRepair ?? null;
  const logRepair = repair ? null : deriveRepairFromRunLog(opts.entries);
  const repairAttempts =
    repair?.attempts.map(
      (a) => `attempt ${a.attempt}: ${a.targetPath} — ${a.outcome} (${a.detail})`,
    ) ??
    logRepair?.attempts ??
    [];

  return {
    finalStatus: runResult,
    runResult,
    latestAction: opts.latestAction ?? null,
    lastSuccessfulRunAt,
    targetFolder: opts.targetFolder,
    provider: opts.provider,
    model: opts.model,
    filesGenerated: opts.filesGenerated,
    filesWritten: opts.filesWritten,
    commandsRun,
    errors,
    typescriptResult,
    buildResult,
    previewResult,
    totalDurationMs,
    startedAt,
    endedAt,
    repairStatus:
      repair?.status ??
      (logRepair ? logRepair.status : null),
    repairAttempts,
    filesRepaired: repair?.filesRepaired ?? logRepair?.filesRepaired ?? [],
    firstFailureLine: repair?.primaryErrorLine ?? null,
  };
}

export function formatLiveRunLog(entries: readonly GreenfieldRunLogEntry[]): string {
  if (entries.length === 0) return "(no log entries)";
  return entries
    .map((e) => {
      const role = formatRunLogFailureRole(e.failureRole);
      const lines = [
        `${e.timestamp}  [${e.stage}]  ${e.status}${role ? `  ${role}` : ""}  ${e.message}`,
      ];
      if (e.details) lines.push(`  details: ${e.details}`);
      return lines.join("\n");
    })
    .join("\n");
}

export function formatSummaryRunLog(
  summary: GreenfieldRunSummary,
  extras?: {
    rootFailure?: string | null;
    typecheckDetails?: TypeScriptCheckDetails | null;
  },
): string {
  const lines = [
    "Greenfield run summary",
    "",
  ];

  if (extras?.rootFailure) {
    lines.push("Root failure:", extras.rootFailure, "");
  }

  lines.push(
    `Run result: ${summary.runResult}`,
    summary.latestAction
      ? `Latest action: ${summary.latestAction.status} — ${summary.latestAction.summary}`
      : "Latest action: (none)",
    summary.lastSuccessfulRunAt
      ? `Last successful run: ${summary.lastSuccessfulRunAt}`
      : "",
    "",
    `Final status: ${summary.finalStatus}`,
    `Target folder: ${summary.targetFolder ?? "(none)"}`,
    `Provider: ${summary.provider ?? "(none)"}`,
    `Model: ${summary.model ?? "(none)"}`,
    `Started: ${summary.startedAt ?? "(none)"}`,
    `Ended: ${summary.endedAt ?? "(none)"}`,
    `Total duration: ${
      summary.totalDurationMs !== null ? `${summary.totalDurationMs} ms` : "(n/a)"
    }`,
    "",
    `Files generated (${summary.filesGenerated.length}):`,
    summary.filesGenerated.length
      ? summary.filesGenerated.map((f) => `  - ${f}`).join("\n")
      : "  (none)",
    "",
    `Files written (${summary.filesWritten.length}):`,
    summary.filesWritten.length
      ? summary.filesWritten.map((f) => `  - ${f}`).join("\n")
      : "  (none)",
    "",
    "Commands run:",
    summary.commandsRun.length
      ? summary.commandsRun.map((c) => `  - ${c}`).join("\n")
      : "  (none)",
    "",
    "TypeScript result:",
    summary.typescriptResult ?? "(not run)",
    "",
    "Build result:",
    summary.buildResult ?? "(not run)",
    "",
    "Preview result:",
    summary.previewResult ?? "(not run)",
    "",
    "Errors:",
    summary.errors.length
      ? summary.errors.map((e) => `  - ${e}`).join("\n")
      : "  (none)",
  );

  if (extras?.typecheckDetails) {
    lines.push(
      "",
      formatTypeScriptDiagnosticsSummarySection(extras.typecheckDetails),
    );
  }

  return lines.join("\n");
}

export function formatTelemetryLog(opts: {
  entries: readonly GreenfieldRunLogEntry[];
  generationMetrics?: GreenfieldGenerationMetrics | null;
  debugReport?: GreenfieldDebugReport | null;
}): string {
  const sections = [
    "--- live run log ---",
    formatLiveRunLog(opts.entries),
  ];
  if (opts.generationMetrics) {
    sections.push(
      "",
      "--- generation metrics ---",
      JSON.stringify(opts.generationMetrics, null, 2),
    );
  }
  if (opts.debugReport) {
    sections.push("", "--- debug details ---", formatDebugReport(opts.debugReport));
  }
  return sections.join("\n");
}

export function formatFullGreenfieldDebugReport(opts: {
  entries: readonly GreenfieldRunLogEntry[];
  summary: GreenfieldRunSummary;
  debugReport?: GreenfieldDebugReport | null;
}): string {
  const sections = [
    formatSummaryRunLog(opts.summary),
    "",
    "--- live run log ---",
    formatLiveRunLog(opts.entries),
  ];
  if (opts.debugReport) {
    sections.push("", "--- structured debug report ---", formatDebugReport(opts.debugReport));
  }
  return sections.join("\n");
}
