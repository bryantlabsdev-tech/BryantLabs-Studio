import type { PlanApplyFileEntry, PlanApplySession } from "@/core/planApply";
import {
  buildPlanApplyProposalDiagnostics,
  classifyPlanApplyProposalReason,
} from "@/core/planApply/proposalDiagnostics";
import type { GreenfieldRunLogEntry, RunLogStage } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import {
  countAiCallLogEntries,
  parsePlannerDiagnosticsFromDetails,
  parseProviderCallLine,
} from "@/core/studioRun/runLogInspectorModel";

export type PipelineStageId =
  | "planner"
  | "prompt_builder"
  | "provider_request"
  | "provider_response"
  | "parser"
  | "patch_generator"
  | "file_writer"
  | "verification"
  | "preview"
  | "ui_audit";

export type PipelineStageStatus =
  | "pending"
  | "running"
  | "success"
  | "warning"
  | "failed";

export interface PipelineFileOutcome {
  readonly path: string;
  readonly accepted: boolean;
  readonly reason: string;
}

export interface PipelineStageDiagnostics {
  readonly id: PipelineStageId;
  readonly label: string;
  readonly shortLabel: string;
  readonly status: PipelineStageStatus;
  readonly durationMs: number | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly requestBytes: number | null;
  readonly responseBytes: number | null;
  readonly filesAffected: readonly string[];
  readonly retryCount: number;
  readonly error: string | null;
  readonly timestamp: string | null;
  readonly acceptedFiles: readonly string[];
  readonly rejectedFiles: readonly PipelineFileOutcome[];
  readonly rawProviderResponse: string | null;
  readonly parserOutput: string | null;
  readonly rawPrompt: string | null;
  readonly httpStatus: number | null;
}

export interface PipelineRunMetrics {
  readonly totalDurationMs: number | null;
  readonly totalAiCalls: number;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly requestBytes: number | null;
  readonly responseBytes: number | null;
  readonly filesExplored: number;
  readonly filesModified: number;
  readonly filesWritten: number;
}

export interface PipelineInspectorViewModel {
  readonly runStartedAt: number | null;
  readonly runEndedAt: number | null;
  readonly stages: readonly PipelineStageDiagnostics[];
  readonly metrics: PipelineRunMetrics;
  readonly hasRun: boolean;
}

export const PIPELINE_STAGE_ORDER: readonly PipelineStageId[] = [
  "planner",
  "prompt_builder",
  "provider_request",
  "provider_response",
  "parser",
  "patch_generator",
  "file_writer",
  "verification",
  "preview",
  "ui_audit",
] as const;

const STAGE_META: Record<
  PipelineStageId,
  { readonly label: string; readonly shortLabel: string }
> = {
  planner: { label: "Planner", shortLabel: "Planner" },
  prompt_builder: { label: "Prompt Builder", shortLabel: "Prompt" },
  provider_request: { label: "Provider Request", shortLabel: "Request" },
  provider_response: { label: "Provider Response", shortLabel: "Provider" },
  parser: { label: "Parser", shortLabel: "Parser" },
  patch_generator: { label: "Patch Generator", shortLabel: "Patch" },
  file_writer: { label: "File Writer", shortLabel: "Writer" },
  verification: { label: "Verification", shortLabel: "Verify" },
  preview: { label: "Preview", shortLabel: "Preview" },
  ui_audit: { label: "UI Audit", shortLabel: "UI Audit" },
};

const PROVIDER_REQUEST_STAGES: ReadonlySet<RunLogStage> = new Set([
  "provider",
  "provider_call",
  "ai_call",
  "provider_health",
]);

const PROVIDER_RESPONSE_STAGES: ReadonlySet<RunLogStage> = new Set([
  "provider_response",
  "provider_fallback",
]);

const PARSER_STAGES: ReadonlySet<RunLogStage> = new Set(["parser", "generation"]);

const PATCH_STAGES: ReadonlySet<RunLogStage> = new Set([
  "apply_plan",
  "pipeline_coder",
  "ai_patch_propose",
]);

const WRITER_STAGES: ReadonlySet<RunLogStage> = new Set(["write", "ai_patch_apply"]);

