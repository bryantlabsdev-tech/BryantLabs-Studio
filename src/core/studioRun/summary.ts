import { formatDebugReport } from "@/core/greenfield/debug";
import {
  buildRunSummary,
  commandResultLine,
  deriveRunDurationMsFromLog,
  formatLiveRunLog,
  formatSummaryRunLog,
  type GreenfieldRunSummary,
} from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { resolveStudioFailureReport } from "@/core/diagnostics/failureReport";
import {
  STUDIO_ACTION_LABELS,
  verificationSummaryLines,
  type StudioActionType,
  type StudioWorkflowDetails,
} from "@/core/studioRun/types";
import type { TypeScriptCheckDetails } from "@/core/greenfield/tscDiagnostics";
import {
  formatRunTimelineForSummary,
  type RunTimelineSnapshot,
} from "@/core/agent/runTimeline";
import { formatUiAuditHistorySection } from "@/core/greenfield/uiAudit";
import type {
  UiAuditHistoryEntry,
  UiAuditResult,
} from "@/core/greenfield/uiAudit";
import { getRunDurationMs, resolveRunTerminalState } from "@/core/agent/runTerminal";
import { partitionSummaryErrors } from "@/core/studioRun/summaryErrors";

export function resolveStudioRunRootFailure(
  snapshot: GreenfieldRunSnapshot,
  summary: Pick<StudioRunSummary, "runResult" | "actionType" | "errors">,
  failureReport: ReturnType<typeof resolveStudioFailureReport>,
): string | null {
  if (summary.runResult !== "failed") return null;
  if (failureReport?.rootCauseLine) return failureReport.rootCauseLine;
  if (summary.actionType !== "greenfield") {
    const wfErr = snapshot.workflow?.errors?.[0];
    if (wfErr) return wfErr;
    if (snapshot.latestAction?.status === "failed") {
      return snapshot.latestAction.detail ?? snapshot.latestAction.summary;
    }
    return null;
  }
  return (
    snapshot.setupResult?.error ??
    snapshot.finalMessage ??
    (summary.errors.length ? summary.errors[0]! : null)
  );
}

export interface StudioRunSummary extends Omit<GreenfieldRunSummary, "totalDurationMs"> {
  readonly actionType: StudioActionType;
  readonly actionLabel: string;
  readonly totalDurationMs: number;
  readonly filesAffected: readonly string[];
  readonly workflowPrompt: string | null;
  readonly planSource: string | null;
  readonly filesProposed: number | null;
  readonly filesAccepted: number | null;
  readonly linesAdded: number | null;
  readonly linesRemoved: number | null;
  readonly previousSuccessfulRunMessage: string | null;
  readonly contextFailure: StudioWorkflowDetails["contextFailure"] | null;
  readonly routingIntent: StudioWorkflowDetails["routingIntent"] | null;
  /** Failed attempts earlier in this session (not current Errors when latest action succeeded). */
  readonly previousAttemptErrors: readonly string[];
}

function isGreenfieldAction(actionType: StudioActionType): boolean {
  return actionType === "greenfield";
}

function isApplyPlanAction(actionType: StudioActionType): boolean {
  return actionType === "apply_plan";
}

function isStudioAgentAction(actionType: StudioActionType): boolean {
  return actionType === "studio_agent";
}

function isEditFollowUpRun(snapshot: GreenfieldRunSnapshot): boolean {
  return snapshot.runTimeline?.route === "edit_follow_up";
}

export function resolveStudioRunDurationMs(snapshot: GreenfieldRunSnapshot): number {
  const fromLog = deriveRunDurationMsFromLog(snapshot.runStartedAt, snapshot.entries);
  const fromTerminal = getRunDurationMs(snapshot);
  if (fromLog != null && fromTerminal < 1_000 && fromLog > fromTerminal * 3) {
    return fromLog;
  }
  if (fromLog != null) {
    return Math.max(fromTerminal, fromLog);
  }
  return fromTerminal;
}

