import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProviderStatusSnapshot } from "@/core/providers/providerStatus";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(
  patch: Partial<ProviderSettings> = {},
): ProviderSettings {
  return {
    provider: "ollama",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: false,
    hasAnthropicKey: false,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    autoFixMode: "ask",
    agentMode: "single",
    plannerProvider: "ollama",
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
  };
}

describe("buildProviderStatusSnapshot", () => {
  it("shows green online pill with model", () => {
    const snap = buildProviderStatusSnapshot({
      settings: baseSettings(),
      health: {
        ok: true,
        provider: "ollama",
        model: "qwen2.5-coder:7b",
        checks: [],
        connectionStatus: "connected",
      },
    });
    assert.equal(snap.tone, "green");
    assert.equal(snap.pillText, "Single · Ollama · qwen2.5-coder:7b");
  });

  it("shows yellow missing API key for Anthropic", () => {
    const snap = buildProviderStatusSnapshot({
      settings: baseSettings({
        provider: "anthropic",
        hasAnthropicKey: false,
      }),
      health: null,
    });
    assert.equal(snap.tone, "yellow");
    assert.match(snap.pillText, /Missing Key/);
  });

  it("shows red offline for failed Ollama health", () => {
    const snap = buildProviderStatusSnapshot({
      settings: baseSettings(),
      health: {
        ok: false,
        provider: "ollama",
        model: "qwen2.5-coder:7b",
        checks: [],
        connectionStatus: "offline",
        error: "Ollama server is unreachable.",
      },
    });
    assert.equal(snap.tone, "red");
    assert.match(snap.pillText, /Offline/);
  });
});
