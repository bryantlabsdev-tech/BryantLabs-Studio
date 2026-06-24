import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AiCallTracker,
  classifyProviderError,
  formatAiCallLogDetails,
} from "@/core/providers/costControls";
import {
  estimateAiCalls,
  formatPipelinePillText,
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "ollama",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-20250514",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    autoFixMode: "ask",
    agentMode: "single",
    plannerProvider: "gemini",
    plannerModel: "gemini-2.5-flash",
    coderProvider: "ollama",
    coderModel: "qwen2.5-coder:7b",
    repairProvider: "ollama",
    repairModel: "qwen2.5-coder:7b",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...patch,
  });
}

describe("provider orchestration", () => {
  it("single agent mode uses global provider for all stages", () => {
    const settings = baseSettings({ provider: "anthropic", agentMode: "single" });
    const routing = resolveStageRouting(settings, "coder");
    assert.equal(routing?.provider, "anthropic");
    assert.equal(routing?.model, "claude-sonnet-4-20250514");
  });

  it("pipeline mode routes stages independently", () => {
    const settings = baseSettings({ agentMode: "pipeline" });
    assert.equal(resolveStageRouting(settings, "planner")?.provider, "gemini");
    assert.equal(resolveStageRouting(settings, "coder")?.provider, "ollama");
    assert.equal(resolveStageRouting(settings, "repair")?.provider, "ollama");
    assert.equal(resolveStageRouting(settings, "verifier")?.model, "local");
  });

  it("pipeline mode routes groq and openrouter stages", () => {
    const settings = baseSettings({
      agentMode: "pipeline",
      coderProvider: "openrouter",
      coderModel: "anthropic/claude-3.5-sonnet",
      repairProvider: "groq",
      repairModel: "llama-3.1-8b-instant",
    });
    assert.equal(resolveStageRouting(settings, "coder")?.provider, "openrouter");
    assert.equal(
      resolveStageRouting(settings, "coder")?.model,
      "anthropic/claude-3.5-sonnet",
    );
    assert.equal(resolveStageRouting(settings, "repair")?.provider, "groq");
    assert.equal(
      resolveStageRouting(settings, "repair")?.model,
      "llama-3.1-8b-instant",
    );
  });

  it("formats pipeline pill text", () => {
    const text = formatPipelinePillText(baseSettings({ agentMode: "pipeline" }));
    assert.match(text, /Planner Gemini/);
    assert.match(text, /Coder Ollama/);
    assert.match(text, /Repair Ollama/);
  });

  it("tracks AI call budget", () => {
    const tracker = new AiCallTracker();
    const settings = baseSettings({ maxAiCalls: 2 });
    assert.equal(tracker.canMakeCall(settings).ok, true);
    tracker.recordCall();
    tracker.recordCall();
    const blocked = tracker.canMakeCall(settings);
    assert.equal(blocked.ok, false);
  });

  it("classifies recoverable provider errors", () => {
    assert.equal(classifyProviderError("HTTP 429 rate limit"), "rate_limited");
    assert.equal(classifyProviderError("Insufficient credits"), "insufficient_credits");
    assert.equal(classifyProviderError("Invalid API key"), "invalid_key");
    assert.equal(classifyProviderError("ECONNREFUSED"), "offline");
  });

  it("estimates apply plan calls from file count", () => {
    const settings = baseSettings();
    assert.equal(estimateAiCalls(settings, "ai_plan"), 1);
    assert.equal(estimateAiCalls(settings, "apply_plan", { fileCount: 5 }), 3);
  });

  it("formats AI call log details", () => {
    const line = formatAiCallLogDetails({
      stage: "planner",
      provider: "gemini",
      model: "gemini-2.5-flash",
      estimatedTokens: 1024,
      durationMs: 1200,
      ok: true,
    });
    assert.match(line, /stage=planner/);
    assert.match(line, /success/);
  });
});