const VERIFY_STAGES: ReadonlySet<RunLogStage> = new Set([
  "verification",
  "typescript",
  "build",
  "runtime_smoke",
  "npm_install",
  "pipeline_verifier",
]);

const UI_AUDIT_STAGES: ReadonlySet<RunLogStage> = new Set(["ui_audit", "ui_repair"]);

export const NO_PENDING_CHANGES_MESSAGE = "No pending changes to apply.";

export function classifyPipelineError(message: string, details?: string | null): string {
  const blob = `${message}\n${details ?? ""}`;
  if (/json request truncated|truncat|endof data|unexpected end of json/i.test(blob)) {
    return "JSON request truncated";
  }
  if (/provider timeout|timed out|timeout/i.test(blob)) {
    return "Provider timeout";
  }
  if (/http request failed|request failed|fetch failed|network error/i.test(blob)) {
    return "HTTP request failed";
  }
  if (/invalid provider response|malformed response|unexpected response/i.test(blob)) {
    return "Invalid provider response";
  }
  if (/patch parser failed|patch format error|@@FILE|parser failed/i.test(blob)) {
    return "Patch parser failed";
  }
  if (/zero valid patch|no files matched|no patch produced/i.test(blob)) {
    return "No files matched";
  }
  if (/file write failed|failed to write|write error/i.test(blob)) {
    return "File write failed";
  }
  if (/typescript|tsc check failed|type.?check failed/i.test(blob)) {
    return "TypeScript failed";
  }
  if (/build failed|npm run build failed/i.test(blob)) {
    return "Build failed";
  }
  if (/proposal did not complete/i.test(blob)) {
    const detailLine = details?.split("\n").find((line) => line.trim().length > 0);
    return detailLine?.trim() || "Patch proposal incomplete";
  }
  return message.trim() || "Unknown error";
}

