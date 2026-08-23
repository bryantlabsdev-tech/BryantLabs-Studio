import { createHash } from "node:crypto";

export type TruncationSource =
  | "none"
  /** Anthropic (or upstream) rejected our POST JSON (error text references request body). */
  | "anthropic_rejected_outbound_request"
  /** Local write count disagrees with serialized payload length. */
  | "local_outbound_write_mismatch"
  /** Response bytes received but JSON parse failed mid-stream. */
  | "inbound_response_json_truncated"
  | "transport_aborted"
  | "transport_timeout";

export type TransportSocketEvent =
  | "socket_assigned"
  | "socket_connect"
  | "socket_secure_connect"
  | "socket_close"
  | "socket_error"
  | "socket_timeout"
  | "request_finish"
  | "request_close"
  | "request_abort"
  | "request_error"
  | "response_headers"
  | "response_first_byte"
  | "response_end"
  | "response_aborted"
  | "response_error";

/** Sanitized Anthropic request-shape metrics only — never prompts or bodies. */
export interface RequestStructureDiagnostics {
  readonly localJsonParse: "pass" | "fail" | null;
  readonly topLevelKeys: readonly string[] | null;
  readonly fieldTypeMap: Readonly<Record<string, string>> | null;
  readonly messageCount: number | null;
  readonly contentBlockTypes: readonly (string | readonly string[])[] | null;
  readonly toolCount: number | null;
  readonly schemaResult: string | null;
  readonly serializer: string | null;
  readonly hashBeforeValidation: string | null;
  readonly hashBeforeSend: string | null;
  readonly hashAtSocketWrite: string | null;
}

export interface HttpTransportDiagnostics {
  readonly requestId: string;
  readonly attempt: number;
  readonly urlHost: string;
  readonly method: string;
  readonly payloadByteLength: number;
  readonly payloadSha256: string;
  readonly contentLengthHeader: number;
  readonly transferEncoding: string | null;
  readonly contentEncoding: string | null;
  readonly bytesWritten: number;
  readonly bodyFullyFlushed: boolean;
  readonly socketEvents: readonly TransportSocketEvent[];
  readonly aborted: boolean;
  readonly abortReason: string | null;
  readonly firstByteTimerArmed: boolean;
  readonly httpStatus: number | null;
  readonly responseByteLength: number;
  readonly responseSha256: string;
  readonly providerRequestId: string | null;
  readonly truncationSource: TruncationSource;
  readonly parserStage: string | null;
  readonly completed: boolean;
  readonly durationMs: number;
  readonly localJsonParse?: "pass" | "fail" | null;
  readonly topLevelKeys?: readonly string[] | null;
  readonly fieldTypeMap?: Readonly<Record<string, string>> | null;
  readonly messageCount?: number | null;
  readonly contentBlockTypes?: readonly (string | readonly string[])[] | null;
  readonly toolCount?: number | null;
  readonly schemaResult?: string | null;
  readonly serializer?: string | null;
  readonly hashBeforeValidation?: string | null;
  readonly hashBeforeSend?: string | null;
  readonly hashAtSocketWrite?: string | null;
}

let nextRequestSeq = 1;

