/**
 * Safe provider HTTP transport diagnostics (renderer).
 * No credentials, prompts, source files, or full response bodies.
 */

export type TruncationSource =
  | "none"
  | "anthropic_rejected_outbound_request"
  | "local_outbound_write_mismatch"
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

export interface ProviderTransportEvent {
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
  readonly receivedAt?: number;
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

/** Documented maximum events retained in the renderer ring buffer. */
export const PROVIDER_TRANSPORT_RING_MAX = 48;

const ALLOWED_TRANSPORT_KEYS = new Set([
  "requestId",
  "attempt",
  "urlHost",
  "method",
  "payloadByteLength",
  "payloadSha256",
  "contentLengthHeader",
  "transferEncoding",
  "contentEncoding",
  "bytesWritten",
  "bodyFullyFlushed",
  "socketEvents",
  "aborted",
  "abortReason",
  "firstByteTimerArmed",
  "httpStatus",
  "responseByteLength",
  "responseSha256",
  "providerRequestId",
  "truncationSource",
  "parserStage",
  "completed",
  "durationMs",
  "receivedAt",
  "host",
  "localJsonParse",
  "topLevelKeys",
  "fieldTypeMap",
  "messageCount",
  "contentBlockTypes",
  "toolCount",
  "schemaResult",
  "serializer",
  "hashBeforeValidation",
  "hashBeforeSend",
  "hashAtSocketWrite",
]);

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|prompt|messages|content|body|raw|text|source|password|secret|token)$/i;

const SENSITIVE_VALUE_RE =
  /sk-ant-|Bearer\s+[A-Za-z0-9._\-]+|api[_-]?key\s*[:=]|-----BEGIN|@@FILE:|password\s*[:=]/i;

let ring: ProviderTransportEvent[] = [];
const subscribers = new Set<(events: readonly ProviderTransportEvent[]) => void>();

function eventKey(d: ProviderTransportEvent): string {
  return `${d.requestId}:${d.attempt}`;
}

/**
 * Recursively strip sensitive keys/values from an unknown diagnostics payload.
 * Only allowlisted scalar fields survive; nested secrets become "[redacted]".
 */
export function redactTransportPayload(value: unknown, keyHint = ""): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (SENSITIVE_KEY_RE.test(keyHint) || SENSITIVE_VALUE_RE.test(value)) {
      return "[redacted]";
    }
    if (value.length > 256) return "[redacted]";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (keyHint === "socketEvents" || keyHint === "topLevelKeys") {
      return value.filter((v) => typeof v === "string").map((v) => String(v));
    }
    if (keyHint === "contentBlockTypes") {
      return value.map((item) =>
        Array.isArray(item)
          ? item.filter((v) => typeof v === "string").map((v) => String(v))
          : typeof item === "string"
            ? item
            : "[redacted]",
      );
    }
    return value.map((item) => redactTransportPayload(item, keyHint));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Nested map of field name → typeof string (sanitized structure only).
      // Do not treat keys like "messages" as secret payloads here — values are type names.
      if (keyHint === "fieldTypeMap") {
        if (typeof v === "string") out[k] = v.slice(0, 32);
        continue;
      }
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      if (!ALLOWED_TRANSPORT_KEYS.has(k) && k !== "summary" && k !== "events") {
        continue;
      }
      out[k] = redactTransportPayload(v, k);
    }
    return out;
  }
  return "[redacted]";
}

