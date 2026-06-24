import {
  allCoreVerificationPassed,
  resolveDiagnosticStage,
  resolveRunVerification,
  shouldIgnoreStaleFailureReport,
  type ResolvedRunVerification,
} from "@/core/diagnostics/verificationResolution";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import { hashPrompt } from "@/core/agent/runContextReset";
import {
  classifyRunFailureReason,
  deriveRunFailureDetails,
  RUN_FAILURE_REASON_LABELS,
  type RunFailureReason,
} from "@/core/agent/runFailureDiagnostics";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { collectGreenfieldMissingFiles } from "@/core/greenfield/missingFiles";

export type DiagnosticReportStatus = "success" | "failed" | "warning";

export interface DiagnosticReportVerification {
  readonly typescript: string;
  readonly build: string;
  readonly preview: string;
  readonly uiAudit: string;
}

export interface DiagnosticReportSnapshot {
  readonly runId: string;
  readonly previousRunId: string | null;
  readonly timestamp: string;
  readonly prompt: string;
  readonly promptPreview: string;
  readonly promptHash: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly route: string | null;
  readonly generationMode: string | null;
  readonly projectPath: string | null;
  readonly status: DiagnosticReportStatus;
  readonly stage: string | null;
  readonly durationMs: number | null;
  readonly durationLabel: string | null;
  readonly filesParsed: number | null;
  readonly filesCreated: number;
  readonly filesModified: number;
  readonly filesMissing: readonly string[];
  readonly verification: DiagnosticReportVerification;
  readonly errorCategory: RunFailureReason | null;
  readonly errorCategoryLabel: string | null;
  readonly errorMessage: string | null;
  readonly aiResponsePreview: string | null;
  readonly lastCommand: string | null;
  readonly commandStdout: string | null;
  readonly commandStderr: string | null;
  readonly recommendedNextSteps: readonly string[];
  readonly outcome: RunTerminalOutcome | null;
}

export interface DiagnosticReportBundle {
  readonly snapshot: DiagnosticReportSnapshot;
  readonly text: string;
  readonly json: string;
}

const PROMPT_PREVIEW_CHARS = 500;
const AI_PREVIEW_CHARS = 500;
const REPORT_LINE = "====================================";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function verificationLabelFromResolved(
  key: keyof ResolvedRunVerification,
  resolved: ResolvedRunVerification,
): string {
  const value = resolved[key];
  if (key === "preview" && value === "passed") return "passed";
  return value;
}

function countParsedFiles(run: GreenfieldRunSnapshot): number | null {
  if (run.generatedFiles?.length) return run.generatedFiles.length;
  const complete = run.debug?.markerAudit?.completeMarkerPairs.length;
  if (complete != null) return complete;
  if (run.generationMetrics?.responseCharCount === 0) return 0;
  return null;
}

function collectMissingFiles(run: GreenfieldRunSnapshot): string[] {
  return collectGreenfieldMissingFiles(run);
}

function rootCommand(
  report: StudioFailureReport | null,
  run: GreenfieldRunSnapshot,
): {
  command: string | null;
  stdout: string | null;
  stderr: string | null;
} {
  const root = report?.stages.find((s) => s.role === "root");
  const cmd = root?.command ?? run.setupResult?.build ?? run.setupResult?.install ?? null;
  if (!cmd) {
    return { command: null, stdout: null, stderr: null };
  }
  return {
    command: cmd.command,
    stdout: cmd.stdout?.trim() || null,
    stderr: cmd.stderr?.trim() || null,
  };
}

export function deriveDiagnosticReportStatus(input: {
  readonly outcome: RunTerminalOutcome | null;
  readonly card: AgentRunCardViewModel;
  readonly greenfieldRun: GreenfieldRunSnapshot;
}): DiagnosticReportStatus {
  const { outcome, card, greenfieldRun } = input;
  const resolved = resolveRunVerification({
    run: greenfieldRun,
    cardVerification: card.verification,
  });

  if (outcome === "failed" || card.overallStatus === "failed") {
    return "failed";
  }

  if (
    outcome === "success" ||
    greenfieldRun.runResult === "success" ||
    card.overallStatus === "complete"
  ) {
    if (allCoreVerificationPassed(resolved)) {
      return "success";
    }
  }

  const verificationGap =
    resolved.typescript === "failed" ||
    resolved.build === "failed" ||
    resolved.preview === "failed" ||
    resolved.uiAudit === "failed";

  if (
    outcome === "cancelled" ||
    outcome === "aborted" ||
    outcome === "interrupted" ||
    verificationGap
  ) {
    return verificationGap ? "warning" : "failed";
  }

  return "success";
}

