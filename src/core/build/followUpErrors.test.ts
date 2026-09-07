import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INCOMPLETE_GREENFIELD_EDIT_BLOCK_MESSAGE } from "@/core/agent/greenfieldRecoveryRouting";
import { collectFollowUpError, suggestFollowUpRecoveryV2 } from "./followUpErrors.ts";
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

describe("followUpErrors", () => {
  it("collects unified error from planApplyError", () => {
    const err = collectFollowUpError({
      buildError: null,
      planApplyError: "Apply Plan produced zero valid patch proposals.",
      pipelineError: null,
      failureReport: null,
      provider: "gemini",
    });
    assert.ok(err);
    assert.match(err!.headline, /No valid patch proposal/i);
  });

  it("offers stronger model on timeout", () => {
    const actions = suggestFollowUpRecoveryV2(
      "Gemini timed out while generating changes",
      testSettings(),
      "gemini",
    );
    assert.ok(actions.some((a) => a.kind === "stronger_model"));
  });

  it("offers greenfield recovery for incomplete scaffold block", () => {
    const actions = suggestFollowUpRecoveryV2(
      INCOMPLETE_GREENFIELD_EDIT_BLOCK_MESSAGE,
      testSettings(),
      "gemini",
      { originalGreenfieldPrompt: "Build a calculator app with history" },
    );
    assert.ok(actions.some((a) => a.kind === "greenfield_recovery"));
    assert.equal(
      actions.find((a) => a.kind === "greenfield_recovery")?.prompt,
      "Build a calculator app with history",
    );
    assert.ok(!actions.some((a) => a.kind === "retry"));
  });

  it("offers Retry Later and no switch-provider when only Anthropic is enabled", () => {
    const settings = testSettings({
      provider: "anthropic",
      hasGeminiKey: true,
      hasGroqKey: true,
      hasOpenRouterKey: true,
      providerEnabled: {
        gemini: false,
        anthropic: true,
        openrouter: false,
        groq: false,
        ollama: false,
      },
    });
    const actions = suggestFollowUpRecoveryV2(
      "No first byte received within 60 seconds",
      settings,
      "anthropic",
    );
    assert.ok(actions.some((a) => a.kind === "retry_later"));
    assert.ok(!actions.some((a) => a.kind === "switch_provider"));
  });

  it("keeps first-byte timeout text in the headline", () => {
    const err = collectFollowUpError({
      buildError: null,
      planApplyError: "Apply Plan produced zero valid patch proposals.",
      pipelineError: null,
      failureReport: {
        rootStage: "patch_propose",
        rootCauseLine: "No first byte received within 60 seconds",
        stages: [],
      },
      provider: "anthropic",
      model: "claude-opus-4-6",
    });
    assert.equal(err?.headline, "No first byte received within 60 seconds");
  });
});
