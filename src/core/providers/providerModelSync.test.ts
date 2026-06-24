import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  complexitySettingsPatch,
  resolveComplexityRouting,
} from "@/core/intelligence/complexityRouting";
import {
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";

const FLASH = "gemini-2.5-flash";
const PRO = "gemini-2.5-pro";

function flashGeminiSettings(
  patch: Partial<ProviderSettings> = {},
): ProviderSettings {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: FLASH,
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-20250514",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "anthropic/claude-sonnet-4",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    autoFixMode: "ask",
    agentMode: "pipeline",
    plannerProvider: "gemini",
    plannerModel: "",
    coderProvider: "gemini",
    coderModel: "",
    repairProvider: "gemini",
    repairModel: "",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...patch,
  });
}

describe("provider model sync", () => {
  it("uses gemini-2.5-flash from settings for all pipeline stages", () => {
    const settings = flashGeminiSettings();
    for (const stage of ["planner", "coder", "repair"] as const) {
      const routing = resolveStageRouting(settings, stage);
      assert.equal(routing?.model, FLASH, `${stage} should use settings model`);
      assert.notEqual(routing?.model, PRO);
    }
  });

  it("uses gemini-2.5-flash from settings in single-agent mode", () => {
    const settings = flashGeminiSettings({ agentMode: "single" });
    for (const stage of ["planner", "coder", "repair"] as const) {
      const routing = resolveStageRouting(settings, stage);
      assert.equal(routing?.model, FLASH);
      assert.notEqual(routing?.model, PRO);
    }
  });

  it("complexity routing does not override flash with pro", () => {
    const settings = flashGeminiSettings({ agentMode: "single" });
    const decision = resolveComplexityRouting({
      prompt: "Add timer and difficulty levels to the Sudoku app",
      fileCount: 12,
      featureInventory: null,
      settings,
    });
    assert.equal(decision.model, FLASH);
    assert.notEqual(decision.model, PRO);
  });

  it("complexity settings patch is empty (settings remain source of truth)", () => {
    const patch = complexitySettingsPatch({
      score: 30,
      tier: "feature_addition",
      provider: "gemini",
      model: PRO,
      reason: "test",
    });
    assert.deepEqual(patch, {});
  });
});
