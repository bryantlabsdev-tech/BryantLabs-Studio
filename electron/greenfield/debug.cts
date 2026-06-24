/**
 * Greenfield debug diagnostics (main process) — never log or return API keys.
 */

import type { GreenfieldGenerationMetrics } from "./metrics.cjs";
import type { GreenfieldMarkerAudit } from "./promptAudit.cjs";

export interface GreenfieldDebugReport {
  stage: string;
  provider?: string;
  model?: string;
  targetFolder?: string;
  requestStartedAt: string;
  elapsedMs: number;
  ipcChannel?: string;
  errorName?: string;
  errorMessage: string;
  errorStack?: string;
  rawProviderError?: string;
  rawProviderPayload?: unknown;
  abortCauseAnalysis?: string;
  notes?: string[];
  metrics?: GreenfieldGenerationMetrics;
  /** Prompt/marker diagnosis (parse failures and incomplete sets). */
  markerAudit?: GreenfieldMarkerAudit;
}

const SECRET_PATTERNS = [
  /key=[^&\s]+/gi,
  /geminiApiKey["']?\s*:\s*["'][^"']+["']/gi,
  /api[_-]?key["']?\s*:\s*["'][^"']+["']/gi,
  /Bearer\s+\S+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function sanitizeDebugPayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSecrets(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugPayload(item));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/apikey|api_key|geminiapikey|authorization/i.test(k)) {
      out[k] = "[REDACTED]";
      continue;
    }
    out[k] = sanitizeDebugPayload(v);
  }
  return out;
}

export function inferAbortCauseAnalysis(
  errorMessage: string,
  errorName?: string,
): string | undefined {
  const aborted =
    errorName === "AbortError" ||
    /operation was aborted/i.test(errorMessage) ||
    /aborted/i.test(errorMessage);

  if (!aborted) return undefined;

  return [
    "Likely source: AbortController in electron/providers/types.cts fetchJson()",
    "(setTimeout calls controller.abort() after provider timeout).",
    "Health uses ~20s (Gemini) / ~30s (Ollama test); greenfield generate uses 120s.",
    "Unlikely: renderer unmount, IPC cancellation, Electron dialog, folder validation, or write/setup",
    "(those run on different IPC channels / stages).",
  ].join(" ");
}

function inferErrorName(errorMessage: string, fromError?: Error): string | undefined {
  if (fromError?.name) return fromError.name;
  if (/operation was aborted/i.test(errorMessage)) return "AbortError";
  return undefined;
}

function timeoutNotes(
  latencyMs: number,
  metrics?: GreenfieldGenerationMetrics,
): string[] {
  const notes: string[] = [];
  if (metrics) {
    notes.push(
      `Instrumentation: prompt ${metrics.promptCharCount} chars (~${metrics.estimatedPromptTokens} tok est.), ` +
        `response ${metrics.responseCharCount} chars (~${metrics.estimatedResponseTokens} tok est.), ` +
        `providerWait ${metrics.providerWaitMs}ms, parse ${metrics.parseMs}ms, ` +
        `configured timeout ${metrics.providerConfiguredTimeoutMs ?? "?"}ms, maxOutputTokens ${metrics.maxOutputTokens}.`,
    );
  }
  const limit = metrics?.providerConfiguredTimeoutMs;
  if (limit !== undefined && latencyMs >= limit - 2_000) {
    notes.push(
      `providerWaitMs is near the configured ${limit}ms HTTP timeout — single blocking request for all 7 files.`,
    );
  }
  return notes;
}

export function buildProviderFailureDebug(
  startedAt: number,
  errorMessage: string,
  opts: {
    provider: string;
    model: string;
    latencyMs: number;
    raw?: unknown;
    fromError?: Error;
    metrics?: GreenfieldGenerationMetrics;
  },
): GreenfieldDebugReport {
  const msg = redactSecrets(errorMessage);
  const errorName = inferErrorName(msg, opts.fromError);
  return {
    stage: "greenfield:generate / provider",
    provider: opts.provider,
    model: opts.model,
    requestStartedAt: new Date(startedAt).toISOString(),
    elapsedMs: Date.now() - startedAt,
    ipcChannel: "greenfield:generate",
    errorName,
    errorMessage: msg,
    errorStack: opts.fromError?.stack
      ? redactSecrets(opts.fromError.stack)
      : undefined,
    rawProviderError: msg,
    rawProviderPayload: sanitizeDebugPayload(opts.raw),
    abortCauseAnalysis: inferAbortCauseAnalysis(msg, errorName),
    notes: timeoutNotes(opts.latencyMs, opts.metrics),
  };
}

export function buildParseFailureDebug(
  startedAt: number,
  opts: {
    provider: string;
    model: string;
    latencyMs: number;
    rawText?: string;
    promptSent?: string;
    markerAudit?: GreenfieldMarkerAudit;
    errorMessage?: string;
    extraNotes?: string[];
  },
): GreenfieldDebugReport {
  const msg =
    opts.errorMessage ??
    "Could not parse all seven required files from the AI response.";
  const audit = opts.markerAudit;
  const notes = [...(opts.extraNotes ?? [])];
  if (audit) {
    notes.push(
      `Detected FILE starts: ${audit.detectedFileStarts.join(", ") || "(none)"}`,
    );
    notes.push(
      `Detected END markers: ${audit.detectedFileEnds.join(", ") || "(none)"}`,
    );
    notes.push(`Missing or incomplete: ${audit.missingFiles.join(", ") || "(none)"}`);
  } else if (!opts.errorMessage) {
    notes.push(
      "Provider returned text but @@FILE:…@@ markers were missing or incomplete.",
    );
  }
  return {
    stage: "greenfield:generate / parse",
    provider: opts.provider,
    model: opts.model,
    requestStartedAt: new Date(startedAt).toISOString(),
    elapsedMs: Date.now() - startedAt,
    ipcChannel: "greenfield:generate",
    errorMessage: msg,
    rawProviderPayload: opts.rawText
      ? { rawTextPreview: redactSecrets(opts.rawText.slice(0, 4000)) }
      : undefined,
    notes,
    markerAudit: audit,
  };
}

export function buildThrownGenerateResult(
  provider: string,
  err: unknown,
  startedAt = Date.now(),
): {
  ok: false;
  provider: string;
  model: string;
  latencyMs: number;
  error: string;
  debug: GreenfieldDebugReport;
} {
  const debug = buildThrownDebug(startedAt, provider, err);
  return {
    ok: false,
    provider,
    model: "",
    latencyMs: debug.elapsedMs,
    error: debug.errorMessage,
    debug,
  };
}

export function buildThrownDebug(
  startedAt: number,
  provider: string,
  err: unknown,
): GreenfieldDebugReport {
  const error =
    err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
  const msg = redactSecrets(error.message);
  const errorName = inferErrorName(msg, error);
  return {
    stage: "greenfield:generate",
    provider,
    requestStartedAt: new Date(startedAt).toISOString(),
    elapsedMs: Date.now() - startedAt,
    ipcChannel: "greenfield:generate",
    errorName,
    errorMessage: msg,
    errorStack: error.stack ? redactSecrets(error.stack) : undefined,
    abortCauseAnalysis: inferAbortCauseAnalysis(msg, errorName),
  };
}
