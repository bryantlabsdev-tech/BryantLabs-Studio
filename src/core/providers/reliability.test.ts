import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFallbackRequestV2,
  buildProviderFailure,
  classifyReliabilityFromError,
  mergeProviderHealthResults,
  redactProviderSecrets,
  isProviderInCooldown,
  clearProviderCooldown,
} from "@/core/providers/reliability";
import { parseOllamaTagNames } from "@/core/providers/ollamaModels";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { HealthResult, ProviderSettings } from "@/core/providers/types";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "anthropic",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: true,
    hasOpenRouterKey: true,
    autoFixMode: "ask",
    agentMode: "single",
    plannerProvider: "gemini",
    plannerModel: "",
    coderProvider: "ollama",
    coderModel: "",
    repairProvider: "ollama",
    repairModel: "",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...patch,
  });
}

describe("provider reliability", () => {
  it("classifies missing key", () => {
    assert.equal(
      classifyReliabilityFromError("No Gemini API key is stored. Add one in settings."),
      "missing_key",
    );
  });

  it("classifies rate limit", () => {
    assert.equal(classifyReliabilityFromError("HTTP 429 rate limit"), "rate_limited");
    assert.equal(classifyReliabilityFromError("", 429), "rate_limited");
  });

  it("classifies gemini safety and model errors", () => {
    assert.equal(
      classifyReliabilityFromError("Safety block: SAFETY"),
      "safety_blocked",
    );
    assert.equal(
      classifyReliabilityFromError("Model not found or not available", 404),
      "model_missing",
    );
  });

  it("classifies insufficient credits", () => {
    assert.equal(
      classifyReliabilityFromError("Insufficient credits on account"),
      "insufficient_credits",
    );
    assert.equal(classifyReliabilityFromError("", 402), "insufficient_credits");
  });

  it("parses Ollama /api/tags model names", () => {
    const models = parseOllamaTagNames({
      models: [{ name: "qwen2.5-coder:7b" }, { name: "llama3.2:latest" }],
    });
    assert.deepEqual(models, ["llama3.2:latest", "qwen2.5-coder:7b"]);
  });

  it("builds structured provider failure", () => {
    const failure = buildProviderFailure({
      provider: "anthropic",
      model: "claude-haiku",
      error: "HTTP 429 rate limit exceeded",
      settings: baseSettings(),
    });
    assert.equal(failure.status, "rate_limited");
    assert.equal(failure.provider, "anthropic");
    assert.equal(failure.retryable, true);
    assert.ok(failure.suggestedFallbacks.includes("gemini"));
  });

  it("offers openrouter and groq as fallbacks after gemini failure", () => {
    const failure = buildProviderFailure({
      provider: "gemini",
      model: "gemini-2.5-flash",
      error: "timed out waiting for provider",
      settings: baseSettings({
        hasOpenRouterKey: true,
        hasGroqKey: true,
      }),
    });
    assert.equal(failure.status, "timeout");
    assert.ok(failure.suggestedFallbacks.includes("openrouter"));
    assert.ok(failure.suggestedFallbacks.includes("groq"));
    assert.ok(failure.suggestedFallbacks.includes("anthropic"));
  });

  it("offers fallback options on recoverable failure", () => {
    const req = buildFallbackRequestV2({
      settings: baseSettings(),
      stage: "planner",
      failedProvider: "anthropic",
      failedModel: "claude-haiku",
      error: "rate limited",
    });
    assert.ok(req);
    assert.ok(req.options.length > 0);
    assert.equal(req.allowRetry, true);
  });

  it("sets provider cooldown on rate limit fallback request", () => {
    clearProviderCooldown("anthropic");
    buildFallbackRequestV2({
      settings: baseSettings(),
      stage: "coder",
      failedProvider: "anthropic",
      failedModel: "claude-haiku",
      error: "429 too many requests",
    });
    assert.equal(isProviderInCooldown("anthropic"), true);
    clearProviderCooldown("anthropic");
  });

  it("does not overwrite successful health with stale offline blip", () => {
    const previous: HealthResult = {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
      ok: true,
      connectionStatus: "connected",
      checks: [],
    };
    const incoming: HealthResult = {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
      ok: false,
      connectionStatus: "offline",
      checks: [],
      error: "fetch failed ECONNREFUSED",
    };
    const merged = mergeProviderHealthResults(previous, incoming);
    assert.equal(merged?.ok, true);
  });

  it("redacts API keys from log text", () => {
    const redacted = redactProviderSecrets(
      "Authorization failed sk-ant-api03-secretkey1234 x-api-key: abc123",
    );
    assert.match(redacted, /sk-ant-••••/);
    assert.doesNotMatch(redacted, /secretkey1234/);
  });
});