export function buildStudioRunSummary(
  snapshot: GreenfieldRunSnapshot,
): StudioRunSummary {
  const actionType = snapshot.actionType ?? "idle";
  const base = buildRunSummary({
    entries: snapshot.entries,
    runStartedAt: snapshot.runStartedAt,
    targetFolder: snapshot.targetFolder ?? snapshot.projectPath,
    provider: snapshot.provider,
    model: snapshot.model,
    filesGenerated: snapshot.generatedFiles?.map((f) => f.path) ?? [],
    filesWritten: snapshot.filesWritten,
    setupResult: snapshot.setupResult,
    writeError: snapshot.writeError,
    finalMessage: snapshot.finalMessage,
    genStatus: snapshot.genStatus,
    writeStatus: snapshot.writeStatus,
    setupStatus: snapshot.setupStatus,
    runResult:
      isGreenfieldAction(actionType)
        ? snapshot.runResult
        : snapshot.runResult !== "idle"
          ? snapshot.runResult
          : deriveNonGreenfieldResult(snapshot),
    latestAction: snapshot.latestAction,
    lastSuccessfulRunAt: snapshot.lastSuccessfulRunAt,
    greenfieldRepair: snapshot.greenfieldRepair,
  });

  const wf = snapshot.workflow;
  const filesAffected = [
    ...(wf?.filesWritten ?? []),
    ...(wf?.patchTarget ? [wf.patchTarget] : []),
    ...(wf?.editTarget ? [wf.editTarget] : []),
  ];

  let typescriptResult = base.typescriptResult;
  let buildResult = base.buildResult;
  if (wf?.typecheckResult !== undefined) typescriptResult = wf.typecheckResult;
  if (wf?.buildResult !== undefined) buildResult = wf.buildResult;

  if (
    snapshot.verification &&
    !isGreenfieldAction(actionType) &&
    (isApplyPlanAction(actionType) ||
      isStudioAgentAction(actionType) ||
      isEditFollowUpRun(snapshot))
  ) {
    const lines = verificationSummaryLines(snapshot.verification);
    typescriptResult = lines.typecheck;
    buildResult = lines.build;
  }

  let filesProposed = wf?.filesProposed ?? null;
  let filesAccepted = wf?.filesAccepted ?? null;
  if (isGreenfieldAction(actionType)) {
    const generatedCount =
      snapshot.generatedFiles?.length ?? base.filesGenerated.length ?? 0;
    const writtenCount = snapshot.filesWritten.length;
    if (generatedCount > 0) filesProposed = generatedCount;
    if (writtenCount > 0) filesAccepted = writtenCount;
  }

  const mergedErrors = [
    ...base.errors,
    ...(wf?.errors?.filter((e) => !base.errors.includes(e)) ?? []),
  ];
  const runResult = isGreenfieldAction(actionType)
    ? base.runResult
    : snapshot.runResult !== "idle"
      ? snapshot.runResult
      : base.runResult;
  const { errors, previousAttemptErrors } = partitionSummaryErrors({
    latestAction: snapshot.latestAction,
    runResult,
    rawErrors: mergedErrors,
    typescriptPassed:
      typescriptResult === "passed" ||
      snapshot.workflow?.typecheckResult === "passed" ||
      snapshot.verification?.typecheck.ok === true,
    buildPassed:
      buildResult === "passed" ||
      snapshot.workflow?.buildResult === "passed" ||
      snapshot.verification?.build.ok === true,
  });

  const commandsRun = [...base.commandsRun];
  if (
    snapshot.verification &&
    !isGreenfieldAction(actionType) &&
    (isApplyPlanAction(actionType) ||
      isStudioAgentAction(actionType) ||
      isEditFollowUpRun(snapshot))
  ) {
    const v = snapshot.verification;
    if (!commandsRun.some((c) => c.startsWith(v.typecheck.command))) {
      commandsRun.push(commandResultLine(v.typecheck));
    }
    if (!commandsRun.some((c) => c.startsWith(v.build.command))) {
      commandsRun.push(commandResultLine(v.build));
    }
  }

  return {
    ...base,
    commandsRun,
    actionType,
    actionLabel: STUDIO_ACTION_LABELS[actionType],
    filesAffected,
    workflowPrompt: wf?.prompt ?? null,
    planSource: wf?.planSource ?? null,
    filesProposed,
    filesAccepted,
    linesAdded: wf?.linesAdded ?? null,
    linesRemoved: wf?.linesRemoved ?? null,
    previousSuccessfulRunMessage: snapshot.previousSuccessfulRunMessage,
    contextFailure: wf?.contextFailure ?? null,
    routingIntent: wf?.routingIntent ?? null,
    previousAttemptErrors,
    totalDurationMs: resolveStudioRunDurationMs(snapshot),
    typescriptResult,
    buildResult,
    previewResult: wf?.previewResult ?? base.previewResult,
    errors,
    runResult,
  };
}

