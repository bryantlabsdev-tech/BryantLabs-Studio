import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyFinishStudioRunPatch,
  PROVIDER_HEALTH_ACTIONS,
  providersForHealthCheck,
} from "@/app/orchestration/studioActionGuards";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    anthropicModel: "claude-sonnet-4-20250514",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
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
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...overrides,
  };
}

describe("PROVIDER_HEALTH_ACTIONS", () => {
  it("includes AI-driven studio workflows", () => {
    assert.ok(PROVIDER_HEALTH_ACTIONS.has("ai_plan"));
    assert.ok(PROVIDER_HEALTH_ACTIONS.has("multi_agent_pipeline"));
    assert.ok(!PROVIDER_HEALTH_ACTIONS.has("idle"));
  });
});

describe("providersForHealthCheck", () => {
  it("returns single provider in single-agent mode", () => {
    const ids = providersForHealthCheck(baseSettings({ agentMode: "single" }));
    assert.deepEqual(ids, ["gemini"]);
  });

  it("dedupes pipeline stage providers", () => {
    const ids = providersForHealthCheck(
      baseSettings({
        agentMode: "pipeline",
        plannerProvider: "gemini",
        coderProvider: "anthropic",
        repairProvider: "gemini",
      }),
    );
    assert.deepEqual(ids.sort(), ["anthropic", "gemini"]);
  });
});

describe("applyFinishStudioRunPatch", () => {
  it("keeps follow-up runs in-flight after ai_plan success", () => {
    const prev = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      failureReport: {
        rootStage: "typescript",
        rootCauseLine: "old failure",
        stages: [],
        generatedAt: Date.now(),
      } as import("@/core/diagnostics/failureReport").StudioFailureReport,
    };
    const next = applyFinishStudioRunPatch(
      prev,
      "ai_plan",
      true,
      "Plan ready",
      "ai_plan",
    );
    assert.equal(next.runResult, "running");
    assert.equal(next.failureReport?.rootCauseLine, "old failure");
    assert.equal(next.latestAction?.status, "success");
    assert.equal(next.lastSuccessfulRunAt, null);
  });

  it("marks terminal success and clears failure report", () => {
    const prev = {
      ...emptyGreenfieldRun(),
      failureReport: {
        rootStage: "typescript",
        rootCauseLine: "old failure",
        stages: [],
        generatedAt: Date.now(),
      } as import("@/core/diagnostics/failureReport").StudioFailureReport,
    };
    const next = applyFinishStudioRunPatch(
      prev,
      "apply_plan",
      true,
      "Apply Plan completed",
      "apply_plan",
    );
    assert.equal(next.runResult, "success");
    assert.equal(next.failureReport, null);
    assert.equal(next.latestAction?.status, "success");
    assert.ok(next.lastSuccessfulRunAt);
  });

  it("marks failure without lastSuccessfulRunAt", () => {
    const prev = emptyGreenfieldRun();
    const next = applyFinishStudioRunPatch(
      prev,
      "apply_plan",
      false,
      "Apply failed",
      "apply_plan",
      { details: "parse error" },
    );
    assert.equal(next.runResult, "failed");
    assert.equal(next.lastSuccessfulRunAt, null);
    assert.equal(next.latestAction?.status, "failed");
    assert.equal(next.latestAction?.detail, "parse error");
  });
});
