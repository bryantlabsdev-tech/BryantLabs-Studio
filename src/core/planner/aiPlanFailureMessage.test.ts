import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import {
  formatAiPlanPlannerDiagnostics,
  formatFollowUpPlannerFailureMessage,
  usedDeterministicPlanFallback,
} from "@/core/planner/aiPlanFailureMessage";

describe("aiPlanFailureMessage", () => {
  it("maps no_json parse failures to a specific follow-up message", () => {
    const message = formatFollowUpPlannerFailureMessage({
      aiPlan: {
        ok: false,
        provider: "gemini",
        model: "gemini-2.5-pro",
        raw: null,
        latencyMs: 1000,
        parseFailReason: "no_json",
        parseError: "No JSON object found in model output.",
      },
    });

    assert.equal(message, "Provider returned no JSON plan.");
  });

  it("includes planner diagnostics and fallback status", () => {
    const failed: AIPlanResult = {
      ok: false,
      provider: "gemini",
      model: "gemini-2.5-pro",
      raw: null,
      rawText: "Here is my answer without JSON",
      latencyMs: 1000,
      parseFailReason: "no_json",
      parseError: "No JSON object found in model output.",
    };

    const diagnostics = formatAiPlanPlannerDiagnostics(failed);
    assert.match(diagnostics, /parseFailReason: no_json/);
    assert.match(diagnostics, /parseError: No JSON object found/);
    assert.match(diagnostics, /rawResponsePreview: Here is my answer without JSON/);
    assert.match(diagnostics, /responseLength: 30/);
    assert.match(diagnostics, /repairAttempted: false/);
    assert.match(diagnostics, /deterministicFallback: not used/);
  });

  it("includes provider diagnostics when present on failed plan", () => {
    const failed: AIPlanResult = {
      ok: false,
      provider: "gemini",
      model: "gemini-2.5-pro",
      raw: null,
      latencyMs: 1000,
      parseFailReason: "empty_response",
      error: "Gemini returned an empty response.",
      providerDiagnostics: {
        responseLength: 0,
        candidateCount: 0,
        finishReason: null,
        safetyBlocked: false,
        repairAttempted: false,
        repairSucceeded: false,
        rawResponsePreview: null,
        providerMetadata: '{"candidateCount":0}',
        repairSkippedReason: "gemini_empty_response (json repair skipped)",
        providerHttpStatus: 200,
        providerRequestId: "req-123",
        providerLatency: 842,
        providerModel: "gemini-2.5-pro",
        providerEndpoint:
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=***",
        generateMethod: "generateContent",
        requestPayloadBytes: 12000,
        maxOutputTokens: 1024,
        thoughtsTokenCount: 1024,
        candidatesTokenCount: 0,
        tokenStarvationLikely: true,
        tokenBudgetHint:
          "Gemini may have exhausted output tokens during reasoning. Consider increasing planner max output tokens.",
        usageMetadata: '{"totalTokenCount":1024,"thoughtsTokenCount":1024}',
        responseHeaders: '{"x-goog-request-id":"req-123"}',
        rawGeminiResponse: '{"candidates":[]}',
      },
    };
    const diagnostics = formatAiPlanPlannerDiagnostics(failed);
    assert.match(diagnostics, /parseFailReason: empty_response/);
    assert.match(diagnostics, /candidateCount: 0/);
    assert.match(diagnostics, /providerHttpStatus: 200/);
    assert.match(diagnostics, /maxOutputTokens: 1024/);
    assert.match(diagnostics, /thoughtsTokenCount: 1024/);
    assert.match(diagnostics, /tokenStarvationLikely: true/);
    assert.match(diagnostics, /tokenBudgetHint:/);
    assert.match(diagnostics, /rawGeminiResponse:/);
    assert.match(diagnostics, /repairSkippedReason: gemini_empty_response/);
  });

  it("maps empty_response failures to the dedicated message", () => {
    const message = formatFollowUpPlannerFailureMessage({
      aiPlan: {
        ok: false,
        provider: "gemini",
        model: "gemini-2.5-pro",
        raw: null,
        latencyMs: 1000,
        parseFailReason: "empty_response",
        error: "Gemini returned an empty response. Retry with a different model or switch provider.",
      },
    });
    assert.match(message, /Gemini returned an empty response/);
  });

  it("detects deterministic fallback plans", () => {
    const fallback: AIPlanResult = {
      ok: true,
      provider: "gemini",
      model: "gemini-2.5-pro",
      raw: { source: "deterministic_fallback" },
      latencyMs: 1000,
      plan: {
        summary: "UI fix",
        files: [{ path: "src/App.tsx", reason: "entry" }],
        reasoning: "fallback",
        risks: [],
        confidence: "Medium",
      },
    };

    assert.equal(usedDeterministicPlanFallback(fallback), true);
    assert.match(formatAiPlanPlannerDiagnostics(fallback), /deterministicFallback: used/);
  });

  it("maps provider_not_connected preflight gate to composite failure message", () => {
    const message = formatFollowUpPlannerFailureMessage({
      aiPlan: {
        ok: false,
        provider: "gemini",
        model: "gemini-2.5-flash",
        raw: {
          preflightGate: "provider_not_connected",
          preflight: {
            gate: "provider_not_connected",
            providerCallAttempted: false,
            providerBlockedReason: "No gemini API key is stored. Add one in settings.",
            skipReason: "No gemini API key is stored. Add one in settings.",
            route: "edit_follow_up",
            editableFilesCount: 2,
            targetFilesCount: 2,
            fallbackEligible: true,
            fallbackAttempted: true,
            fallbackUsed: true,
            fallbackNotUsedReason: null,
            promptClassification: "ui_audit_fix",
            message: "No gemini API key is stored. Add one in settings.",
          },
        },
        latencyMs: 0,
        error: "No gemini API key is stored. Add one in settings.",
      },
      planFileCount: 2,
    });
    assert.match(message, /Planner stopped before provider response:/);
    assert.match(message, /Fallback used:/);
    assert.match(message, /API key|not connected/i);
  });
});