function deriveNonGreenfieldResult(
  snapshot: GreenfieldRunSnapshot,
): GreenfieldRunSummary["runResult"] {
  const terminal = resolveRunTerminalState(snapshot);
  if (terminal.isTerminal) {
    return terminal.outcome === "success" ? "success" : "failed";
  }
  if (snapshot.runResult !== "idle" && snapshot.runResult !== "running") {
    return snapshot.runResult;
  }
  const last = snapshot.entries[snapshot.entries.length - 1];
  if (!last) return "idle";
  if (last.status === "success") return "success";
  if (last.status === "failed") return "failed";
  return "idle";
}

export function formatStudioSummaryRunLog(
  summary: StudioRunSummary,
  extras?: {
    rootFailure?: string | null;
    typecheckDetails?: TypeScriptCheckDetails | null;
    runTimeline?: RunTimelineSnapshot | null;
    uiAuditResult?: UiAuditResult | null;
    uiAuditHistory?: readonly UiAuditHistoryEntry[];
  },
): string {
  const lines: string[] = [
    "Studio run summary",
    "",
    `Action: ${summary.actionLabel} (${summary.actionType})`,
    `Status: ${summary.runResult}`,
  ];

  if (extras?.rootFailure) {
    lines.push("", "Root cause:", extras.rootFailure);
  }
  if (extras?.runTimeline) {
    lines.push(...formatRunTimelineForSummary(extras.runTimeline));
  }
  if (summary.previousSuccessfulRunMessage) {
    lines.push("", "Previous successful run:", summary.previousSuccessfulRunMessage);
  }

  if (summary.latestAction) {
    lines.push(
      "",
      `Latest action: ${summary.latestAction.status} — ${summary.latestAction.summary}`,
    );
    if (summary.latestAction.detail) {
      lines.push(`  ${summary.latestAction.detail}`);
    }
  }

  if (summary.workflowPrompt) {
    lines.push("", "Prompt:", summary.workflowPrompt);
  }
  if (summary.planSource) {
    lines.push("", `Plan source: ${summary.planSource}`);
  }
  if (summary.filesProposed !== null) {
    lines.push(`Files proposed: ${summary.filesProposed}`);
  }
  if (summary.filesAccepted !== null) {
    lines.push(`Files accepted: ${summary.filesAccepted}`);
  }
  if (summary.linesAdded !== null || summary.linesRemoved !== null) {
    lines.push(
      `Lines: +${summary.linesAdded ?? 0} / -${summary.linesRemoved ?? 0}`,
    );
  }

  const contextFailure = summary.contextFailure;
  if (contextFailure) {
    lines.push(
      "",
      "Context:",
      `  failure_type=${contextFailure.failure_type}`,
      `  estimated_tokens=${contextFailure.estimated_tokens}`,
      `  provider_limit=${contextFailure.provider_limit}`,
      `  compression_attempted=${contextFailure.compression_attempted}`,
    );
  }

  const routingIntent = summary.routingIntent;
  if (routingIntent) {
    lines.push(
      "",
      "Routing:",
      `  intent=${routingIntent.intent}`,
      `  reason=${routingIntent.reason}`,
      routingIntent.files_allowed?.length
        ? `  files_allowed=${routingIntent.files_allowed.join(",")}`
        : "  files_allowed=(none)",
      routingIntent.files_written?.length
        ? `  files_written=${routingIntent.files_written.join(",")}`
        : "  files_written=(pending)",
    );
  }

  lines.push(
    "",
    `Target: ${summary.targetFolder ?? "(none)"}`,
    `Provider: ${summary.provider ?? "(none)"}`,
    `Model: ${summary.model ?? "(none)"}`,
    `Duration: ${summary.totalDurationMs ?? 0} ms`,
    "",
    `Files affected (${summary.filesAffected.length}):`,
    summary.filesAffected.length
      ? summary.filesAffected.map((f) => `  - ${f}`).join("\n")
      : "  (none)",
    "",
    `Files written (${summary.filesWritten.length}):`,
    summary.filesWritten.length
      ? summary.filesWritten.map((f) => `  - ${f}`).join("\n")
      : "  (none)",
    "",
    "Commands executed:",
    summary.commandsRun.length
      ? summary.commandsRun.map((c) => `  - ${c}`).join("\n")
      : "  (none)",
    "",
    "TypeScript:",
    summary.typescriptResult ?? "(not run)",
    "",
    "Build:",
    summary.buildResult ?? "(not run)",
    "",
    "Preview:",
    summary.previewResult ?? "(not run)",
    "",
    "Greenfield repair:",
    summary.repairStatus
      ? summary.repairStatus === "repaired"
        ? `completed (${summary.repairAttempts.length} attempt(s))`
        : summary.repairStatus
      : "(not needed)",
    summary.firstFailureLine ? `  First failure: ${summary.firstFailureLine}` : "",
    summary.repairAttempts.length
      ? summary.repairAttempts.map((a) => `  - ${a}`).join("\n")
      : "  (no attempts)",
    summary.filesRepaired.length
      ? `  Files repaired: ${summary.filesRepaired.join(", ")}`
      : "",
    "",
    "Errors:",
    summary.errors.length
      ? summary.errors.map((e) => `  - ${e}`).join("\n")
      : "  (none)",
  );

  if (summary.previousAttemptErrors.length > 0) {
    lines.push(
      "",
      "Previous attempts:",
      summary.previousAttemptErrors.map((e) => `  - ${e}`).join("\n"),
    );
  }

  if (isGreenfieldAction(summary.actionType)) {
    lines.push(
      "",
      "--- greenfield files generated ---",
      formatSummaryRunLog(summary, extras).split("\n").slice(2).join("\n"),
    );
  }

  if (extras?.uiAuditHistory?.length || extras?.uiAuditResult) {
    lines.push(
      ...formatUiAuditHistorySection(
        extras.uiAuditHistory ?? [],
        extras.uiAuditResult ?? null,
      ),
    );
  }

  return lines.join("\n");
}

export function formatStudioTelemetryLog(opts: {
  entries: GreenfieldRunSnapshot["entries"];
  generationMetrics?: GreenfieldRunSnapshot["generationMetrics"];
  debugReport?: GreenfieldRunSnapshot["debug"];
  summary?: StudioRunSummary;
}): string {
  const sections = ["--- Studio live run log ---", formatLiveRunLog(opts.entries)];
  if (opts.summary) {
    sections.push("", "--- latest action summary ---", formatStudioSummaryRunLog(opts.summary));
  }
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

export function formatStudioDebugReport(opts: {
  entries: GreenfieldRunSnapshot["entries"];
  summary: StudioRunSummary;
  debugReport?: GreenfieldRunSnapshot["debug"];
}): string {
  return [
    formatStudioSummaryRunLog(opts.summary),
    "",
    "--- live run log ---",
    formatLiveRunLog(opts.entries),
    ...(opts.debugReport
      ? ["", "--- structured debug report ---", formatDebugReport(opts.debugReport)]
      : []),
  ].join("\n");
}
