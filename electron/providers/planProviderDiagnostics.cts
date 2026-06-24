import type { AIPlanTelemetry, ParseFailReason } from "./aiPlan.cjs";
import type { ProviderResponse } from "./types.cjs";
import type { ProviderResponseMeta } from "./responseMeta.cjs";
import { GEMINI_EMPTY_RESPONSE_CODE } from "./geminiEmptyResponse.cjs";

export interface AIPlanProviderDiagnostics {
  readonly responseLength: number;
  readonly candidateCount: number;
  readonly finishReason: string | null;
  readonly safetyBlocked: boolean;
  readonly repairAttempted: boolean;
  readonly repairSucceeded: boolean;
  readonly rawResponsePreview: string | null;
  readonly providerMetadata: string | null;
  readonly repairSkippedReason: string | null;
  readonly providerHttpStatus: number | null;
  readonly providerRequestId: string | null;
  readonly providerLatency: number | null;
  readonly providerModel: string | null;
  readonly providerEndpoint: string | null;
  readonly generateMethod: string | null;
  readonly requestPayloadBytes: number | null;
  readonly maxOutputTokens: number | null;
  readonly thoughtsTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly tokenStarvationLikely: boolean | null;
  readonly tokenBudgetHint: string | null;
  readonly usageMetadata: string | null;
  readonly responseHeaders: string | null;
  readonly rawGeminiResponse: string | null;
}

function rawPreview(text: string | undefined): string | null {
  if (!text?.trim()) return null;
  const trimmed = text.trim();
  return trimmed.length <= 1000 ? trimmed : `${trimmed.slice(0, 1000)}…`;
}

export function parseFailReasonFromProviderResponse(
  res: ProviderResponse,
): ParseFailReason {
  if (res.errorCode === GEMINI_EMPTY_RESPONSE_CODE) return "empty_response";
  return "no_json";
}

export function resolveRepairSkippedReason(input: {
  readonly providerOk: boolean;
  readonly providerError?: string;
  readonly providerErrorCode?: string;
  readonly parseFailReason?: ParseFailReason;
  readonly repairAttempted: boolean;
}): string | null {
  if (input.repairAttempted) return null;
  if (input.providerErrorCode === GEMINI_EMPTY_RESPONSE_CODE) {
    return "gemini_empty_response (json repair skipped)";
  }
  if (!input.providerOk) {
    return `provider_request_failed: ${input.providerError ?? "unknown"}`;
  }
  if (input.parseFailReason === "empty_response") {
    return "empty_provider_response (json repair skipped)";
  }
  if (input.parseFailReason === "truncated") {
    return "truncation_retry_path (json repair runs only for no_json/json_syntax)";
  }
  if (input.parseFailReason === "schema_validation") {
    return "schema_repair_path (json repair runs only for no_json/json_syntax)";
  }
  return null;
}

export function buildAIPlanProviderDiagnostics(
  res: ProviderResponse,
  telemetry: AIPlanTelemetry,
  parseFailReason?: AIPlanTelemetry["parse_fail_reason"],
): AIPlanProviderDiagnostics {
  const meta: ProviderResponseMeta | undefined = res.meta;
  const gemini = meta?.gemini;
  const effectiveParseReason =
    parseFailReason && parseFailReason !== "none"
      ? parseFailReason
      : !res.ok
        ? parseFailReasonFromProviderResponse(res)
        : undefined;
  const repairSkippedReason = resolveRepairSkippedReason({
    providerOk: res.ok,
    ...(res.error ? { providerError: res.error } : {}),
    ...(res.errorCode ? { providerErrorCode: res.errorCode } : {}),
    ...(effectiveParseReason ? { parseFailReason: effectiveParseReason } : {}),
    repairAttempted: telemetry.repair_attempted,
  });

  return {
    responseLength: meta?.responseLength ?? res.text?.length ?? 0,
    candidateCount: meta?.candidateCount ?? (res.text?.trim() ? 1 : 0),
    finishReason: meta?.finishReason ?? null,
    safetyBlocked: meta?.safetyBlocked ?? false,
    repairAttempted: telemetry.repair_attempted,
    repairSucceeded: telemetry.repair_success,
    rawResponsePreview: rawPreview(res.text),
    providerMetadata: meta?.providerMetadata ?? null,
    repairSkippedReason,
    providerHttpStatus: gemini?.providerHttpStatus ?? res.httpStatus ?? null,
    providerRequestId: gemini?.providerRequestId ?? null,
    providerLatency: gemini?.providerLatency ?? res.latencyMs ?? null,
    providerModel: gemini?.providerModel ?? res.model ?? null,
    providerEndpoint: gemini?.providerEndpoint ?? null,
    generateMethod: gemini?.generateMethod ?? null,
    requestPayloadBytes: gemini?.requestPayloadBytes ?? null,
    maxOutputTokens: meta?.requestMaxOutputTokens ?? gemini?.maxOutputTokens ?? null,
    thoughtsTokenCount: meta?.thoughtsTokenCount ?? null,
    candidatesTokenCount: meta?.candidatesTokenCount ?? null,
    tokenStarvationLikely: meta?.tokenStarvationLikely ?? null,
    tokenBudgetHint: meta?.tokenBudgetHint ?? null,
    usageMetadata: gemini?.usageMetadata ?? null,
    responseHeaders: gemini?.responseHeaders ?? null,
    rawGeminiResponse: gemini?.rawGeminiResponse ?? null,
  };
}

export function formatAIPlanProviderDiagnosticLines(
  diag: AIPlanProviderDiagnostics,
): string[] {
  const lines: string[] = [];
  if (diag.providerHttpStatus != null) {
    lines.push(`providerHttpStatus: ${diag.providerHttpStatus}`);
  }
  if (diag.providerRequestId) lines.push(`providerRequestId: ${diag.providerRequestId}`);
  if (diag.providerLatency != null) lines.push(`providerLatency: ${diag.providerLatency}`);
  if (diag.providerModel) lines.push(`providerModel: ${diag.providerModel}`);
  if (diag.providerEndpoint) lines.push(`providerEndpoint: ${diag.providerEndpoint}`);
  if (diag.generateMethod) lines.push(`generateMethod: ${diag.generateMethod}`);
  if (diag.requestPayloadBytes != null) {
    lines.push(`requestPayloadBytes: ${diag.requestPayloadBytes}`);
  }
  if (diag.maxOutputTokens != null) {
    lines.push(`maxOutputTokens: ${diag.maxOutputTokens}`);
  }
  if (diag.thoughtsTokenCount != null) {
    lines.push(`thoughtsTokenCount: ${diag.thoughtsTokenCount}`);
  }
  if (diag.candidatesTokenCount != null) {
    lines.push(`candidatesTokenCount: ${diag.candidatesTokenCount}`);
  }
  if (diag.tokenStarvationLikely != null) {
    lines.push(`tokenStarvationLikely: ${diag.tokenStarvationLikely}`);
  }
  if (diag.tokenBudgetHint) lines.push(`tokenBudgetHint: ${diag.tokenBudgetHint}`);
  if (diag.usageMetadata) lines.push(`usageMetadata: ${diag.usageMetadata}`);
  if (diag.responseHeaders) lines.push(`responseHeaders: ${diag.responseHeaders}`);
  if (diag.rawGeminiResponse) lines.push(`rawGeminiResponse: ${diag.rawGeminiResponse}`);
  return lines;
}
