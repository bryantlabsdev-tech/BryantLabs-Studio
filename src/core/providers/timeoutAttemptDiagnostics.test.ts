import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSanitizedTimeoutAttempt,
  formatSanitizedTimeoutAttempt,
  timeoutKindFromError,
} from "@/core/providers/timeoutAttemptDiagnostics";

describe("sanitized timeout diagnostics", () => {
  it("records attempt metadata without bodies or prompts", () => {
    const record = buildSanitizedTimeoutAttempt({
      attempt: 1,
      provider: "anthropic",
      model: "claude-opus-4-6",
      elapsedMs: 60_012,
      error: "No first byte received within 60 seconds",
      payloadByteLength: 18432,
      payloadSha256: "abc123def",
      httpStatus: null,
      providerRequestId: null,
      responseByteLength: 0,
    });
    assert.equal(record.timeoutKind, "first_byte");
    const text = formatSanitizedTimeoutAttempt(record);
    assert.match(text, /attempt=1/);
    assert.match(text, /timeoutKind=first_byte/);
    assert.match(text, /payloadBytes=18432/);
    assert.doesNotMatch(text, /sk-ant/);
    assert.doesNotMatch(text, /@@FILE/);
    assert.equal(timeoutKindFromError("Total request exceeded 180 seconds"), "total");
  });
});
