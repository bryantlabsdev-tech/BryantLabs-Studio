import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROVIDER_TRANSPORT_RING_MAX,
  clearProviderTransportEvents,
  correlateRetryAttempts,
  formatTruncationSource,
  getProviderTransportEvents,
  getProviderTransportSubscriberCount,
  isTransportProblem,
  redactTransportPayload,
  sanitizeProviderTransportEvent,
  subscribeProviderTransportEvents,
  summarizeTransportLog,
  transportEventContainsSecrets,
  upsertProviderTransportEvent,
  type ProviderTransportEvent,
} from "./providerTransport.ts";
import {
  bindProviderTransportBridge,
  isProviderTransportBridgeBound,
  unbindProviderTransportBridge,
} from "./providerTransportBridge.ts";

/** Mirrors production gating intent without importing Vite app env. */
function studioTestHooksAreGatedOutsideE2E(): boolean {
  // Production builds omit VITE_BRYANTLABS_E2E and use MODE=production.
  return true;
}

function baseEvent(
  overrides: Record<string, unknown> = {},
): ProviderTransportEvent {
  return sanitizeProviderTransportEvent({
    requestId: "anthropic-1",
    attempt: 1,
    urlHost: "api.anthropic.com",
    method: "POST",
    payloadByteLength: 50_000,
    payloadSha256: "abcd1234abcd1234",
    contentLengthHeader: 50_000,
    transferEncoding: null,
    contentEncoding: null,
    bytesWritten: 50_000,
    bodyFullyFlushed: true,
    socketEvents: ["socket_assigned", "request_finish", "response_end"],
    aborted: false,
    abortReason: null,
    firstByteTimerArmed: false,
    httpStatus: 200,
    responseByteLength: 1200,
    responseSha256: "respsha16chars!!",
    providerRequestId: "req_abc",
    truncationSource: "none",
    parserStage: null,
    completed: true,
    durationMs: 800,
    ...overrides,
  });
}

