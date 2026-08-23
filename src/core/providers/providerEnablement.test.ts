import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceSettingsToEnabledProviders,
  formatProviderEnablementRoutingLog,
  isProviderEnabled,
  listDisabledProviders,
  listEnabledProviders,
} from "@/core/providers/providerEnablement";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import { buildSuggestedFallbacks } from "@/core/providers/reliability";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(
  patch: Partial<ProviderSettings> = {},
): ProviderSettings {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-20250514",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: true,
    hasOpenRouterKey: true,
    autoFixMode: "ask",
    agentMode: "pipeline",
    plannerProvider: "openrouter",
    coderProvider: "groq",
    repairProvider: "gemini",
    plannerModel: "",
    coderModel: "",
    repairModel: "",
    maxAiCalls: 8,
    maxRepairAttempts: 3,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    providerEnabled: {
      gemini: true,
      anthropic: true,
      openrouter: false,
      groq: false,
      ollama: true,
    },
    ...patch,
  });
}

describe("providerEnablement", () => {
  it("lists enabled and disabled providers", () => {
    const settings = baseSettings();
    assert.deepEqual(listEnabledProviders(settings), [
      "gemini",
      "anthropic",
      "ollama",
    ]);
    assert.deepEqual(listDisabledProviders(settings), ["openrouter", "groq"]);
  });

  it("coerces disabled stage providers to the highest-priority enabled provider", () => {
    const settings = baseSettings();
    assert.equal(settings.plannerProvider, "gemini");
    assert.equal(settings.coderProvider, "gemini");
    assert.equal(settings.repairProvider, "gemini");
  });

  it("reports enablement switches when a disabled provider is still selected", () => {
    const raw = {
      ...baseSettings(),
      plannerProvider: "openrouter" as const,
      coderProvider: "groq" as const,
    };
    const { switches } = coerceSettingsToEnabledProviders(raw);
    assert.ok(switches.length >= 2);
  });

  it("excludes disabled providers from fallback chains", () => {
    const settings = baseSettings({ backupProvider: "groq" });
    const fallbacks = buildSuggestedFallbacks("gemini", settings);
    assert.ok(!fallbacks.includes("openrouter"));
    assert.ok(!fallbacks.includes("groq"));
    assert.ok(fallbacks.includes("anthropic"));
  });

  it("formats routing log with enabled and disabled markers", () => {
    const line = formatProviderEnablementRoutingLog(baseSettings());
    assert.match(line, /✓ Gemini/);
    assert.match(line, /✕ OpenRouter/);
    assert.match(line, /✕ Groq/);
  });

  it("clears incompatible stage models when remapping a disabled provider", () => {
    const settings = normalizeProviderSettings({
      provider: "openrouter",
      geminiModel: "gemini-2.5-flash",
      ollamaModel: "qwen2.5-coder:7b",
      ollamaBaseUrl: "http://localhost:11434",
      anthropicModel: "claude-opus-4-6",
      groqModel: "llama-3.3-70b-versatile",
      openrouterModel: "anthropic/claude-sonnet-4",
      hasGeminiKey: false,
      hasAnthropicKey: true,
      hasGroqKey: false,
      hasOpenRouterKey: true,
      autoFixMode: "ask",
      agentMode: "single",
      plannerProvider: "openrouter",
      plannerModel: "qwen2.5-coder:7b",
      coderProvider: "openrouter",
      coderModel: "qwen2.5-coder:7b",
      repairProvider: "openrouter",
      repairModel: "qwen2.5-coder:7b",
      maxAiCalls: 3,
      maxRepairAttempts: 1,
      stopOnProviderLimit: true,
      askBeforeFallback: true,
      providerEnabled: {
        gemini: false,
        anthropic: true,
        openrouter: false,
        groq: false,
        ollama: false,
      },
    });
    assert.equal(settings.provider, "anthropic");
    assert.equal(settings.coderProvider, "anthropic");
    assert.equal(settings.coderModel, "");
    assert.equal(settings.plannerModel, "");
  });

  it("defaults missing providerEnabled entries to enabled", () => {
    const settings = normalizeProviderSettings({
      provider: "gemini",
      geminiModel: "gemini-2.5-flash",
      ollamaModel: "llama3.2",
      ollamaBaseUrl: "http://localhost:11434",
      anthropicModel: "",
      groqModel: "",
      openrouterModel: "",
      hasGeminiKey: true,
      hasAnthropicKey: false,
      hasGroqKey: false,
      hasOpenRouterKey: false,
      autoFixMode: "ask",
      agentMode: "single",
      plannerProvider: "gemini",
      plannerModel: "",
      coderProvider: "gemini",
      coderModel: "",
      repairProvider: "gemini",
      repairModel: "",
      maxAiCalls: 8,
      maxRepairAttempts: 3,
      stopOnProviderLimit: true,
      askBeforeFallback: true,
    });
    assert.equal(isProviderEnabled(settings, "groq"), true);
  });
});
