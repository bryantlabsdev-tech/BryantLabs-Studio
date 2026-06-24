import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatProviderErrorLog,
  globalProviderSelectionPatch,
} from "@/core/providers/providerDiagnostics";
import { buildSuggestedFallbacks } from "@/core/providers/reliability";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.5-pro",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-20250514",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    autoFixMode: "ask",
    agentMode: "pipeline",
    plannerProvider: "gemini",
    coderProvider: "gemini",
    repairProvider: "gemini",
    plannerModel: "",
    coderModel: "",
    repairModel: "",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...patch,
  });
}

describe("provider diagnostics", () => {
  it("global provider patch syncs all stages", () => {
    const patch = globalProviderSelectionPatch("anthropic", "claude-sonnet-4-20250514");
    assert.equal(patch.provider, "anthropic");
    assert.equal(patch.plannerProvider, "anthropic");
    assert.equal(patch.coderProvider, "anthropic");
    assert.equal(patch.repairProvider, "anthropic");
    assert.equal(patch.anthropicModel, "claude-sonnet-4-20250514");
  });

  it("formats structured provider error logs", () => {
    const line = formatProviderErrorLog({
      stage: "planner",
      provider: "gemini",
      model: "gemini-2.5-pro",
      httpStatus: 429,
      sdkMessage: "Quota exceeded for quota metric",
      responseBody: '{"error":{"message":"Quota exceeded"}}',
      apiKeyPresent: true,
      durationMs: 1500,
      settings: baseSettings(),
    });
    assert.match(line, /\[provider:error\]/);
    assert.match(line, /status=429/);
    assert.match(line, /reason=rate_limited/);
    assert.match(line, /apiKeyPresent=true/);
    assert.match(line, /durationMs=1500/);
  });

  it("prefers configured backup provider in fallback order", () => {
    const fallbacks = buildSuggestedFallbacks(
      "gemini",
      baseSettings({ backupProvider: "groq", hasGroqKey: true }),
    );
    assert.equal(fallbacks[0], "groq");
  });
});
