import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestStrongerModelStep } from "./modelEscalation.ts";
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
});
