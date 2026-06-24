import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import {
  resolveRunVerification,
  type ResolvedRunVerification,
} from "@/core/diagnostics/verificationResolution";
import { collectGreenfieldMissingFiles } from "@/core/greenfield/missingFiles";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import { RUN_LOG_STAGE_LABELS, type RunLogStage } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { CommandResult } from "@/types";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export type RunFailureReason =
  | "provider_timeout"
  | "provider_empty_response"
  | "provider_malformed_json"
  | "provider_error"
  | "ai_call_budget_exhausted"
  | "parser_zero_files"
  | "parser_missing_files"
  | "npm_install_failed"
  | "typescript_failed"
  | "build_failed"
  | "preview_failed"
  | "ui_audit_failed"
  | "stale_run_detected"
  | "user_canceled"
  | "write_failed"
  | "verification_failed"
  | "unknown_error";

export const RUN_FAILURE_REASON_LABELS: Record<RunFailureReason, string> = {
  provider_timeout: "Provider timeout",
  provider_empty_response: "Provider returned empty response",
  provider_malformed_json: "Provider returned malformed JSON",
  provider_error: "Provider error",
  ai_call_budget_exhausted: "AI call budget exhausted",
  parser_zero_files: "Parser found 0 files",
  parser_missing_files: "Missing required files",
  npm_install_failed: "npm install failed",
  typescript_failed: "TypeScript failed",
  build_failed: "Build failed",
  preview_failed: "Preview failed",
  ui_audit_failed: "UI audit failed",
  stale_run_detected: "Stale run detected",
  user_canceled: "User canceled",
  write_failed: "Write failed",
  verification_failed: "Verification failed",
  unknown_error: "Unknown error",
};

export interface RunFailureDetailsViewModel {
  readonly reason: RunFailureReason;
  readonly reasonLabel: string;
  readonly headline: string;
  readonly summaryLine: string;
  readonly failedStage: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly durationMs: number | null;
  readonly durationLabel: string | null;
  readonly rawErrorMessage: string | null;
  readonly filesParsed: number | null;
  readonly filesExpected: number | null;
  readonly missingFiles: readonly string[];
  readonly aiResponsePreview: string | null;
  readonly lastCommand: string | null;
  readonly commandStdout: string | null;
  readonly commandStderr: string | null;
  readonly whatToTryNext: readonly string[];
  readonly isVisible: boolean;
}

const AI_PREVIEW_CHARS = 500;
const CMD_OUTPUT_CHARS = 4000;

