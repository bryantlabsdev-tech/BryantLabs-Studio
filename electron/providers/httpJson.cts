import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import {
  classifyTruncationSource,
  createTransportRequestId,
  emitTransportDiagnostics,
  extractProviderRequestId,
  formatTransportDiagnosticsLog,
  safeSha256Prefix,
  type TransportSocketEvent,
} from "./transportDiagnostics.cjs";
import {
  endProviderRequest,
  registerHttpProviderRequest,
} from "./providerRequestRegistry.cjs";

const BODY_WRITE_CHUNK = 16 * 1024;
/** Hard first-byte deadline — never wait silently for multi-minute TTFT. */
export const FIRST_BYTE_TIMEOUT_MS = 60_000;
export const FIRST_BYTE_TIMEOUT_FLOOR_MS = 60_000;
/** Kept for diagnostics/compat; resolveFirstByteTimeoutMs always returns 60s. */
export const FIRST_BYTE_TIMEOUT_CEILING_MS = 60_000;

export function resolveFirstByteTimeoutMs(totalTimeoutMs: number): number {
  void totalTimeoutMs;
  return FIRST_BYTE_TIMEOUT_MS;
}

/** Dedicated HTTP/1.1 agent for Anthropic — no pooling (fresh socket per request). */
const anthropicHttpsAgent = false as const;

function prepareOutboundSocket(socket: Socket): void {
  socket.setNoDelay(true);
}

function normalizeHeaders(
  initHeaders: RequestInit["headers"],
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!initHeaders) return headers;
  if (initHeaders instanceof Headers) {
    initHeaders.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return headers;
  }
  if (Array.isArray(initHeaders)) {
    for (const [key, value] of initHeaders) {
      headers[key.toLowerCase()] = String(value);
    }
    return headers;
  }
  for (const [key, value] of Object.entries(initHeaders)) {
    if (value != null) headers[key.toLowerCase()] = String(value);
  }
  return headers;
}

/** Always copy so callers cannot mutate a shared buffer mid-flight. */
export function encodeRequestBody(body: RequestInit["body"]): Buffer | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new Error("Unsupported request body type for provider HTTP client.");
}

function createTimeoutError(
  timeoutMs: number,
  kind: "total" | "first_byte" = "total",
): Error {
  const label = kind === "first_byte" ? "first-byte" : "total";
  const err = new Error(
    `The operation was aborted due to ${label} timeout after ${timeoutMs}ms`,
  );
  err.name = "AbortError";
  return err;
}

/** Anthropic/cloud APIs reject a cut-off JSON POST as invalid JSON. */
export function isTruncatedHttpJsonBodyError(error: string | undefined | null): boolean {
  return /request body is not valid json|unexpected end of data|malformed request body|invalid json.*body|request body byte mismatch/i.test(
    (error ?? "").trim(),
  );
}

/** True when this module is running inside the Electron main process. */
export function shouldUseElectronNet(): boolean {
  return Boolean(process.versions.electron);
}

export function safeBodyHash(body: Buffer): string {
  return safeSha256Prefix(body);
}

export interface RequestBodyTransportMetrics {
  readonly requestId: string;
  readonly payloadByteLength: number;
  readonly payloadSha256: string;
  readonly contentLengthHeader: number;
  readonly transferEncoding: string | null;
  readonly contentEncoding: string | null;
  readonly bytesWritten: number;
  readonly bodyHash: string;
  readonly attempt: number;
  readonly bodyFullyFlushed: boolean;
  readonly firstByteTimerArmed: boolean;
  readonly aborted: boolean;
  readonly completed: boolean;
  readonly httpStatus: number | null;
  readonly responseByteLength: number;
  readonly responseSha256: string;
  readonly providerRequestId: string | null;
  readonly truncationSource: import("./transportDiagnostics.cjs").TruncationSource;
  readonly parserStage: string | null;
  readonly socketEvents: readonly TransportSocketEvent[];
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

export type TransportMetricsListener = (metrics: RequestBodyTransportMetrics) => void;

let metricsListener: TransportMetricsListener | null = null;

/** Test-only hook for transport byte accounting (no secrets). */
export function setHttpJsonMetricsListener(
  listener: TransportMetricsListener | null,
): void {
  metricsListener = listener;
}

function emitMetrics(metrics: RequestBodyTransportMetrics): void {
  metricsListener?.(metrics);
}

/**
 * Write the full body with a single end() for small payloads (matches the
 * Node probe that succeeds at ~1.7KB). Larger bodies still chunk on drain.
 * Returns bytes handed to the HTTP client (must equal body.length).
 */
export async function writeNodeRequestBody(
  req: http.ClientRequest,
  body: Buffer,
): Promise<number> {
  // Ensure TCP_NODELAY on the outbound socket when assigned.
  req.once("socket", (socket: Socket) => {
    prepareOutboundSocket(socket);
  });

  if (body.length <= BODY_WRITE_CHUNK) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(body.length);
      };
      req.once("error", finish);
      // write + end (not end(data)) so Electron flushes the full buffer before finish.
      const ok = req.write(body, (writeErr) => {
        if (writeErr) {
          finish(writeErr);
          return;
        }
        req.end(() => finish());
      });
      if (!ok) {
        req.once("drain", () => {
          /* write callback still ends the request */
        });
      }
    });
  }

  return new Promise((resolve, reject) => {
    let offset = 0;
    let bytesWritten = 0;
    let ended = false;
    req.once("error", (err) => {
      if (ended) return;
      ended = true;
      reject(err);
    });

    const finish = (): void => {
      if (ended) return;
      ended = true;
      resolve(bytesWritten);
    };

    const writeNext = (): void => {
      while (offset < body.length) {
        const end = Math.min(offset + BODY_WRITE_CHUNK, body.length);
        const chunk = body.subarray(offset, end);
        offset = end;
        const canContinue = req.write(chunk);
        bytesWritten += chunk.length;
        if (!canContinue && offset < body.length) {
          req.once("drain", writeNext);
          return;
        }
      }
      req.end(() => finish());
    };

    writeNext();
  });
}

