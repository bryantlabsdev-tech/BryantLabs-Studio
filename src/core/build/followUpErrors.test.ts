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
});
