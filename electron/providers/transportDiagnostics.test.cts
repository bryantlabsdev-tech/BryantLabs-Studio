import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyTruncationSource,
  clearTransportDiagnosticsRing,
  emitTransportDiagnostics,
  getTransportDiagnosticsRing,
  isTransportEventInteresting,
  safeSha256Prefix,
  setTransportDiagnosticsBroadcast,
  setTransportDiagnosticsListener,
  TRANSPORT_DIAGNOSTICS_RING_MAX,
} from "./transportDiagnostics.cjs";

describe("transportDiagnostics", () => {
  it("classifies Anthropic outbound request JSON rejection", () => {
    const result = classifyTruncationSource({
      errorMessage:
        "The request body is not valid JSON: unexpected end of data: line 1 column 1685 (char 1684)",
      httpStatus: 400,
      payloadByteLength: 52_000,
      bytesWritten: 52_000,
      responseByteLength: 120,
      responseParsed: true,
      aborted: false,
    });
    assert.equal(result.source, "anthropic_rejected_outbound_request");
    assert.equal(result.parserStage, "anthropic_api_request_body_parser");
  });

  it("classifies local write mismatch separately from API rejection", () => {
    const result = classifyTruncationSource({
      payloadByteLength: 9000,
      bytesWritten: 1685,
      responseByteLength: 0,
      responseParsed: true,
      aborted: false,
    });
    assert.equal(result.source, "local_outbound_write_mismatch");
  });

  it("uses stable sha256 prefixes without logging payload", () => {
    const hash = safeSha256Prefix("hello world");
    assert.equal(hash.length, 16);
    assert.notEqual(hash, "hello world");
  });

  it("keeps a ring buffer upserted by requestId+attempt", () => {
    clearTransportDiagnosticsRing();
    emitTransportDiagnostics({
      requestId: "r1",
      attempt: 1,
      urlHost: "api.anthropic.com",
      method: "POST",
      payloadByteLength: 5000,
      payloadSha256: "aaaaaaaaaaaaaaaa",
      contentLengthHeader: 5000,
      transferEncoding: null,
      contentEncoding: null,
      bytesWritten: 5000,
      bodyFullyFlushed: true,
      socketEvents: ["request_finish"],
      aborted: false,
      abortReason: null,
      firstByteTimerArmed: false,
      httpStatus: 400,
      responseByteLength: 80,
      responseSha256: "bbbbbbbbbbbbbbbb",
      providerRequestId: null,
      truncationSource: "anthropic_rejected_outbound_request",
      parserStage: "anthropic_api_request_body_parser",
      completed: true,
      durationMs: 400,
    });
    emitTransportDiagnostics({
      requestId: "r1",
      attempt: 1,
      urlHost: "api.anthropic.com",
      method: "POST",
      payloadByteLength: 5000,
      payloadSha256: "aaaaaaaaaaaaaaaa",
      contentLengthHeader: 5000,
      transferEncoding: null,
      contentEncoding: null,
      bytesWritten: 5000,
      bodyFullyFlushed: true,
      socketEvents: ["request_finish", "response_end"],
      aborted: false,
      abortReason: null,
      firstByteTimerArmed: false,
      httpStatus: 400,
      responseByteLength: 80,
      responseSha256: "bbbbbbbbbbbbbbbb",
      providerRequestId: "req_1",
      truncationSource: "anthropic_rejected_outbound_request",
      parserStage: "anthropic_api_request_body_parser",
      completed: true,
      durationMs: 420,
    });
    const ring = getTransportDiagnosticsRing();
    assert.equal(ring.length, 1);
    assert.equal(ring[0]?.providerRequestId, "req_1");
    assert.equal(isTransportEventInteresting(ring[0]!), true);
    clearTransportDiagnosticsRing();
    assert.equal(getTransportDiagnosticsRing().length, 0);
  });

  it("does not let diagnostics listener failures abort emit", () => {
    clearTransportDiagnosticsRing();
    setTransportDiagnosticsListener(() => {
      throw new Error("diag boom");
    });
    setTransportDiagnosticsBroadcast(() => {
      throw new Error("broadcast boom");
    });
    assert.doesNotThrow(() => {
      emitTransportDiagnostics({
        requestId: "safe",
        attempt: 1,
        urlHost: "api.anthropic.com",
        method: "POST",
        payloadByteLength: 10,
        payloadSha256: "cccccccccccccccc",
        contentLengthHeader: 10,
        transferEncoding: null,
        contentEncoding: null,
        bytesWritten: 10,
        bodyFullyFlushed: true,
        socketEvents: ["response_end"],
        aborted: false,
        abortReason: null,
        firstByteTimerArmed: false,
        httpStatus: 200,
        responseByteLength: 2,
        responseSha256: "dddddddddddddddd",
        providerRequestId: null,
        truncationSource: "none",
        parserStage: null,
        completed: true,
        durationMs: 1,
      });
    });
    assert.equal(getTransportDiagnosticsRing().length, 1);
    setTransportDiagnosticsListener(null);
    setTransportDiagnosticsBroadcast(null);
    clearTransportDiagnosticsRing();
  });

  it("evicts when exceeding TRANSPORT_DIAGNOSTICS_RING_MAX", () => {
    clearTransportDiagnosticsRing();
    assert.equal(TRANSPORT_DIAGNOSTICS_RING_MAX, 48);
    for (let i = 0; i < TRANSPORT_DIAGNOSTICS_RING_MAX + 3; i += 1) {
      emitTransportDiagnostics({
        requestId: `evict-${i}`,
        attempt: 1,
        urlHost: "api.anthropic.com",
        method: "POST",
        payloadByteLength: 1,
        payloadSha256: "eeeeeeeeeeeeeeee",
        contentLengthHeader: 1,
        transferEncoding: null,
        contentEncoding: null,
        bytesWritten: 1,
        bodyFullyFlushed: true,
        socketEvents: [],
        aborted: false,
        abortReason: null,
        firstByteTimerArmed: false,
        httpStatus: 200,
        responseByteLength: 1,
        responseSha256: "ffffffffffffffff",
        providerRequestId: null,
        truncationSource: "none",
        parserStage: null,
        completed: true,
        durationMs: 1,
      });
    }
    assert.equal(getTransportDiagnosticsRing().length, TRANSPORT_DIAGNOSTICS_RING_MAX);
    assert.equal(getTransportDiagnosticsRing()[0]?.requestId, "evict-3");
    clearTransportDiagnosticsRing();
  });
});