export function createTransportRequestId(prefix = "http"): string {
  const seq = nextRequestSeq++;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function sha256Hex(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return createHash("sha256").update(buf).digest("hex");
}

export function safeSha256Prefix(data: Buffer | string): string {
  return sha256Hex(data).slice(0, 16);
}

export function extractProviderRequestId(
  headers: Record<string, string>,
): string | null {
  return (
    headers["request-id"] ??
    headers["x-request-id"] ??
    headers["anthropic-request-id"] ??
    null
  );
}

/** Classify where truncation was observed (no secret content). */
export function classifyTruncationSource(input: {
  readonly errorMessage?: string | null;
  readonly httpStatus?: number | null;
  readonly payloadByteLength: number;
  readonly bytesWritten: number;
  readonly responseByteLength: number;
  readonly responseParsed: boolean;
  readonly aborted: boolean;
  readonly abortReason?: string | null;
}): { source: TruncationSource; parserStage: string | null } {
  const msg = (input.errorMessage ?? "").trim();
  if (input.aborted) {
    if (/timeout/i.test(input.abortReason ?? msg)) {
      return { source: "transport_timeout", parserStage: "http_client_timer" };
    }
    return { source: "transport_aborted", parserStage: "http_client_abort" };
  }
  if (
    input.bytesWritten > 0 &&
    input.bytesWritten !== input.payloadByteLength
  ) {
    return {
      source: "local_outbound_write_mismatch",
      parserStage: "writeNodeRequestBody",
    };
  }
  if (/request body is not valid json|malformed request body|invalid json.*body/i.test(msg)) {
    return {
      source: "anthropic_rejected_outbound_request",
      parserStage: "anthropic_api_request_body_parser",
    };
  }
  if (/unexpected end of data|unexpected end of json/i.test(msg)) {
    if (/request body/i.test(msg)) {
      return {
        source: "anthropic_rejected_outbound_request",
        parserStage: "anthropic_api_request_body_parser",
      };
    }
    return {
      source: "inbound_response_json_truncated",
      parserStage: "fetchJson_parseJsonResponse",
    };
  }
  if (!input.responseParsed && input.responseByteLength > 0) {
    return {
      source: "inbound_response_json_truncated",
      parserStage: "fetchJson_parseJsonResponse",
    };
  }
  return { source: "none", parserStage: null };
}

export function formatTransportDiagnosticsLog(d: HttpTransportDiagnostics): string {
  return JSON.stringify({
    requestId: d.requestId,
    attempt: d.attempt,
    host: d.urlHost,
    method: d.method,
    payloadByteLength: d.payloadByteLength,
    payloadSha256: d.payloadSha256,
    contentLengthHeader: d.contentLengthHeader,
    transferEncoding: d.transferEncoding,
    contentEncoding: d.contentEncoding,
    bytesWritten: d.bytesWritten,
    bodyFullyFlushed: d.bodyFullyFlushed,
    socketEvents: d.socketEvents,
    aborted: d.aborted,
    abortReason: d.abortReason,
    httpStatus: d.httpStatus,
    responseByteLength: d.responseByteLength,
    responseSha256: d.responseSha256,
    providerRequestId: d.providerRequestId,
    truncationSource: d.truncationSource,
    parserStage: d.parserStage,
    completed: d.completed,
    durationMs: d.durationMs,
    ...(d.localJsonParse != null ? { localJsonParse: d.localJsonParse } : {}),
    ...(d.topLevelKeys != null ? { topLevelKeys: d.topLevelKeys } : {}),
    ...(d.fieldTypeMap != null ? { fieldTypeMap: d.fieldTypeMap } : {}),
    ...(d.messageCount != null ? { messageCount: d.messageCount } : {}),
    ...(d.contentBlockTypes != null
      ? { contentBlockTypes: d.contentBlockTypes }
      : {}),
    ...(d.toolCount != null ? { toolCount: d.toolCount } : {}),
    ...(d.schemaResult != null ? { schemaResult: d.schemaResult } : {}),
    ...(d.serializer != null ? { serializer: d.serializer } : {}),
    ...(d.hashBeforeValidation != null
      ? { hashBeforeValidation: d.hashBeforeValidation }
      : {}),
    ...(d.hashBeforeSend != null ? { hashBeforeSend: d.hashBeforeSend } : {}),
    ...(d.hashAtSocketWrite != null
      ? { hashAtSocketWrite: d.hashAtSocketWrite }
      : {}),
  });
}

const RING_MAX = 48;
const transportRing: HttpTransportDiagnostics[] = [];

let diagnosticsListener: ((d: HttpTransportDiagnostics) => void) | null = null;
let broadcastListener: ((d: HttpTransportDiagnostics) => void) | null = null;

function eventKey(d: HttpTransportDiagnostics): string {
  return `${d.requestId}:${d.attempt}`;
}

function upsertRing(d: HttpTransportDiagnostics): void {
  const key = eventKey(d);
  const idx = transportRing.findIndex((e) => eventKey(e) === key);
  if (idx >= 0) transportRing[idx] = d;
  else transportRing.push(d);
  while (transportRing.length > RING_MAX) transportRing.shift();
}

export function setTransportDiagnosticsListener(
  listener: ((d: HttpTransportDiagnostics) => void) | null,
): void {
  diagnosticsListener = listener;
}

/** Main-process hook to push safe metrics to all renderer windows. */
export function setTransportDiagnosticsBroadcast(
  listener: ((d: HttpTransportDiagnostics) => void) | null,
): void {
  broadcastListener = listener;
}

export function emitTransportDiagnostics(d: HttpTransportDiagnostics): void {
  upsertRing(d);
  try {
    diagnosticsListener?.(d);
  } catch {
    // Diagnostics must never break the provider HTTP path.
  }
  try {
    broadcastListener?.(d);
  } catch {
    // Diagnostics must never break the provider HTTP path.
  }
}

/** Documented maximum events retained in the main-process ring. */
export const TRANSPORT_DIAGNOSTICS_RING_MAX = RING_MAX;

export function getTransportDiagnosticsRing(): readonly HttpTransportDiagnostics[] {
  return [...transportRing];
}

export function clearTransportDiagnosticsRing(): void {
  transportRing.length = 0;
}

/** Prefer final / problem snapshots for UI (skip noisy mid-write heartbeats). */
export function isTransportEventInteresting(d: HttpTransportDiagnostics): boolean {
  return (
    d.completed ||
    d.aborted ||
    d.truncationSource !== "none" ||
    d.httpStatus != null
  );
}