function entryTimeMs(entry: GreenfieldRunLogEntry): number {
  const parsed = Date.parse(entry.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function filterEntriesForCurrentRun(
  entries: readonly GreenfieldRunLogEntry[],
  runStartedAt: number | null,
): GreenfieldRunLogEntry[] {
  if (runStartedAt == null) return [...entries];
  const toleranceMs = 250;
  return entries.filter((entry) => entryTimeMs(entry) >= runStartedAt - toleranceMs);
}

function matchesPlanner(entry: GreenfieldRunLogEntry): boolean {
  if (entry.stage === "ai_plan" || entry.stage === "pipeline_planner") return true;
  return entry.stage === "pipeline" && /\bplan/i.test(entry.message);
}

function matchesPromptBuilder(entry: GreenfieldRunLogEntry): boolean {
  if (entry.stage === "prompt") return true;
  if (entry.stage === "studio_agent") return true;
  return (
    entry.stage === "pipeline" &&
    /explor|context|prompt|understanding/i.test(entry.message)
  );
}

function matchesProviderRequest(entry: GreenfieldRunLogEntry): boolean {
  if (!PROVIDER_REQUEST_STAGES.has(entry.stage)) return false;
  if (entry.stage === "provider_call" || entry.stage === "ai_call") {
    if (/response|success|failure|complete|truncat/i.test(entry.message)) return false;
    return true;
  }
  return true;
}

function matchesProviderResponse(entry: GreenfieldRunLogEntry): boolean {
  if (PROVIDER_RESPONSE_STAGES.has(entry.stage)) return true;
  if (entry.stage === "ai_call" && entry.status !== "running") return true;
  if (entry.stage === "provider_call") {
    return /success|failure|complete|response|truncat|timeout/i.test(entry.message);
  }
  return false;
}

function stageMatcher(id: PipelineStageId): (entry: GreenfieldRunLogEntry) => boolean {
  switch (id) {
    case "planner":
      return matchesPlanner;
    case "prompt_builder":
      return matchesPromptBuilder;
    case "provider_request":
      return matchesProviderRequest;
    case "provider_response":
      return matchesProviderResponse;
    case "parser":
      return (e) => PARSER_STAGES.has(e.stage);
    case "patch_generator":
      return (e) => PATCH_STAGES.has(e.stage);
    case "file_writer":
      return (e) =>
        WRITER_STAGES.has(e.stage) ||
        (e.stage === "apply_plan" && /written|applied|wrote/i.test(e.message));
    case "verification":
      return (e) => VERIFY_STAGES.has(e.stage);
    case "preview":
      return (e) => e.stage === "preview";
    case "ui_audit":
      return (e) => UI_AUDIT_STAGES.has(e.stage);
    default:
      return () => false;
  }
}

function parseTokenPair(details: string): { prompt: number | null; completion: number | null } {
  const planner = parsePlannerDiagnosticsFromDetails(details, null, null);
  const usage = planner?.usageMetadata ?? "";
  const promptMatch = usage.match(/prompt[=:]\s*(\d+)/i) ?? details.match(/promptTokens[=:]\s*(\d+)/i);
  const completionMatch =
    usage.match(/completion[=:]\s*(\d+)/i) ?? details.match(/completionTokens[=:]\s*(\d+)/i);
  const call = parseProviderCallLine(details);
  const tokensApprox = call?.tokens?.match(/(\d+)\/(\d+)/);
  return {
    prompt: promptMatch
      ? Number(promptMatch[1])
      : tokensApprox
        ? Number(tokensApprox[1])
        : null,
    completion: completionMatch
      ? Number(completionMatch[1])
      : tokensApprox
        ? Number(tokensApprox[2])
        : null,
  };
}

function extractFilesFromDetails(details: string | undefined): string[] {
  if (!details?.trim()) return [];
  const paths = new Set<string>();
  for (const line of details.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes(": ")) continue;
    if (/\.[a-z0-9]{1,8}$/i.test(trimmed) || trimmed.includes("/")) {
      paths.add(trimmed);
    }
  }
  return [...paths];
}

function countRetries(entries: readonly GreenfieldRunLogEntry[]): number {
  return entries.filter(
    (e) =>
      /retry|re-?try|attempt\s*[2-9]/i.test(e.message) ||
      /retry|re-?try/i.test(e.details ?? ""),
  ).length;
}

function resolveStageStatus(
  entries: readonly GreenfieldRunLogEntry[],
): PipelineStageStatus {
  if (entries.length === 0) return "pending";
  const latest = entries[entries.length - 1]!;
  if (latest.status === "running") return "running";
  const hasFailure = entries.some((e) => e.status === "failed");
  const hasSuccess = entries.some((e) => e.status === "success");
  if (hasFailure && !hasSuccess) return "failed";
  if (latest.status === "failed") return "failed";
  if (
    hasSuccess &&
    entries.some(
      (e) =>
        e.status === "success" &&
        (/advisory|warning|incomplete|partial/i.test(e.message) ||
          /advisory|warning|incomplete|partial/i.test(e.details ?? "")),
    )
  ) {
    return "warning";
  }
  if (hasSuccess || latest.status === "success") return "success";
  return "pending";
}

function resolveStageError(
  entries: readonly GreenfieldRunLogEntry[],
  status: PipelineStageStatus,
): string | null {
  if (status !== "failed" && status !== "warning") return null;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]!;
    if (entry.status === "failed" || entry.failureRole === "root") {
      return classifyPipelineError(entry.message, entry.details);
    }
  }
  const failed = entries.find((e) => e.status === "failed");
  return failed ? classifyPipelineError(failed.message, failed.details) : null;
}

function computeDurationMs(entries: readonly GreenfieldRunLogEntry[]): number | null {
  if (entries.length === 0) return null;
  const start = entryTimeMs(entries[0]!);
  const end = entryTimeMs(entries[entries.length - 1]!);
  if (!start || !end) return null;
  return Math.max(0, end - start);
}

