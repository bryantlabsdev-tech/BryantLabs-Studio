/**
 * Greenfield debug diagnostics — never include API keys or secrets.
 */

export type GreenfieldDebugStage =
  | "greenfield:generate"
  | "greenfield:generate / provider"
  | "greenfield:generate / parse"
  | "greenfield:write"
  | "greenfield:setup"
  | "greenfield:selectFolder"
  | "greenfield:previewStart"
  | "renderer:ipc";

export interface GreenfieldDebugReport {
  stage: GreenfieldDebugStage | string;
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
  /** Human-readable audit of likely abort / failure source. */
  abortCauseAnalysis?: string;
  notes?: string[];
  metrics?: import("@/core/greenfield/metrics").GreenfieldGenerationMetrics;
  markerAudit?: import("@/core/greenfield/promptAudit").GreenfieldMarkerAudit;
  parseTrace?: import("@/core/greenfield/types").GreenfieldParseTrace;
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

/** Classify "This operation was aborted" and similar. */
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
    "Health uses ~20s (Gemini) / ~30s (Ollama); greenfield generate uses 120s.",
    "Unlikely: renderer unmount, IPC cancellation, Electron dialog, folder validation, or write/setup",
    "(those run on different IPC channels / stages).",
  ].join(" ");
}

export function inferErrorName(errorMessage: string, fromError?: Error): string | undefined {
  if (fromError?.name) return fromError.name;
  if (/operation was aborted/i.test(errorMessage)) return "AbortError";
  return undefined;
}

export function formatDebugReport(report: GreenfieldDebugReport): string {
  return JSON.stringify(report, null, 2);
}