export function sanitizeProviderTransportEvent(
  raw: Record<string, unknown>,
): ProviderTransportEvent {
  const redacted = redactTransportPayload(raw) as Record<string, unknown>;
  return {
    requestId: String(redacted.requestId ?? "unknown"),
    attempt: Number(redacted.attempt ?? 0),
    urlHost: String(redacted.urlHost ?? ""),
    method: String(redacted.method ?? "POST"),
    payloadByteLength: Number(redacted.payloadByteLength ?? 0),
    payloadSha256: String(redacted.payloadSha256 ?? "").slice(0, 16),
    contentLengthHeader: Number(redacted.contentLengthHeader ?? 0),
    transferEncoding:
      redacted.transferEncoding == null ? null : String(redacted.transferEncoding),
    contentEncoding:
      redacted.contentEncoding == null ? null : String(redacted.contentEncoding),
    bytesWritten: Number(redacted.bytesWritten ?? 0),
    bodyFullyFlushed: Boolean(redacted.bodyFullyFlushed),
    socketEvents: Array.isArray(redacted.socketEvents)
      ? (redacted.socketEvents as TransportSocketEvent[])
      : [],
    aborted: Boolean(redacted.aborted),
    abortReason:
      redacted.abortReason == null ? null : String(redacted.abortReason).slice(0, 200),
    firstByteTimerArmed: Boolean(redacted.firstByteTimerArmed),
    httpStatus: redacted.httpStatus == null ? null : Number(redacted.httpStatus),
    responseByteLength: Number(redacted.responseByteLength ?? 0),
    responseSha256: String(redacted.responseSha256 ?? "").slice(0, 16),
    providerRequestId:
      redacted.providerRequestId == null
        ? null
        : String(redacted.providerRequestId).slice(0, 128),
    truncationSource: (redacted.truncationSource as TruncationSource) ?? "none",
    parserStage: redacted.parserStage == null ? null : String(redacted.parserStage),
    completed: Boolean(redacted.completed),
    durationMs: Number(redacted.durationMs ?? 0),
    ...(typeof redacted.receivedAt === "number"
      ? { receivedAt: redacted.receivedAt }
      : {}),
    ...(redacted.localJsonParse === "pass" || redacted.localJsonParse === "fail"
      ? { localJsonParse: redacted.localJsonParse }
      : {}),
    ...(Array.isArray(redacted.topLevelKeys)
      ? { topLevelKeys: redacted.topLevelKeys as string[] }
      : {}),
    ...(redacted.fieldTypeMap &&
    typeof redacted.fieldTypeMap === "object" &&
    !Array.isArray(redacted.fieldTypeMap)
      ? {
          fieldTypeMap: redacted.fieldTypeMap as Record<string, string>,
        }
      : {}),
    ...(typeof redacted.messageCount === "number"
      ? { messageCount: redacted.messageCount }
      : {}),
    ...(Array.isArray(redacted.contentBlockTypes)
      ? {
          contentBlockTypes: redacted.contentBlockTypes as Array<
            string | string[]
          >,
        }
      : {}),
    ...(typeof redacted.toolCount === "number"
      ? { toolCount: redacted.toolCount }
      : {}),
    ...(typeof redacted.schemaResult === "string"
      ? { schemaResult: redacted.schemaResult.slice(0, 64) }
      : {}),
    ...(typeof redacted.serializer === "string"
      ? { serializer: redacted.serializer.slice(0, 64) }
      : {}),
    ...(typeof redacted.hashBeforeValidation === "string"
      ? { hashBeforeValidation: redacted.hashBeforeValidation.slice(0, 16) }
      : {}),
    ...(typeof redacted.hashBeforeSend === "string"
      ? { hashBeforeSend: redacted.hashBeforeSend.slice(0, 16) }
      : {}),
    ...(typeof redacted.hashAtSocketWrite === "string"
      ? { hashAtSocketWrite: redacted.hashAtSocketWrite.slice(0, 16) }
      : {}),
  };
}

export function transportEventContainsSecrets(
  event: ProviderTransportEvent | Record<string, unknown>,
): boolean {
  const serialized = JSON.stringify(event);
  return SENSITIVE_VALUE_RE.test(serialized);
}

