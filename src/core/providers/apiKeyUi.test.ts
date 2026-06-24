import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  apiKeySavedIndicator,
  providerConnectionTestLabel,
  providerConnectionTestTone,
} from "@/core/providers/apiKeyUi";
import type { HealthResult, ProviderSettings } from "@/core/providers/types";
import { normalizeProviderSettings } from "@/core/providers/orchestration";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "anthropic",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: false,
    hasAnthropicKey: true,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    autoFixMode: "ask",
    agentMode: "single",
    plannerProvider: "anthropic",
    plannerModel: "",
    coderProvider: "anthropic",
    coderModel: "",
    repairProvider: "anthropic",
    repairModel: "",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...patch,
  });
}

describe("apiKeyUi", () => {
  it("shows saved and missing indicators", () => {
    assert.deepEqual(apiKeySavedIndicator(baseSettings(), "anthropic"), {
      saved: true,
      label: "✓ API Key Saved",
    });
    assert.deepEqual(
      apiKeySavedIndicator(baseSettings({ hasAnthropicKey: false }), "anthropic"),
      { saved: false, label: "⚠ API Key Missing" },
    );
  });

  it("maps health results to connection test labels", () => {
    const ok: HealthResult = {
      ok: true,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      checks: [],
      connectionStatus: "connected",
    };
    assert.equal(
      providerConnectionTestLabel("anthropic", baseSettings(), ok, "done"),
      "✓ Connected",
    );
    assert.equal(providerConnectionTestLabel("anthropic", baseSettings(), null, "error"), "✗ Network Error");
    assert.equal(providerConnectionTestTone(ok, "done"), "pass");
  });
});