export interface HttpJsonResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly text: string;
  readonly headers: Record<string, string>;
  readonly transport?: RequestBodyTransportMetrics;
}

function collectHeaderMap(
  raw: http.IncomingHttpHeaders | Record<string, string | string[] | undefined>,
): Record<string, string> {
  const outHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") outHeaders[key.toLowerCase()] = value;
    else if (Array.isArray(value)) outHeaders[key.toLowerCase()] = value.join(", ");
  }
  return outHeaders;
}

function requestViaNodeHttp(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  bodyBuffer: Buffer | undefined,
  headers: Record<string, string>,
  attempt: number,
  requestId: string,
  structure?: import("./transportDiagnostics.cjs").RequestStructureDiagnostics | null,
): Promise<HttpJsonResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const transportMod = isHttps ? https : http;
    const method = (init.method ?? "GET").toUpperCase();
    const startedAt = Date.now();
    let settled = false;
    let gotResponse = false;
    let bodyFullyFlushed = bodyBuffer == null;
    let firstByteTimerArmed = false;
    let aborted = false;
    let abortReason: string | null = null;
    let bytesWritten = 0;
    let responseByteLength = 0;
    let responseSha256 = "empty";
    let httpStatus: number | null = null;
    let providerRequestId: string | null = null;
    let responseHeaders: Record<string, string> = {};
    const socketEvents: TransportSocketEvent[] = [];
    const firstByteMs = resolveFirstByteTimeoutMs(timeoutMs);
    let firstByteTimer: ReturnType<typeof setTimeout> | null = null;
    let totalTimer: ReturnType<typeof setTimeout> | null = null;
    let req!: http.ClientRequest;

    const payloadByteLength = bodyBuffer?.length ?? 0;
    const payloadSha256 = bodyBuffer ? safeSha256Prefix(bodyBuffer) : "empty";
    const contentLengthHeader = bodyBuffer
      ? Number(headers["content-length"] ?? payloadByteLength)
      : 0;
    const transferEncoding = headers["transfer-encoding"] ?? null;
    const contentEncoding = headers["content-encoding"] ?? null;
    const hashAtSocketWrite = payloadSha256;
    const structureFields = structure
      ? {
          localJsonParse: structure.localJsonParse,
          topLevelKeys: structure.topLevelKeys,
          fieldTypeMap: structure.fieldTypeMap,
          messageCount: structure.messageCount,
          contentBlockTypes: structure.contentBlockTypes,
          toolCount: structure.toolCount,
          schemaResult: structure.schemaResult,
          serializer: structure.serializer,
          hashBeforeValidation: structure.hashBeforeValidation,
          hashBeforeSend: structure.hashBeforeSend,
          hashAtSocketWrite:
            structure.hashAtSocketWrite ?? hashAtSocketWrite,
        }
      : {
          hashAtSocketWrite,
        };

    const pushSocketEvent = (event: TransportSocketEvent): void => {
      socketEvents.push(event);
    };

    const clearTimers = (): void => {
      if (firstByteTimer) clearTimeout(firstByteTimer);
      if (totalTimer) clearTimeout(totalTimer);
      firstByteTimer = null;
      totalTimer = null;
      firstByteTimerArmed = false;
    };

    const buildMetrics = (
      completed: boolean,
      errorMessage?: string | null,
      responseParsed = true,
    ): RequestBodyTransportMetrics => {
      const classified = classifyTruncationSource({
        errorMessage,
        httpStatus,
        payloadByteLength,
        bytesWritten,
        responseByteLength,
        responseParsed,
        aborted,
        abortReason,
      });
      return {
        requestId,
        payloadByteLength,
        payloadSha256,
        contentLengthHeader,
        transferEncoding,
        contentEncoding,
        bytesWritten,
        bodyHash: payloadSha256,
        attempt,
        bodyFullyFlushed,
        firstByteTimerArmed,
        aborted,
        completed,
        httpStatus,
        responseByteLength,
        responseSha256,
        providerRequestId,
        truncationSource: classified.source,
        parserStage: classified.parserStage,
        socketEvents: [...socketEvents],
        durationMs: Date.now() - startedAt,
        ...structureFields,
      };
    };

    const publishDiagnostics = (
      completed: boolean,
      errorMessage?: string | null,
      responseParsed = true,
    ): void => {
      const metrics = buildMetrics(completed, errorMessage, responseParsed);
      emitMetrics(metrics);
      emitTransportDiagnostics({
        requestId,
        attempt,
        urlHost: parsedUrl.host,
        method,
        payloadByteLength,
        payloadSha256,
        contentLengthHeader,
        transferEncoding,
        contentEncoding,
        bytesWritten,
        bodyFullyFlushed,
        socketEvents: [...socketEvents],
        aborted,
        abortReason,
        firstByteTimerArmed,
        httpStatus,
        responseByteLength,
        responseSha256,
        providerRequestId,
        truncationSource: metrics.truncationSource,
        parserStage: metrics.parserStage,
        completed,
        durationMs: metrics.durationMs,
        ...structureFields,
      });
      if (metrics.truncationSource !== "none" || aborted) {
        console.log(`[http:transport] ${formatTransportDiagnosticsLog({
          requestId,
          attempt,
          urlHost: parsedUrl.host,
          method,
          payloadByteLength,
          payloadSha256,
          contentLengthHeader,
          transferEncoding,
          contentEncoding,
          bytesWritten,
          bodyFullyFlushed,
          socketEvents: [...socketEvents],
          aborted,
          abortReason,
          firstByteTimerArmed,
          httpStatus,
          responseByteLength,
          responseSha256,
          providerRequestId,
          truncationSource: metrics.truncationSource,
          parserStage: metrics.parserStage,
          completed,
          durationMs: metrics.durationMs,
        })}`);
      }
    };

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      endProviderRequest(requestId);
      fn();
    };

    const armFirstByteTimer = (): void => {
      if (settled || gotResponse || firstByteTimerArmed) return;
      firstByteTimerArmed = true;
      firstByteTimer = setTimeout(() => {
        if (gotResponse || settled) return;
        aborted = true;
        abortReason = `first-byte timeout after ${firstByteMs}ms`;
        const timeoutErr = createTimeoutError(firstByteMs, "first_byte");
        publishDiagnostics(false, abortReason, true);
        try {
          req.destroy(timeoutErr);
        } catch {
          /* ignore */
        }
        // Always settle — destroy() does not reliably emit "error" on all sockets.
        settle(() => reject(timeoutErr));
      }, firstByteMs);
      publishDiagnostics(false, null, true);
    };

    totalTimer = setTimeout(() => {
      if (settled) return;
      aborted = true;
      abortReason = `total timeout after ${timeoutMs}ms`;
      const timeoutErr = createTimeoutError(timeoutMs, "total");
      publishDiagnostics(false, abortReason, true);
      try {
        req.destroy(timeoutErr);
      } catch {
        /* ignore */
      }
      settle(() => reject(timeoutErr));
    }, timeoutMs);

    req = transportMod.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers,
        agent:
          isHttps && parsedUrl.hostname === "api.anthropic.com"
            ? anthropicHttpsAgent
            : false,
        ...(isHttps ? { ALPNProtocols: ["http/1.1"] as const } : {}),
      },
      (res) => {
        gotResponse = true;
        pushSocketEvent("response_headers");
        httpStatus = res.statusCode ?? 0;
        responseHeaders = collectHeaderMap(res.headers);
        providerRequestId = extractProviderRequestId(responseHeaders);
        if (firstByteTimer) {
          clearTimeout(firstByteTimer);
          firstByteTimer = null;
          firstByteTimerArmed = false;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          if (chunks.length === 0) pushSocketEvent("response_first_byte");
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          pushSocketEvent("response_end");
          const responseBody = Buffer.concat(chunks);
          responseByteLength = responseBody.length;
          responseSha256 = safeSha256Prefix(responseBody);
          // Classify Anthropic/outbound JSON reject using error.message only (no body logged).
          let apiErrorHint: string | null = null;
          try {
            const parsed = JSON.parse(responseBody.toString("utf8")) as {
              error?: { message?: string };
            };
            const msg = parsed?.error?.message?.trim();
            if (msg) apiErrorHint = msg;
          } catch {
            /* response may be non-JSON; fetchJson handles that */
          }
          const metrics = buildMetrics(true, apiErrorHint, true);
          publishDiagnostics(true, apiErrorHint, true);
          settle(() =>
            resolve({
              status: httpStatus ?? 0,
              ok: (httpStatus ?? 0) >= 200 && (httpStatus ?? 0) < 300,
              text: responseBody.toString("utf8"),
              headers: responseHeaders,
              transport: metrics,
            }),
          );
        });
        res.on("aborted", () => pushSocketEvent("response_aborted"));
        res.on("error", (err) => {
          pushSocketEvent("response_error");
          aborted = true;
          abortReason = err.message;
          publishDiagnostics(false, err.message, false);
          settle(() => reject(err));
        });
      },
    );

    registerHttpProviderRequest(requestId, attempt, req, { clear: clearTimers });

    req.on("socket", (socket: Socket) => {
      pushSocketEvent("socket_assigned");
      prepareOutboundSocket(socket);
      socket.once("connect", () => pushSocketEvent("socket_connect"));
      const tls = socket as TLSSocket;
      if (typeof tls.encrypted === "boolean" && tls.encrypted) {
        tls.once("secureConnect", () => pushSocketEvent("socket_secure_connect"));
      }
      socket.once("close", () => pushSocketEvent("socket_close"));
      socket.once("error", () => pushSocketEvent("socket_error"));
      socket.once("timeout", () => pushSocketEvent("socket_timeout"));
    });

    req.on("finish", () => pushSocketEvent("request_finish"));
    req.on("close", () => pushSocketEvent("request_close"));
    req.on("abort", () => {
      pushSocketEvent("request_abort");
      aborted = true;
      abortReason = abortReason ?? "request_aborted";
    });

    req.on("error", (err) => {
      pushSocketEvent("request_error");
      aborted = true;
      abortReason = err.message;
      publishDiagnostics(false, err.message, false);
      settle(() => reject(err));
    });

    if (bodyBuffer) {
      if (contentLengthHeader !== payloadByteLength) {
        const err = new Error(
          `Request body byte mismatch: Content-Length=${contentLengthHeader} payloadByteLength=${payloadByteLength} hash=${payloadSha256}`,
        );
        publishDiagnostics(false, err.message, true);
        settle(() => reject(err));
        return;
      }
      void writeNodeRequestBody(req, bodyBuffer)
        .then((written) => {
          bytesWritten = written;
          bodyFullyFlushed = true;
          // Do not yield after flush — arm the first-byte timer immediately.
          if (written !== payloadByteLength) {
            const err = new Error(
              `Request body byte mismatch: wrote=${written} payloadByteLength=${payloadByteLength} Content-Length=${contentLengthHeader} hash=${payloadSha256}`,
            );
            aborted = true;
            abortReason = err.message;
            publishDiagnostics(false, err.message, true);
            req.destroy(err);
            settle(() => reject(err));
            return;
          }
          publishDiagnostics(false, null, true);
          armFirstByteTimer();
        })
        .catch((err: Error) => {
          aborted = true;
          abortReason = err.message;
          publishDiagnostics(false, err.message, false);
          settle(() => reject(err));
        });
    } else {
      req.end();
      bodyFullyFlushed = true;
      armFirstByteTimer();
    }
  });
}

/**
 * JSON HTTP client with explicit UTF-8 Content-Length and HTTP/1.1.
 * Each call uses a fresh body buffer, request id, and timers (safe for retries).
 */
export function requestHttpJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  opts?: {
    attempt?: number;
    requestId?: string;
    structure?: import("./transportDiagnostics.cjs").RequestStructureDiagnostics | null;
  },
): Promise<HttpJsonResponse> {
  const attempt = opts?.attempt ?? 1;
  const requestId = opts?.requestId ?? createTransportRequestId("anthropic");
  const bodyBuffer = encodeRequestBody(init.body);
  const headers = normalizeHeaders(init.headers);
  delete headers["transfer-encoding"];
  delete headers["content-encoding"];
  if (bodyBuffer) {
    headers["content-length"] = String(bodyBuffer.length);
    headers["connection"] = "close";
  }
  return requestViaNodeHttp(
    url,
    init,
    timeoutMs,
    bodyBuffer,
    headers,
    attempt,
    requestId,
    opts?.structure ?? null,
  );
}

export { createTransportRequestId } from "./transportDiagnostics.cjs";