function aggregateProviderFields(entries: readonly GreenfieldRunLogEntry[]): {
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  requestBytes: number | null;
  responseBytes: number | null;
  httpStatus: number | null;
  rawProviderResponse: string | null;
  parserOutput: string | null;
  rawPrompt: string | null;
} {
  let provider: string | null = null;
  let model: string | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let requestBytes: number | null = null;
  let responseBytes: number | null = null;
  let httpStatus: number | null = null;
  let rawProviderResponse: string | null = null;
  let parserOutput: string | null = null;
  let rawPrompt: string | null = null;

  for (const entry of entries) {
    const details = entry.details ?? "";
    const call = parseProviderCallLine(details);
    if (call?.provider) provider = call.provider;
    if (call?.model) model = call.model;
    const planner = parsePlannerDiagnosticsFromDetails(details, provider, model);
    if (planner?.provider) provider = planner.provider;
    if (planner?.model) model = planner.model;
    const tokens = parseTokenPair(details);
    if (tokens.prompt != null) promptTokens = tokens.prompt;
    if (tokens.completion != null) completionTokens = tokens.completion;
    if (planner?.requestPayloadBytes != null) requestBytes = planner.requestPayloadBytes;
    if (planner?.responseLength != null) responseBytes = planner.responseLength;
    if (planner?.providerHttpStatus != null) httpStatus = planner.providerHttpStatus;
    if (planner?.rawOutput) rawProviderResponse = planner.rawOutput;
    if (planner?.providerMetadata) rawProviderResponse = planner.providerMetadata;
    if (planner?.rawGeminiResponse) rawProviderResponse = planner.rawGeminiResponse;
    if (entry.stage === "parser" || entry.stage === "generation") {
      parserOutput = details || entry.message;
    }
    if (entry.stage === "prompt" && details.trim()) {
      rawPrompt = details;
    }
  }

  return {
    provider,
    model,
    promptTokens,
    completionTokens,
    requestBytes,
    responseBytes,
    httpStatus,
    rawProviderResponse,
    parserOutput,
    rawPrompt,
  };
}

function buildPatchFileOutcomes(
  entries: readonly GreenfieldRunLogEntry[],
  planApplySession: PlanApplySession | null | undefined,
): { accepted: string[]; rejected: PipelineFileOutcome[] } {
  const accepted = new Set<string>();
  const rejected: PipelineFileOutcome[] = [];

  if (planApplySession?.files?.length) {
    for (const file of planApplySession.files) {
      collectFileOutcome(file, accepted, rejected);
    }
    return { accepted: [...accepted], rejected };
  }

  for (const entry of entries) {
    if (entry.status === "success" && entry.message.includes("target accepted")) {
      const path = entry.details?.trim();
      if (path) accepted.add(path);
    }
    if (/rejected|skipped|blocked/i.test(entry.message)) {
      const path = entry.details?.split("\n")[0]?.trim() ?? entry.message;
      rejected.push({
        path,
        accepted: false,
        reason: classifyPipelineError(entry.message, entry.details),
      });
    }
  }

  if (planApplySession?.files?.length) {
    const diagnostics = buildPlanApplyProposalDiagnostics(planApplySession.files, []);
    for (const diag of diagnostics) {
      rejected.push({ path: diag.path, accepted: false, reason: diag.reason });
    }
  }

  return { accepted: [...accepted], rejected };
}

function collectFileOutcome(
  file: PlanApplyFileEntry,
  accepted: Set<string>,
  rejected: PipelineFileOutcome[],
): void {
  if (file.status === "ready") {
    if (file.diffStats?.changed !== false) {
      accepted.add(file.relPath);
      return;
    }
  }
  if (file.status === "error" || file.status === "skipped" || file.status === "proposing") {
    rejected.push({
      path: file.relPath,
      accepted: false,
      reason: classifyPlanApplyProposalReason(file),
    });
  }
}

