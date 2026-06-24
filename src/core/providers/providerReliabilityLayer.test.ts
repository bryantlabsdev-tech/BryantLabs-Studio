import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  getDegradedProviders,
  isProviderDegraded,
  recordProviderCircuitFailure,
  recordProviderCircuitSuccess,
  resetProviderCircuit,
} from "@/core/providers/circuitBreaker";
import {
  buildJsonSchemaRetryPrompt,
  extractJsonObject,
  repairJsonFromText,
  repairJsonText,
} from "@/core/providers/jsonRepair";
import {
  detectModelProviderMismatch,
  runProviderPreflight,
} from "@/core/providers/preflight";
import {
  classifyReliabilityFromError,
  isRetryableReliabilityStatus,
} from "@/core/providers/reliability";
import { checkRequestSize, trimNonessentialLogs } from "@/core/providers/requestSize";
import { resolveStageTimeoutMs } from "@/core/providers/stageTimeouts";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "anthropic/claude-sonnet-4",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: true,
    hasOpenRouterKey: true,
    autoFixMode: "ask",
    agentMode: "single",
    plannerProvider: "gemini",
    plannerModel: "",
    coderProvider: "gemini",
    coderModel: "",
    repairProvider: "gemini",
    repairModel: "",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: false,
    backupProvider: "anthropic",
    ...patch,
  });
}

describe("provider reliability layer", () => {
  beforeEach(() => {
    resetProviderCircuit();
  });

  it("blocks preflight when API key is missing", () => {
    const result = runProviderPreflight({
      settings: baseSettings({ hasGeminiKey: false }),
      stage: "planner",
      provider: "gemini",
      skipHealthCheck: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing_key");
    assert.equal(result.blocked, true);
  });

  it("blocks provider/model mismatch", () => {
    const result = runProviderPreflight({
      settings: baseSettings(),
      stage: "planner",
      provider: "anthropic",
      model: "gemini-2.5-flash",
      skipHealthCheck: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "model_mismatch");
    assert.ok(detectModelProviderMismatch("anthropic", "gemini-2.5-flash"));
  });

  it("classifies no JSON errors as retryable", () => {
    const status = classifyReliabilityFromError("No JSON Returned from model");
    assert.equal(status, "unknown_error");
    assert.equal(isRetryableReliabilityStatus(status, "No JSON Returned"), true);
  });

  it("uses stage-specific timeouts", () => {
    assert.equal(resolveStageTimeoutMs("planner"), 30_000);
    assert.equal(resolveStageTimeoutMs("coder", { patchSize: "small" }), 60_000);
    assert.equal(resolveStageTimeoutMs("coder", { patchSize: "large" }), 120_000);
    assert.equal(resolveStageTimeoutMs("repair"), 60_000);
  });

  it("repairs JSON from markdown fences", () => {
    const raw = 'Here is the plan:\n```json\n{"summary":"ok","files":[]}\n```';
    const outcome = repairJsonFromText(raw);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.match(outcome.json, /"summary"/);
    }
  });

  it("repairs trailing commas in JSON", () => {
    assert.equal(repairJsonText('{"a":1,}'), '{"a":1}');
    const extracted = extractJsonObject('noise {"b":2,} tail');
    assert.ok(extracted);
    const outcome = repairJsonFromText(extracted!);
    assert.equal(outcome.ok, true);
  });

  it("builds schema retry prompt for invalid JSON", () => {
    const prompt = buildJsonSchemaRetryPrompt(
      "Plan this",
      '{"summary":"string"}',
      "not json at all",
    );
    assert.match(prompt, /Return ONLY valid JSON/);
    assert.match(prompt, /not json at all/);
  });

  it("marks provider degraded after 3 failures in window", () => {
    recordProviderCircuitFailure("gemini");
    recordProviderCircuitFailure("gemini");
    assert.equal(isProviderDegraded("gemini"), false);
    recordProviderCircuitFailure("gemini");
    assert.equal(isProviderDegraded("gemini"), true);
    assert.ok(getDegradedProviders().includes("gemini"));
    recordProviderCircuitSuccess("gemini");
    assert.equal(isProviderDegraded("gemini"), false);
  });

  it("classifies request too large without smart retry", () => {
    const status = classifyReliabilityFromError(
      "Prompt tokens limit exceeded: 11726 > 8499",
    );
    assert.equal(status, "request_too_large");
    assert.equal(isRetryableReliabilityStatus(status), false);
  });

  it("preflight suggests non-blocked path when provider is degraded", () => {
    recordProviderCircuitFailure("gemini");
    recordProviderCircuitFailure("gemini");
    recordProviderCircuitFailure("gemini");
    const result = runProviderPreflight({
      settings: baseSettings(),
      stage: "planner",
      provider: "gemini",
      skipHealthCheck: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "provider_degraded");
    assert.equal(result.blocked, false);
  });

  it("trims nonessential logs when checking request size", () => {
    const payload = "[ui:audit]\ntype=grid\n".repeat(5000) + "real prompt content";
    const trimmed = trimNonessentialLogs(payload);
    assert.ok(trimmed.length < payload.length);
    const check = checkRequestSize("planner", trimmed);
    assert.ok(check.estimatedTokens > 0);
  });
});