export function upsertProviderTransportEvent(
  event: ProviderTransportEvent | Record<string, unknown>,
): readonly ProviderTransportEvent[] {
  const stamped = sanitizeProviderTransportEvent({
    ...(event as Record<string, unknown>),
    receivedAt:
      typeof (event as ProviderTransportEvent).receivedAt === "number"
        ? (event as ProviderTransportEvent).receivedAt
        : Date.now(),
  });
  const next = [...ring];
  const key = eventKey(stamped);
  const idx = next.findIndex((e) => eventKey(e) === key);
  if (idx >= 0) next[idx] = stamped;
  else next.push(stamped);
  while (next.length > PROVIDER_TRANSPORT_RING_MAX) next.shift();
  ring = next;
  for (const sub of subscribers) {
    try {
      sub(ring);
    } catch {
      // Subscriber failures must not affect provider calls or other listeners.
    }
  }
  return ring;
}

export function replaceProviderTransportEvents(
  events: readonly ProviderTransportEvent[],
): void {
  ring = events
    .slice(-PROVIDER_TRANSPORT_RING_MAX)
    .map((e) => sanitizeProviderTransportEvent({ ...(e as unknown as Record<string, unknown>) }));
  for (const sub of subscribers) {
    try {
      sub(ring);
    } catch {
      /* ignore */
    }
  }
}

export function clearProviderTransportEvents(): void {
  ring = [];
  for (const sub of subscribers) {
    try {
      sub(ring);
    } catch {
      /* ignore */
    }
  }
}

export function getProviderTransportEvents(): readonly ProviderTransportEvent[] {
  return ring;
}

export function getProviderTransportSubscriberCount(): number {
  return subscribers.size;
}

export function subscribeProviderTransportEvents(
  listener: (events: readonly ProviderTransportEvent[]) => void,
): () => void {
  subscribers.add(listener);
  try {
    listener(ring);
  } catch {
    /* ignore */
  }
  return () => {
    subscribers.delete(listener);
  };
}

export function isTransportProblem(event: ProviderTransportEvent): boolean {
  return (
    event.truncationSource !== "none" ||
    event.aborted ||
    (event.httpStatus != null && event.httpStatus >= 400)
  );
}

export function summarizeTransportLog(
  events: readonly ProviderTransportEvent[],
): {
  readonly total: number;
  readonly problems: number;
  readonly firstAttemptProblems: number;
  readonly lastProblem: ProviderTransportEvent | null;
} {
  const problems = events.filter(isTransportProblem);
  return {
    total: events.length,
    problems: problems.length,
    firstAttemptProblems: problems.filter((e) => e.attempt === 1).length,
    lastProblem: problems.length > 0 ? problems[problems.length - 1]! : null,
  };
}

export function correlateRetryAttempts(
  events: readonly ProviderTransportEvent[],
): readonly {
  readonly requestFamily: string;
  readonly attempts: readonly number[];
  readonly firstAttemptOk: boolean;
  readonly retrySucceeded: boolean;
}[] {
  const byFamily = new Map<string, ProviderTransportEvent[]>();
  for (const e of events) {
    const family = `${e.urlHost}:${e.payloadSha256}`;
    const list = byFamily.get(family) ?? [];
    list.push(e);
    byFamily.set(family, list);
  }
  return [...byFamily.entries()].map(([requestFamily, group]) => {
    const attempts = [...new Set(group.map((g) => g.attempt))].sort((a, b) => a - b);
    const a1 = group.find((g) => g.attempt === 1);
    const laterOk = group.some(
      (g) => g.attempt > 1 && !isTransportProblem(g) && g.completed,
    );
    return {
      requestFamily,
      attempts,
      firstAttemptOk: Boolean(a1 && !isTransportProblem(a1) && a1.completed),
      retrySucceeded: laterOk,
    };
  });
}

export function formatTruncationSource(source: TruncationSource): string {
  switch (source) {
    case "anthropic_rejected_outbound_request":
      return "Anthropic rejected request JSON";
    case "local_outbound_write_mismatch":
      return "Local write byte mismatch";
    case "inbound_response_json_truncated":
      return "Inbound response truncated";
    case "transport_aborted":
      return "Transport aborted";
    case "transport_timeout":
      return "Transport timeout";
    default:
      return "OK";
  }
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