export function diagnosticStatusLabel(status: DiagnosticReportStatus): string {
  switch (status) {
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "failed":
      return "Failure";
    default:
      return "Unknown";
  }
}

export interface BuildDiagnosticReportInput {
  readonly runId: string;
  readonly previousRunId?: string | null;
  readonly prompt: string;
  readonly outcome?: RunTerminalOutcome | null;
  readonly route?: string | null;
  readonly generationMode?: string | null;
  readonly projectPath?: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly card: AgentRunCardViewModel;
  readonly timestamp?: number;
}

export interface ResolveDiagnosticReportBundleInput {
  readonly runId: string | null;
  readonly previousRunId?: string | null;
  readonly prompt: string;
  readonly card: AgentRunCardViewModel;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly artifact?: AgentRunArtifact | null;
  readonly outcome?: RunTerminalOutcome | null;
  readonly projectPath?: string | null;
  readonly route?: string | null;
  readonly generationMode?: string | null;
  readonly timestamp?: number;
}

export function resolveDiagnosticReportBundle(
  input: ResolveDiagnosticReportBundleInput,
): DiagnosticReportBundle | null {
  if (input.artifact?.diagnosticReport) {
    const text = input.artifact.diagnosticText ?? "";
    if (text.length > 0) {
      return {
        snapshot: input.artifact.diagnosticReport,
        text,
        json: JSON.stringify(input.artifact.diagnosticReport, null, 2),
      };
    }
  }
  if (!input.runId) return null;
  return buildDiagnosticReport({
    runId: input.runId,
    previousRunId: input.previousRunId ?? null,
    prompt: input.prompt,
    outcome: input.outcome ?? input.artifact?.outcome ?? null,
    route: input.route ?? null,
    generationMode: input.generationMode ?? null,
    projectPath: input.projectPath ?? null,
    greenfieldRun: input.greenfieldRun,
    card: input.card,
    ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
  });
}

export function buildDiagnosticReport(input: BuildDiagnosticReportInput): DiagnosticReportBundle {
  const {
    runId,
    previousRunId = null,
    prompt,
    greenfieldRun,
    card,
    timestamp = Date.now(),
  } = input;

  const resolved = resolveRunVerification({
    run: greenfieldRun,
    cardVerification: card.verification,
  });

  const failureReport = shouldIgnoreStaleFailureReport(greenfieldRun, resolved)
    ? null
    : greenfieldRun.failureReport;
  const failureDetails = deriveRunFailureDetails({
    greenfieldRun,
    failureReport,
    durationMs: card.durationMs,
    provider: card.provider,
    model: card.model,
    filesModified: card.filesModified,
    overallFailed: card.overallStatus === "failed",
  });

  const outcome = input.outcome ?? null;
  const status = deriveDiagnosticReportStatus({ outcome, card, greenfieldRun });
  const rawError =
    status === "success"
      ? null
      : failureDetails?.rawErrorMessage ??
        failureReport?.rootCauseLine ??
        greenfieldRun.finalMessage ??
        card.summary ??
        null;

  const errorCategory =
    status === "failed" || status === "warning"
      ? classifyRunFailureReason({
          run: greenfieldRun,
          report: failureReport,
          rawError,
          resolvedVerification: resolved,
        })
      : null;

  const cmd = rootCommand(failureReport, greenfieldRun);
  const filesMissing = collectMissingFiles(greenfieldRun);
  const filesParsed = countParsedFiles(greenfieldRun);
  const route =
    input.route ??
    greenfieldRun.runTimeline?.route ??
    greenfieldRun.actionType ??
    null;

  const snapshot: DiagnosticReportSnapshot = {
    runId,
    previousRunId,
    timestamp: new Date(timestamp).toISOString(),
    prompt: prompt.trim(),
    promptPreview: truncate(prompt.trim(), PROMPT_PREVIEW_CHARS),
    promptHash: hashPrompt(prompt),
    provider: card.provider ?? greenfieldRun.provider,
    model: card.model ?? greenfieldRun.model,
    route,
    generationMode:
      input.generationMode ??
      (greenfieldRun.actionType === "greenfield" ? "greenfield" : greenfieldRun.actionType),
    projectPath: input.projectPath ?? greenfieldRun.projectPath ?? greenfieldRun.targetFolder,
    status,
    stage: resolveDiagnosticStage({ run: greenfieldRun, outcome, resolved }),
    durationMs: card.durationMs,
    durationLabel: formatDuration(card.durationMs),
    filesParsed,
    filesCreated: card.filesWritten.length,
    filesModified: card.filesModified.length,
    filesMissing,
    verification: {
      typescript: verificationLabelFromResolved("typescript", resolved),
      build: verificationLabelFromResolved("build", resolved),
      preview: verificationLabelFromResolved("preview", resolved),
      uiAudit: verificationLabelFromResolved("uiAudit", resolved),
    },
    errorCategory,
    errorCategoryLabel: errorCategory ? RUN_FAILURE_REASON_LABELS[errorCategory] : null,
    errorMessage: rawError,
    aiResponsePreview: truncate(
      failureDetails?.aiResponsePreview ??
        greenfieldRun.debug?.markerAudit?.rawResponsePreview ??
        "",
      AI_PREVIEW_CHARS,
    ) || null,
    lastCommand: failureDetails?.lastCommand ?? cmd.command,
    commandStdout: failureDetails?.commandStdout ?? cmd.stdout,
    commandStderr: failureDetails?.commandStderr ?? cmd.stderr,
    recommendedNextSteps:
      failureDetails?.whatToTryNext ??
      (status === "success"
        ? ["Run completed successfully. Re-open Preview to verify the app."]
        : ["Open Console for full run logs.", "Retry with a smaller prompt or switch provider."]),
    outcome,
  };

  return {
    snapshot,
    text: formatDiagnosticReportText(snapshot),
    json: JSON.stringify(snapshot, null, 2),
  };
}

