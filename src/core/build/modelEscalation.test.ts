import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestStrongerModelStep } from "./modelEscalation.ts";
import { nextAutoEscalationStep } from "./providerAutoEscalation.ts";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";

function testSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-20250514",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: true,
    hasOpenRouterKey: false,
    autoFixMode: "ask",
    agentMode: "single",
    plannerProvider: "gemini",
    plannerModel: "gemini-2.5-flash",
    coderProvider: "gemini",
    coderModel: "gemini-2.5-flash",
    repairProvider: "gemini",
    repairModel: "gemini-2.5-flash",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...patch,
  });
}

describe("modelEscalation", () => {
  it("escalates Gemini Flash to Gemini Pro", () => {
    const settings = testSettings();
    const step = suggestStrongerModelStep("gemini", "gemini-2.5-flash", settings);
    assert.ok(step);
    assert.equal(step!.model, "gemini-2.5-pro");
  });

  it("does not auto-escalate to a disabled provider", () => {
    const settings = testSettings({
      hasOpenRouterKey: true,
      providerEnabled: {
        gemini: false,
        anthropic: true,
        openrouter: false,
        groq: false,
        ollama: false,
      },
    });
    const step = suggestStrongerModelStep(
      "anthropic",
      "claude-opus-4-6",
      settings,
    );
    assert.equal(step, null);
  });

  it("does not auto-escalate Anthropic onto OpenRouter even when OpenRouter is enabled", () => {
    const settings = testSettings({
      hasOpenRouterKey: true,
      askBeforeFallback: false,
      providerEnabled: {
        gemini: true,
        anthropic: true,
        openrouter: true,
        groq: true,
        ollama: true,
      },
    });
    const step = suggestStrongerModelStep(
      "anthropic",
      "claude-opus-4-6",
      settings,
    );
    assert.equal(step, null);
    assert.equal(
      nextAutoEscalationStep("anthropic", "claude-opus-4-6", settings),
      null,
    );
  });
});

describe("provider auto-escalation", () => {
  it("does not auto-switch providers when askBeforeFallback is enabled", () => {
    const settings = testSettings({
      hasOpenRouterKey: true,
      askBeforeFallback: true,
      providerEnabled: {
        gemini: true,
        anthropic: true,
        openrouter: true,
        groq: true,
        ollama: true,
      },
    });
    const step = nextAutoEscalationStep(
      "anthropic",
      "claude-opus-4-6",
      settings,
    );
    assert.equal(step, null);
  });
});