function truncate(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

function lastFailedLogEntry(run: GreenfieldRunSnapshot) {
  for (let i = run.entries.length - 1; i >= 0; i -= 1) {
    const entry = run.entries[i]!;
    if (entry.status === "failed") return entry;
  }
  return null;
}

function failedStageLabel(run: GreenfieldRunSnapshot, report: StudioFailureReport | null): string | null {
  const failedEntry = lastFailedLogEntry(run);
  if (failedEntry) {
    return RUN_LOG_STAGE_LABELS[failedEntry.stage as RunLogStage] ?? failedEntry.stage;
  }
  if (report?.rootStage) {
    return report.rootStage.replace(/_/g, " ");
  }
  if (run.latestAction?.stage) {
    return RUN_LOG_STAGE_LABELS[run.latestAction.stage as RunLogStage] ?? run.latestAction.stage;
  }
  return null;
}

function rootCommand(report: StudioFailureReport | null): CommandResult | null {
  if (!report) return null;
  const root = report.stages.find((s) => s.role === "root");
  return root?.command ?? null;
}

function collectRawError(
  run: GreenfieldRunSnapshot,
  report: StudioFailureReport | null,
): string | null {
  const parts: string[] = [];
  if (run.runTimeline?.failureDetail?.trim()) {
    parts.push(run.runTimeline.failureDetail.trim());
  }
  if (run.debug?.errorMessage?.trim()) parts.push(run.debug.errorMessage.trim());
  if (run.finalMessage?.trim()) parts.push(run.finalMessage.trim());
  if (report?.rootCauseLine?.trim()) parts.push(report.rootCauseLine.trim());
  const failedEntry = lastFailedLogEntry(run);
  if (failedEntry?.details?.trim()) parts.push(failedEntry.details.trim());
  if (failedEntry?.message?.trim()) parts.push(failedEntry.message.trim());
  if (run.writeError?.trim()) parts.push(run.writeError.trim());
  if (run.setupResult?.error?.trim()) parts.push(run.setupResult.error.trim());
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(" · ") : null;
}

function countParsedFiles(run: GreenfieldRunSnapshot): number {
  if (run.generatedFiles?.length) return run.generatedFiles.length;
  const markerAudit = run.debug?.markerAudit;
  if (markerAudit?.completeMarkerPairs.length) return markerAudit.completeMarkerPairs.length;
  if (run.generationMetrics?.responseCharCount === 0) return 0;
  return run.filesWritten.length;
}

function collectMissingFiles(run: GreenfieldRunSnapshot): string[] {
  return collectGreenfieldMissingFiles(run);
}

function aiResponsePreview(run: GreenfieldRunSnapshot): string | null {
  const fromAudit = run.debug?.markerAudit?.rawResponsePreview;
  if (fromAudit?.trim()) return truncate(fromAudit, AI_PREVIEW_CHARS);
  const rawPayload = run.debug?.rawProviderPayload;
  if (typeof rawPayload === "string" && rawPayload.trim()) {
    return truncate(rawPayload, AI_PREVIEW_CHARS);
  }
  return null;
}

function isBudgetExhausted(text: string): boolean {
  return /max ai calls reached|ai call budget exhausted|budget exhausted|reserve \d+ call\(s\) for (setup )?repair/i.test(
    text,
  );
}

function isTimeoutMessage(text: string): boolean {
  return /timeout|timed out|AbortError|operation was aborted/i.test(text);
}

function isEmptyResponse(run: GreenfieldRunSnapshot, text: string): boolean {
  if (/empty response|no content|0 chars|response.*empty/i.test(text)) return true;
  const metrics = run.generationMetrics;
  if (metrics && metrics.responseCharCount === 0) return true;
  return false;
}

function isMalformedJson(text: string): boolean {
  return /malformed json|invalid json|json parse|unexpected token|failed to parse json/i.test(
    text,
  );
}

function isStaleRun(text: string): boolean {
  return /stale run|stale greenfield|reset and start|stale context/i.test(text);
}

function isUserCanceled(run: GreenfieldRunSnapshot, text: string): boolean {
  if (run.runResult === "cancelled") return true;
  return /cancelled by user|run cancelled|user canceled|user cancelled/i.test(text);
}

export function classifyRunFailureReason(input: {
  readonly run: GreenfieldRunSnapshot;
  readonly report: StudioFailureReport | null;
  readonly rawError: string | null;
  readonly resolvedVerification?: ResolvedRunVerification | null;
}): RunFailureReason {
  const { run, report, rawError } = input;
  const resolved =
    input.resolvedVerification ??
    resolveRunVerification({ run, cardVerification: null });
  const text = rawError ?? "";
  const failedEntry = lastFailedLogEntry(run);

  if (isUserCanceled(run, text)) return "user_canceled";
  if (isStaleRun(text)) return "stale_run_detected";
  if (isBudgetExhausted(text)) return "ai_call_budget_exhausted";

  const stage = failedEntry?.stage ?? report?.rootStage ?? run.latestAction?.stage ?? null;

  if (stage === "parser" || stage === "review") {
    const parsed = countParsedFiles(run);
    if (
      parsed === 0 ||
      /parser found 0|0 files parsed|no files parsed|parser found 0 file blocks/i.test(text)
    ) {
      return "parser_zero_files";
    }
    const missing = collectMissingFiles(run);
    if (missing.length > 0 || /incomplete file|missing required|missing files/i.test(text)) {
      return "parser_missing_files";
    }
  }

  if (stage === "provider_response" ||
    stage === "generation" ||
    stage === "provider" ||
    stage === "provider_call" ||
    (run.debug?.stage?.includes("provider") ?? false) ||
    /high demand|rate limit|429|provider.*failed|no backup provider returned usable output/i.test(text)
  ) {
    if (isTimeoutMessage(text)) return "provider_timeout";
    if (isEmptyResponse(run, text)) return "provider_empty_response";
    if (isMalformedJson(text)) return "provider_malformed_json";
    return "provider_error";
  }

  if (stage === "npm_install" || /npm install failed|install failed/i.test(text)) {
    return "npm_install_failed";
  }

  if (resolved.typescript === "failed") {
    if (
      stage === "typescript" ||
      report?.rootStage === "typescript" ||
      /typescript failed|typecheck failed|TS\d{4}/i.test(text)
    ) {
      return "typescript_failed";
    }
  }

  if (resolved.build === "failed") {
    if (stage === "build" || report?.rootStage === "build" || /build failed/i.test(text)) {
      return "build_failed";
    }
  }

  if (stage === "preview" || report?.rootStage === "preview" || /preview failed/i.test(text)) {
    return "preview_failed";
  }

  if (stage === "ui_audit" || /ui audit failed/i.test(text)) {
    return "ui_audit_failed";
  }

  if (stage === "write" || run.writeError) {
    return "write_failed";
  }

  if (stage === "verification" || report?.rootStage === "verification") {
    return "verification_failed";
  }

  if (isTimeoutMessage(text)) return "provider_timeout";
  if (isEmptyResponse(run, text)) return "provider_empty_response";
  if (isMalformedJson(text)) return "provider_malformed_json";
  if (/parser|0 files|incomplete file set/i.test(text)) {
    return countParsedFiles(run) === 0 ? "parser_zero_files" : "parser_missing_files";
  }

  return "unknown_error";
}

export function suggestRunFailureNextSteps(
  reason: RunFailureReason,
  details: Pick<
    RunFailureDetailsViewModel,
    "missingFiles" | "failedStage" | "provider" | "rawErrorMessage"
  >,
): string[] {
  switch (reason) {
    case "provider_timeout":
      return [
        "Retry with a shorter prompt or switch to a faster model.",
        "Check provider health in Settings → Providers.",
        "If timeouts persist, try Gemini Pro or reduce scope to fewer files.",
      ];
    case "provider_empty_response":
      return [
        "Provider returned no files. Retry with Gemini Pro or use a smaller prompt.",
        "Confirm the API key and model are configured in Settings → Providers.",
      ];
    case "provider_malformed_json":
      return [
        "Ask the model to return files using @@FILE: path@@ … @@END: path@@ markers.",
        "Retry with a different provider or model.",
      ];
    case "ai_call_budget_exhausted":
      return [
        "AI call budget was exhausted before generation could finish. Start a fresh run or raise Max AI calls in Settings → Providers.",
        "If this happened immediately, a duplicate run may have consumed the budget — wait for the active run to finish before retrying.",
      ];
    case "parser_zero_files":
      return [
        "Parser found 0 files. Ask the model to return files using ---FILE: path--- format.",
        "Retry generation with an explicit list of all seven required file paths.",
      ];
    case "parser_missing_files":
      return [
        `Missing files: ${details.missingFiles.join(", ") || "see list above"}. Retry and require all seven paths in the response.`,
        "Use a smaller prompt or switch provider if the model truncates output.",
      ];
    case "npm_install_failed":
      return [
        "Open terminal logs and check npm install output.",
        "Verify package.json is valid and network access is available.",
      ];
    case "typescript_failed":
      return [
        "Open the failing file and fix the TypeScript error shown above.",
        "Run TypeScript check from the terminal for full diagnostics.",
      ];
    case "build_failed":
      return [
        "Build failed. Open terminal logs and fix the first build error.",
        "Confirm dependencies installed and vite/build scripts are valid.",
      ];
    case "preview_failed":
      return [
        "Preview failed to start. Check that build succeeded and port 4173 is free.",
        "Open Preview tab logs for command output.",
      ];
    case "ui_audit_failed":
      return [
        "UI audit is advisory — preview may still work. Review layout in the Preview tab.",
      ];
    case "stale_run_detected":
      return [
        "Reset and start a fresh run to clear stale context from a prior run.",
      ];
    case "user_canceled":
      return ["Run was canceled. Submit again when ready."];
    case "write_failed":
      return [
        "Check folder permissions and whether the target folder is empty or blocked.",
      ];
    case "verification_failed":
      return [
        "Review verification output and fix TypeScript or build errors first.",
      ];
    case "provider_error":
      return [
        "Check provider status and retry. Switch provider if errors persist.",
        details.rawErrorMessage
          ? `Provider message: ${truncate(details.rawErrorMessage, 120)}`
          : "Open Console for provider event details.",
      ].filter(Boolean) as string[];
    default:
      return [
        "Open Console for full run logs.",
        "Retry with a smaller prompt or switch provider.",
      ];
  }
}

export function buildRunFailureHeadline(reason: RunFailureReason): string {
  return RUN_FAILURE_REASON_LABELS[reason];
}

export function buildRunFailureSummaryLine(input: {
  readonly reason: RunFailureReason;
  readonly rawError: string | null;
  readonly failedStage: string | null;
  readonly filesModified: readonly string[];
}): string {
  const label = RUN_FAILURE_REASON_LABELS[input.reason];
  const detail = truncate(input.rawError, 160);
  const stagePart = input.failedStage ? ` during ${input.failedStage}` : "";
  const filesPart =
    input.filesModified.length === 0
      ? " No files were changed."
      : ` ${input.filesModified.length} file(s) changed before failure.`;

  if (input.reason === "unknown_error" && !detail) {
    return `Run failed${stagePart}.${filesPart}`;
  }

  if (detail && detail !== label) {
    return `${label}${stagePart}: ${detail}.${filesPart}`;
  }

  return `${label}${stagePart}.${filesPart}`;
}

export function deriveRunFailureDetails(input: {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly failureReport?: StudioFailureReport | null;
  readonly durationMs?: number | null;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly filesModified?: readonly string[];
  readonly overallFailed?: boolean;
}): RunFailureDetailsViewModel | null {
  const run = input.greenfieldRun;
  const overallFailed =
    input.overallFailed ??
    (run.runResult === "failed" ||
      run.setupStatus === "error" ||
      run.genStatus === "error");

  if (!overallFailed && run.runResult !== "cancelled") return null;

  const report = input.failureReport ?? run.failureReport;
  const rawError = collectRawError(run, report);
  const reason = classifyRunFailureReason({ run, report, rawError });
  const failedStage = failedStageLabel(run, report);
  const cmd = rootCommand(report);
  const missingFiles = collectMissingFiles(run);
  const filesParsed = countParsedFiles(run);
  const provider = input.provider ?? run.provider;
  const model = input.model ?? run.model;
  const durationMs =
    input.durationMs ??
    run.durationMs ??
    (run.runStartedAt != null && run.endedAt != null
      ? Math.max(0, run.endedAt - run.runStartedAt)
      : null);

  const partial: Omit<RunFailureDetailsViewModel, "whatToTryNext" | "summaryLine" | "headline"> = {
    reason,
    reasonLabel: RUN_FAILURE_REASON_LABELS[reason],
    failedStage,
    provider,
    model,
    durationMs,
    durationLabel: durationMs != null ? formatDuration(durationMs) : null,
    rawErrorMessage: rawError,
    filesParsed: filesParsed > 0 ? filesParsed : filesParsed === 0 ? 0 : null,
    filesExpected: GREENFIELD_FILE_PATHS.length,
    missingFiles,
    aiResponsePreview: aiResponsePreview(run),
    lastCommand: cmd?.command ?? run.setupResult?.install?.command ?? null,
    commandStdout: truncate(cmd?.stdout ?? run.setupResult?.build?.stdout, CMD_OUTPUT_CHARS),
    commandStderr: truncate(cmd?.stderr ?? run.setupResult?.build?.stderr, CMD_OUTPUT_CHARS),
    isVisible: true,
  };

  const whatToTryNext = suggestRunFailureNextSteps(reason, {
    missingFiles,
    failedStage,
    provider,
    rawErrorMessage: rawError,
  });

  return {
    ...partial,
    headline: buildRunFailureHeadline(reason),
    summaryLine: buildRunFailureSummaryLine({
      reason,
      rawError,
      failedStage,
      filesModified: input.filesModified ?? run.filesWritten,
    }),
    whatToTryNext,
  };
}

let lastLoggedFailureKey: string | null = null;

export function logRunFailed(details: RunFailureDetailsViewModel): void {
  const key = [
    details.reason,
    details.failedStage,
    details.rawErrorMessage,
    details.filesParsed,
    details.durationMs,
  ].join("|");
  if (lastLoggedFailureKey === key) return;
  lastLoggedFailureKey = key;

  const missing = details.missingFiles.length ? details.missingFiles.join(",") : "none";
  console.log(
    `[run:failed] stage=${details.failedStage ?? "unknown"} reason=${details.reason} provider=${details.provider ?? "unknown"} model=${details.model ?? "unknown"} filesParsed=${details.filesParsed ?? "unknown"} missing=${missing} durationMs=${details.durationMs ?? "unknown"}`,
  );
  if (details.rawErrorMessage) {
    console.log(`[run:failed] error=${details.rawErrorMessage}`);
  }
}

export function resetRunFailureLogDedupe(): void {
  lastLoggedFailureKey = null;
}

export function logRunFailureFromSnapshot(
  run: GreenfieldRunSnapshot,
  extras?: {
    readonly failureReport?: StudioFailureReport | null;
    readonly durationMs?: number | null;
    readonly provider?: string | null;
    readonly model?: string | null;
    readonly filesModified?: readonly string[];
  },
): void {
  const details = deriveRunFailureDetails({
    greenfieldRun: run,
    overallFailed: run.runResult === "failed",
    ...extras,
  });
  if (details) logRunFailed(details);
}