export function formatDiagnosticReportText(snapshot: DiagnosticReportSnapshot): string {
  const lines: string[] = [
    REPORT_LINE,
    "BRYANTLABS STUDIO DIAGNOSTIC REPORT",
    REPORT_LINE,
    "",
    `Run ID: ${snapshot.runId}`,
    `Previous Run ID: ${snapshot.previousRunId ?? "none"}`,
    `Timestamp: ${snapshot.timestamp}`,
    "",
    "Prompt:",
    snapshot.promptPreview || "(empty)",
    "",
    `Prompt Hash: ${snapshot.promptHash}`,
    "",
    `Provider: ${snapshot.provider ?? "unknown"}`,
    `Model: ${snapshot.model ?? "unknown"}`,
    `Route: ${snapshot.route ?? "unknown"}`,
    `Generation Mode: ${snapshot.generationMode ?? "unknown"}`,
    `Project Path: ${snapshot.projectPath ?? "none"}`,
    "",
    `Status: ${snapshot.status}`,
    `Stage: ${snapshot.stage ?? "unknown"}`,
    `Duration: ${snapshot.durationLabel ?? "unknown"}`,
    "",
    `Files Parsed: ${snapshot.filesParsed ?? "unknown"}`,
    `Files Created: ${snapshot.filesCreated}`,
    `Files Modified: ${snapshot.filesModified}`,
    `Files Missing: ${snapshot.filesMissing.length ? snapshot.filesMissing.join(", ") : "none"}`,
    "",
    "Verification:",
    `TypeScript: ${snapshot.verification.typescript}`,
    `Build: ${snapshot.verification.build}`,
    `Preview: ${snapshot.verification.preview}`,
    `UI Audit: ${snapshot.verification.uiAudit}`,
    "",
    `Error Category: ${snapshot.errorCategoryLabel ?? "none"}`,
    "",
    "Error Message:",
    snapshot.errorMessage ?? "none",
    "",
    "AI Response Preview:",
    snapshot.aiResponsePreview ?? "none",
    "",
    "Last Command:",
    snapshot.lastCommand ?? "none",
  ];

  if (snapshot.commandStdout) {
    lines.push("", "Command stdout:", snapshot.commandStdout);
  }
  if (snapshot.commandStderr) {
    lines.push("", "Command stderr:", snapshot.commandStderr);
  }

  lines.push(
    "",
    "Recommended Next Steps:",
    ...snapshot.recommendedNextSteps.map((step) => `- ${step}`),
    "",
    REPORT_LINE,
  );

  return lines.join("\n");
}

export async function copyDiagnosticReportText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadDiagnosticReport(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportDiagnosticReportTxt(bundle: DiagnosticReportBundle): void {
  downloadDiagnosticReport("diagnostic-report.txt", bundle.text, "text/plain;charset=utf-8");
}

export function exportDiagnosticReportJson(bundle: DiagnosticReportBundle): void {
  downloadDiagnosticReport(
    "diagnostic-report.json",
    bundle.json,
    "application/json;charset=utf-8",
  );
}
