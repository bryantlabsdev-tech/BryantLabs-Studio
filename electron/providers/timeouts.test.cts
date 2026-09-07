import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyFetchTimeoutKind,
  firstByteTimeoutMessage,
  formatProviderTimeoutError,
  PROVIDER_FIRST_BYTE_TIMEOUT_MS,
  shouldRetryIdenticalHttpOnTransportError,
  totalTimeoutMessage,
} from "./timeouts.cjs";

describe("provider timeout messages", () => {
  it("reports first-byte timeout without mentioning 180 seconds", () => {
    const err = new Error("The operation was aborted due to first-byte timeout after 60000ms");
    err.name = "AbortError";
    const message = formatProviderTimeoutError("patch", 180_000, err);
    assert.equal(message, "No first byte received within 60 seconds");
    assert.doesNotMatch(message, /180/);
    assert.equal(classifyFetchTimeoutKind(err), "first_byte");
    assert.equal(firstByteTimeoutMessage(PROVIDER_FIRST_BYTE_TIMEOUT_MS), message);
  });

  it("reports total timeout with the configured budget", () => {
    const err = new Error("The operation was aborted due to total timeout after 180000ms");
    err.name = "AbortError";
    const message = formatProviderTimeoutError("patch", 180_000, err);
    assert.equal(message, "Total request exceeded 180 seconds");
    assert.equal(classifyFetchTimeoutKind(err), "total");
    assert.equal(totalTimeoutMessage(180_000), message);
  });

  it("does not retry identical HTTP after a first-byte timeout", () => {
    const err = new Error("The operation was aborted due to first-byte timeout after 60000ms");
    err.name = "AbortError";
    assert.equal(shouldRetryIdenticalHttpOnTransportError(err), false);
  });

  it("does not retry identical HTTP after a total timeout", () => {
    const err = new Error("The operation was aborted due to total timeout after 180000ms");
    err.name = "AbortError";
    assert.equal(shouldRetryIdenticalHttpOnTransportError(err), false);
  });

  it("retries identical HTTP only for truncated JSON bodies", () => {
    const err = new Error("request body is not valid JSON");
    assert.equal(shouldRetryIdenticalHttpOnTransportError(err), true);
  });
});
