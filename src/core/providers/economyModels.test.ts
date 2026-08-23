import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSkipAiPlannerCall,
  economyModelForProvider,
  economyModelForStage,
  ECONOMY_ANTHROPIC_MODEL,
  isEconomyMode,
} from "@/core/providers/economyModels";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "anthropic",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-opus-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: true,
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

describe("economyModels", () => {
  it("detects economy mode", () => {
    assert.equal(isEconomyMode(baseSettings()), false);
    assert.equal(isEconomyMode(baseSettings({ costMode: "economy" })), true);
  });

  it("maps anthropic economy coder model to Haiku", () => {
    const settings = baseSettings({ costMode: "economy" });
    assert.equal(
      economyModelForProvider("anthropic", settings),
      ECONOMY_ANTHROPIC_MODEL,
    );
  });

  it("respects explicit pipeline coder model override", () => {
    const settings = baseSettings({
      costMode: "economy",
      agentMode: "pipeline",
      coderModel: "claude-opus-4-6",
    });
    assert.equal(economyModelForStage(settings, "coder", "anthropic"), null);
  });

  it("skips planner in economy for small feature follow-ups with targets", () => {
    const settings = baseSettings({ costMode: "economy" });
    assert.equal(
      canSkipAiPlannerCall({
        settings,
        userPrompt: "add a settings menu",
        plan: {
          prompt: "add a settings menu",
          intent: "feature",
          summary: "Add settings",
          files: [
            {
              path: "src/App.tsx",
              absPath: "/tmp/src/App.tsx",
              score: 1,
              reasons: ["UI"],
            },
            {
              path: "src/index.css",
              absPath: "/tmp/src/index.css",
              score: 1,
              reasons: ["Styles"],
            },
          ],
          proposedChanges: [],
          confidence: "High",
          impact: "Low",
          createdAt: Date.now(),
        },
        route: "edit_follow_up",
        complexityTier: "feature_addition",
      }),
      true,
    );
  });

  it("does not skip planner in economy for architecture-tier prompts", () => {
    const settings = baseSettings({ costMode: "economy" });
    assert.equal(
      canSkipAiPlannerCall({
        settings,
        userPrompt: "rewrite entire app architecture",
        plan: {
          prompt: "rewrite entire app architecture",
          intent: "architecture",
          summary: "Rewrite",
          files: [
            {
              path: "src/App.tsx",
              absPath: "/tmp/src/App.tsx",
              score: 1,
              reasons: ["Core"],
            },
          ],
          proposedChanges: [],
          confidence: "High",
          impact: "High",
          createdAt: Date.now(),
        },
        route: "edit_follow_up",
        complexityTier: "architecture",
      }),
      false,
    );
  });
});