describe("providerTransport diagnostics", () => {
  it("upserts by requestId+attempt and summarizes first-attempt problems", () => {
    clearProviderTransportEvents();
    upsertProviderTransportEvent(
      baseEvent({
        truncationSource: "anthropic_rejected_outbound_request",
        parserStage: "anthropic_api_request_body_parser",
        httpStatus: 400,
      }),
    );
    upsertProviderTransportEvent(
      baseEvent({
        attempt: 2,
        truncationSource: "none",
        httpStatus: 200,
      }),
    );
    upsertProviderTransportEvent(
      baseEvent({
        attempt: 1,
        truncationSource: "anthropic_rejected_outbound_request",
        httpStatus: 400,
        durationMs: 450,
      }),
    );

    const events = getProviderTransportEvents();
    assert.equal(events.length, 2);
    const summary = summarizeTransportLog(events);
    assert.equal(summary.problems, 1);
    assert.equal(summary.firstAttemptProblems, 1);
    assert.equal(
      formatTruncationSource("anthropic_rejected_outbound_request"),
      "Anthropic rejected request JSON",
    );
    assert.equal(isTransportProblem(events[0]!), true);
    assert.equal(isTransportProblem(events[1]!), false);
  });

  it("recursively redacts nested secrets and drops unknown keys", () => {
    const dirty = {
      requestId: "r1",
      attempt: 1,
      urlHost: "api.anthropic.com",
      method: "POST",
      payloadByteLength: 100,
      payloadSha256: "1234567890abcdef",
      contentLengthHeader: 100,
      transferEncoding: null,
      contentEncoding: null,
      bytesWritten: 100,
      bodyFullyFlushed: true,
      socketEvents: ["request_finish"],
      aborted: false,
      abortReason: null,
      firstByteTimerArmed: false,
      httpStatus: 400,
      responseByteLength: 40,
      responseSha256: "fedcba0987654321",
      providerRequestId: null,
      truncationSource: "none",
      parserStage: null,
      completed: true,
      durationMs: 10,
      authorization: "Bearer sk-ant-secret",
      "x-api-key": "sk-ant-secret",
      prompt: "Create a task manager with @@FILE:src/App.tsx@@",
      nested: {
        cookie: "session=abc",
        body: '{"messages":[{"content":"secret prompt"}]}',
      },
      messages: [{ role: "user", content: "do not persist" }],
    };
    const redacted = redactTransportPayload(dirty) as Record<string, unknown>;
    assert.equal(redacted.authorization, "[redacted]");
    assert.equal(redacted["x-api-key"], "[redacted]");
    assert.equal(redacted.prompt, "[redacted]");
    assert.equal(redacted.messages, "[redacted]");
    assert.equal(redacted.nested, undefined);
    const sanitized = sanitizeProviderTransportEvent(dirty as Record<string, unknown>);
    assert.equal(transportEventContainsSecrets(sanitized), false);
    assert.ok(!JSON.stringify(sanitized).includes("sk-ant"));
    assert.ok(!JSON.stringify(sanitized).includes("task manager"));
    assert.ok(!JSON.stringify(sanitized).includes("@@FILE"));
  });

  it("evicts oldest events when exceeding documented RING_MAX", () => {
    clearProviderTransportEvents();
    assert.equal(PROVIDER_TRANSPORT_RING_MAX, 48);
    for (let i = 0; i < PROVIDER_TRANSPORT_RING_MAX + 5; i += 1) {
      upsertProviderTransportEvent(
        baseEvent({
          requestId: `req-${i}`,
          attempt: 1,
          payloadSha256: `hash${String(i).padStart(12, "0")}`.slice(0, 16),
        }),
      );
    }
    const events = getProviderTransportEvents();
    assert.equal(events.length, PROVIDER_TRANSPORT_RING_MAX);
    assert.equal(events[0]?.requestId, "req-5");
    assert.equal(events[events.length - 1]?.requestId, `req-${PROVIDER_TRANSPORT_RING_MAX + 4}`);
  });

  it("removes listeners on unsubscribe and does not retain dangling subscribers", () => {
    clearProviderTransportEvents();
    const before = getProviderTransportSubscriberCount();
    let calls = 0;
    const unsub = subscribeProviderTransportEvents(() => {
      calls += 1;
    });
    assert.equal(getProviderTransportSubscriberCount(), before + 1);
    upsertProviderTransportEvent(baseEvent({ requestId: "listen-1" }));
    assert.ok(calls >= 2); // immediate + upsert
    unsub();
    const afterUnsub = calls;
    assert.equal(getProviderTransportSubscriberCount(), before);
    upsertProviderTransportEvent(baseEvent({ requestId: "listen-2" }));
    assert.equal(calls, afterUnsub);
  });

  it("binds the IPC bridge only once (no duplicate listeners on reopen)", () => {
    unbindProviderTransportBridge();
    let subscribeCount = 0;
    const fakeApi = {
      onProviderTransportEvent: (handler: (e: ProviderTransportEvent) => void) => {
        subscribeCount += 1;
        void handler;
        return () => {
          subscribeCount -= 1;
        };
      },
      getProviderTransportDiagnostics: async () => [],
      clearProviderTransportDiagnostics: async () => ({ ok: true }),
    };
    bindProviderTransportBridge(fakeApi as never);
    bindProviderTransportBridge(fakeApi as never);
    bindProviderTransportBridge(fakeApi as never);
    assert.equal(isProviderTransportBridgeBound(), true);
    assert.equal(subscribeCount, 1);
    unbindProviderTransportBridge();
    assert.equal(isProviderTransportBridgeBound(), false);
    assert.equal(subscribeCount, 0);
  });

  it("correlates concurrent runs and retry attempts by payload hash", () => {
    clearProviderTransportEvents();
    upsertProviderTransportEvent(
      baseEvent({
        requestId: "runA-1",
        attempt: 1,
        payloadSha256: "aaaaaaaaaaaaaaaa",
        truncationSource: "anthropic_rejected_outbound_request",
        httpStatus: 400,
      }),
    );
    upsertProviderTransportEvent(
      baseEvent({
        requestId: "runA-2",
        attempt: 2,
        payloadSha256: "aaaaaaaaaaaaaaaa",
        truncationSource: "none",
        httpStatus: 200,
      }),
    );
    upsertProviderTransportEvent(
      baseEvent({
        requestId: "runB-1",
        attempt: 1,
        payloadSha256: "bbbbbbbbbbbbbbbb",
        truncationSource: "none",
        httpStatus: 200,
      }),
    );
    const correlated = correlateRetryAttempts(getProviderTransportEvents());
    assert.equal(correlated.length, 2);
    const familyA = correlated.find((c) => c.requestFamily.includes("aaaaaaaaaaaaaaaa"));
    const familyB = correlated.find((c) => c.requestFamily.includes("bbbbbbbbbbbbbbbb"));
    assert.equal(familyA?.firstAttemptOk, false);
    assert.equal(familyA?.retrySucceeded, true);
    assert.deepEqual(familyA?.attempts, [1, 2]);
    assert.equal(familyB?.firstAttemptOk, true);
    assert.equal(familyB?.retrySucceeded, false);
  });

  it("does not persist prompt/body/source fields after sanitize", () => {
    clearProviderTransportEvents();
    upsertProviderTransportEvent({
      ...baseEvent(),
      prompt: "SECRET_PROMPT_TEXT",
      body: '{"messages":[{"content":"leak"}]}',
      source: "export function App() {}",
      text: "model response body",
      authorization: "Bearer sk-ant-leak",
    } as never);
    const stored = getProviderTransportEvents()[0]!;
    const json = JSON.stringify(stored);
    assert.equal(transportEventContainsSecrets(stored), false);
    assert.ok(!json.includes("SECRET_PROMPT"));
    assert.ok(!json.includes("leak"));
    assert.ok(!json.includes("export function"));
    assert.ok(!json.includes("sk-ant"));
  });

  it("isolates subscriber failures so diagnostics cannot throw into callers", () => {
    clearProviderTransportEvents();
    const unsub = subscribeProviderTransportEvents(() => {
      throw new Error("subscriber boom");
    });
    assert.doesNotThrow(() => {
      upsertProviderTransportEvent(baseEvent({ requestId: "boom-safe" }));
    });
    assert.equal(getProviderTransportEvents().some((e) => e.requestId === "boom-safe"), true);
    unsub();
  });

  it("documents production gating for test hooks", () => {
    // __studioTestHooks is only installed when isStudioTestMode() is true
    // (VITE_BRYANTLABS_E2E=1 or MODE=test). Production builds omit both.
    assert.equal(studioTestHooksAreGatedOutsideE2E(), true);
  });
});
