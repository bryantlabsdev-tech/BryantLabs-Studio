import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractGeminiResponseMeta,
  extractProviderResponseMeta,
} from "./responseMeta.cjs";
import {
  buildAIPlanProviderDiagnostics,
  resolveRepairSkippedReason,
} from "./planProviderDiagnostics.cjs";
import { buildGeminiTransportDiagnostics } from "./geminiDiagnostics.cjs";

describe("extractGeminiResponseMeta", () => {
  it("detects empty response with zero candidates", () => {
    const meta = extractGeminiResponseMeta({ candidates: [] }, "");
    assert.equal(meta.responseLength, 0);
    assert.equal(meta.candidateCount, 0);
    assert.equal(meta.finishReason, null);
    assert.equal(meta.safetyBlocked, false);
  });

  it("detects safety finish reason", () => {
    const meta = extractGeminiResponseMeta(
      { candidates: [{ finishReason: "SAFETY" }] },
      "",
    );
    assert.equal(meta.candidateCount, 1);
    assert.equal(meta.finishReason, "SAFETY");
    assert.equal(meta.safetyBlocked, true);
  });

  it("detects prompt feedback block", () => {
    const meta = extractGeminiResponseMeta(
      { promptFeedback: { blockReason: "SAFETY" }, candidates: [] },
      "",
    );
    assert.equal(meta.safetyBlocked, true);
    assert.equal(meta.promptBlockReason, "SAFETY");
  });
});

describe("resolveRepairSkippedReason", () => {
  it("explains repair skip when provider request failed", () => {
    const reason = resolveRepairSkippedReason({
      providerOk: false,
      providerError: "Safety block: SAFETY",
      repairAttempted: false,
    });
    assert.match(reason ?? "", /provider_request_failed/);
  });

  it("explains repair skip for gemini empty response", () => {
    const reason = resolveRepairSkippedReason({
      providerOk: false,
      providerErrorCode: "gemini_empty_response",
      repairAttempted: false,
    });
    assert.match(reason ?? "", /gemini_empty_response/);
  });

  it("returns null when repair was attempted", () => {
    assert.equal(
      resolveRepairSkippedReason({ providerOk: true, repairAttempted: true }),
      null,
    );
  });
});

describe("buildAIPlanProviderDiagnostics", () => {
  it("maps gemini meta into planner diagnostics", () => {
    const meta = extractProviderResponseMeta(
      "gemini",
      {
        candidates: [{ finishReason: "STOP" }],
        usageMetadata: { totalTokenCount: 12, thoughtsTokenCount: 4, candidatesTokenCount: 8 },
      },
      '{"summary":"x"}',
      buildGeminiTransportDiagnostics({
        model: "gemini-2.5-pro",
        httpStatus: 200,
        latencyMs: 10,
        headers: {},
        json: {
          candidates: [{ finishReason: "STOP" }],
          usageMetadata: { totalTokenCount: 12, thoughtsTokenCount: 4, candidatesTokenCount: 8 },
        },
        requestPayloadBytes: 100,
        maxOutputTokens: 8192,
      }),
    );
    const diag = buildAIPlanProviderDiagnostics(
      {
        ok: true,
        provider: "gemini",
        model: "gemini-2.0-flash",
        text: '{"summary":"x"}',
        raw: {},
        latencyMs: 10,
        meta,
      },
      {
        parse_fail_reason: "no_json",
        truncation_detected: false,
        retry_success: false,
        retried: false,
        repair_attempted: false,
        repair_success: false,
      },
      "no_json",
    );
    assert.equal(diag.responseLength, 15);
    assert.equal(diag.candidateCount, 1);
    assert.equal(diag.finishReason, "STOP");
    assert.equal(diag.maxOutputTokens, 8192);
    assert.equal(diag.thoughtsTokenCount, 4);
    assert.match(diag.providerMetadata ?? "", /totalTokenCount/);
  });

  it("flags token starvation for empty gemini response with high thoughts usage", () => {
    const meta = extractProviderResponseMeta(
      "gemini",
      {
        candidates: [],
        usageMetadata: { thoughtsTokenCount: 1024, candidatesTokenCount: 0, totalTokenCount: 1024 },
      },
      "",
      buildGeminiTransportDiagnostics({
        model: "gemini-2.5-pro",
        httpStatus: 200,
        latencyMs: 50,
        headers: {},
        json: {
          candidates: [],
          usageMetadata: { thoughtsTokenCount: 1024, candidatesTokenCount: 0, totalTokenCount: 1024 },
        },
        requestPayloadBytes: 5000,
        maxOutputTokens: 1024,
      }),
    );
    const diag = buildAIPlanProviderDiagnostics(
      {
        ok: false,
        provider: "gemini",
        model: "gemini-2.5-pro",
        text: "",
        raw: {},
        latencyMs: 50,
        meta,
        errorCode: "gemini_empty_response",
      },
      {
        parse_fail_reason: "empty_response",
        truncation_detected: false,
        retry_success: false,
        retried: false,
        repair_attempted: false,
        repair_success: false,
      },
      "empty_response",
    );
    assert.equal(diag.maxOutputTokens, 1024);
    assert.equal(diag.thoughtsTokenCount, 1024);
    assert.equal(diag.tokenStarvationLikely, true);
    assert.match(diag.tokenBudgetHint ?? "", /exhausted output tokens/i);
  });
});
