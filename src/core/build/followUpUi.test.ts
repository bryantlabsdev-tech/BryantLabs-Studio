import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFollowUpLogMessage,
  formatUserFacingBuildError,
  resolveFollowUpDisplayPhase,
  suggestFollowUpRecoveryActions,
} from "@/core/build/followUpUi";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

function log(
  stage: GreenfieldRunLogEntry["stage"],
  message: string,
  status: GreenfieldRunLogEntry["status"] = "running",
): GreenfieldRunLogEntry {
  return {
    id: "1",
    timestamp: new Date().toISOString(),
    stage,
    status,
    message,
  };
}

describe("followUpUi", () => {
  it("maps build phases to simple follow-up labels", () => {
    assert.equal(
      resolveFollowUpDisplayPhase({
        buildPhase: "planning",
        planApplyPhase: null,
        recentLogs: [],
      }),
      "thinking",
    );
    assert.equal(
      resolveFollowUpDisplayPhase({
        buildPhase: "review",
        planApplyPhase: "review",
        recentLogs: [],
      }),
      "reviewing",
    );
  });

  it("hides internal log jargon", () => {
    assert.equal(
      formatFollowUpLogMessage(log("apply_plan", "[apply_plan] proposing patches")),
      "Generating changes…",
    );
    assert.equal(
      formatFollowUpLogMessage(log("preview", "Starting preview server")),
      "Starting preview server",
    );
  });

  it("rewrites technical errors into plain English", () => {
    assert.match(
      formatUserFacingBuildError("Apply Plan produced zero valid patch proposals.", {
        provider: "gemini",
      }),
      /could not generate valid changes/i,
    );
    assert.match(
      formatUserFacingBuildError("Provider budget exceeded or run cancelled."),
      /AI call limit/i,
    );
    assert.match(
      formatUserFacingBuildError(
        "Previous app generation failed before build completed. Submit the original creation prompt again.",
      ),
      /setup did not finish/i,
    );
    assert.equal(
      formatUserFacingBuildError("No first byte received within 60 seconds"),
      "No first byte received within 60 seconds",
    );
    assert.equal(
      formatUserFacingBuildError("Total request exceeded 180 seconds"),
      "Total request exceeded 180 seconds",
    );
  });

  it("does not offer switch-provider or cheaper-model in Anthropic-only mode", () => {
    const settings = normalizeProviderSettings({
      provider: "anthropic",
      geminiModel: "gemini-2.5-pro",
      ollamaModel: "qwen2.5-coder:7b",
      ollamaBaseUrl: "http://localhost:11434",
      anthropicModel: "claude-opus-4-6",
      groqModel: "llama-3.3-70b-versatile",
      openrouterModel: "anthropic/claude-sonnet-4",
      hasGeminiKey: true,
      hasAnthropicKey: true,
      hasGroqKey: true,
      hasOpenRouterKey: true,
      autoFixMode: "ask",
      agentMode: "single",
      plannerProvider: "anthropic",
      plannerModel: "",
      coderProvider: "anthropic",
      coderModel: "",
      repairProvider: "anthropic",
      repairModel: "",
      maxAiCalls: 8,
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
    const actions = suggestFollowUpRecoveryActions(
      "No first byte received within 60 seconds",
      settings,
      "anthropic",
    );
    assert.ok(actions.some((a) => a.kind === "retry_later"));
    assert.ok(!actions.some((a) => a.kind === "switch_provider"));
    assert.ok(!actions.some((a) => a.kind === "cheaper_model"));
  });
});