function buildStageDiagnostics(
  id: PipelineStageId,
  entries: readonly GreenfieldRunLogEntry[],
  snapshot: GreenfieldRunSnapshot,
  planApplySession: PlanApplySession | null | undefined,
): PipelineStageDiagnostics {
  const meta = STAGE_META[id];
  const status = resolveStageStatus(entries);
  const providerFields = aggregateProviderFields(entries);
  const filesFromDetails = entries.flatMap((e) => extractFilesFromDetails(e.details));
  const patchOutcomes =
    id === "patch_generator"
      ? buildPatchFileOutcomes(entries, planApplySession)
      : { accepted: [] as string[], rejected: [] as PipelineFileOutcome[] };

  const filesAffected =
    id === "patch_generator" || id === "file_writer"
      ? [
          ...new Set([
            ...filesFromDetails,
            ...patchOutcomes.accepted,
            ...patchOutcomes.rejected.map((r) => r.path),
            ...(id === "file_writer" ? snapshot.filesWritten : []),
          ]),
        ]
      : [...new Set(filesFromDetails)];

  const latest = entries[entries.length - 1];

  return {
    id,
    label: meta.label,
    shortLabel: meta.shortLabel,
    status,
    durationMs: computeDurationMs(entries),
    provider: providerFields.provider ?? snapshot.provider,
    model: providerFields.model ?? snapshot.model,
    promptTokens: providerFields.promptTokens,
    completionTokens: providerFields.completionTokens,
    requestBytes: providerFields.requestBytes,
    responseBytes: providerFields.responseBytes,
    filesAffected,
    retryCount: countRetries(entries),
    error: resolveStageError(entries, status),
    timestamp: latest?.timestamp ?? null,
    acceptedFiles: patchOutcomes.accepted,
    rejectedFiles: patchOutcomes.rejected,
    rawProviderResponse: providerFields.rawProviderResponse,
    parserOutput: providerFields.parserOutput,
    rawPrompt: providerFields.rawPrompt,
    httpStatus: providerFields.httpStatus,
  };
}

function countExploredFiles(entries: readonly GreenfieldRunLogEntry[]): number {
  let max = 0;
  for (const entry of entries) {
    const match = entry.message.match(/explored\s+(\d+)\s+file/i);
    if (match) max = Math.max(max, Number(match[1]));
    if (entry.details) {
      const paths = extractFilesFromDetails(entry.details);
      if (/explor/i.test(entry.message) && paths.length > 0) {
        max = Math.max(max, paths.length);
      }
    }
  }
  return max;
}

function sumNullable(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

export function buildPipelineInspectorViewModel(input: {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly planApplySession?: PlanApplySession | null;
}): PipelineInspectorViewModel {
  const { greenfieldRun, planApplySession } = input;
  const runEntries = filterEntriesForCurrentRun(
    greenfieldRun.entries,
    greenfieldRun.runStartedAt,
  );

  const stages = PIPELINE_STAGE_ORDER.map((id) => {
    const matcher = stageMatcher(id);
    const stageEntries = runEntries.filter(matcher);
    return buildStageDiagnostics(id, stageEntries, greenfieldRun, planApplySession);
  });

  const totalDurationMs =
    greenfieldRun.durationMs ??
    (greenfieldRun.runStartedAt != null && greenfieldRun.endedAt != null
      ? Math.max(0, greenfieldRun.endedAt - greenfieldRun.runStartedAt)
      : greenfieldRun.runStartedAt != null
        ? Math.max(0, Date.now() - greenfieldRun.runStartedAt)
        : null);

  const metrics: PipelineRunMetrics = {
    totalDurationMs,
    totalAiCalls: countAiCallLogEntries(runEntries),
    promptTokens: sumNullable(stages.map((s) => s.promptTokens)),
    completionTokens: sumNullable(stages.map((s) => s.completionTokens)),
    requestBytes: sumNullable(stages.map((s) => s.requestBytes)),
    responseBytes: sumNullable(stages.map((s) => s.responseBytes)),
    filesExplored: countExploredFiles(runEntries),
    filesModified: new Set([
      ...greenfieldRun.appliedFileDiffs.map((d) => d.path),
      ...greenfieldRun.filesWritten,
    ]).size,
    filesWritten: greenfieldRun.filesWritten.length,
  };

  return {
    runStartedAt: greenfieldRun.runStartedAt,
    runEndedAt: greenfieldRun.endedAt,
    stages,
    metrics,
    hasRun: runEntries.length > 0 || greenfieldRun.runStartedAt != null,
  };
}

export function pipelineStatusGlyph(status: PipelineStageStatus): string {
  switch (status) {
    case "success":
      return "✓";
    case "warning":
      return "!";
    case "failed":
      return "✗";
    case "running":
      return "…";
    default:
      return "○";
  }
}
