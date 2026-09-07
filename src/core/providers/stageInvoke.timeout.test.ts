import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { resetProviderCircuit } from "@/core/providers/circuitBreaker";
import { AiCallTracker } from "@/core/providers/costControls";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import { invokeStageProvider } from "@/core/providers/stageInvoke";
import {
  boundFallbackOffer,
  MAX_SAME_PROVIDER_USER_RETRIES,
  shouldPromptProviderFallback,
  type ProviderFallbackChoice,
  type ProviderFallbackRequestV2,
} from "@/core/providers/reliability";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";

function settings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "anthropic",
    anthropicModel: "claude-opus-4-6",
    geminiModel: "gemini-2.5-flash",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "anthropic/claude-sonnet-4",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
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
    ...patch,
  });
}

function health(provider: ProviderId): HealthResult {
  return {
    ok: true,
    provider,
    model: "ok",
    checks: [],
    connectionStatus: "connected",
  };
}

const FIRST_BYTE = "No first byte received within 60 seconds";

const ANTHROPIC_ONLY = {
  hasGeminiKey: true,
  hasGroqKey: true,
  hasOpenRouterKey: true,
  ollamaBaseUrl: "http://localhost:11434",
  providerEnabled: {
    gemini: false,
    anthropic: true,
    openrouter: false,
    groq: false,
    ollama: false,
  },
} as const;

describe("Apply Plan timeout retry/fallback bounds", () => {
  beforeEach(() => {
    resetProviderCircuit();
  });

  it("does not stack a second identical HTTP retry when skipSmartRetry is set", async () => {
    let calls = 0;
    const result = await invokeStageProvider({
      settings: settings(),
      stage: "coder",
      tracker: new AiCallTracker(),
      estimatedTokens: 100,
      skipSmartRetry: true,
      healthByProvider: { anthropic: health("anthropic") },
      call: async (provider) => {
        calls += 1;
        return {
          ok: false,
          provider,
          model: "claude-opus-4-6",
          error: FIRST_BYTE,
          latencyMs: 60_000,
        };
      },
      onLog: () => undefined,
      onBudgetExceeded: () => undefined,
      onFallback: async () => "cancel",
    });
    assert.equal(calls, 1);
    assert.equal(result?.error, FIRST_BYTE);
  });

  it("allows at most one explicit same-provider retry", async () => {
    let calls = 0;
    const choices: ProviderFallbackChoice[] = ["retry", "retry", "retry"];
    const result = await invokeStageProvider({
      settings: settings(),
      stage: "coder",
      tracker: new AiCallTracker(),
      estimatedTokens: 100,
      skipSmartRetry: true,
      healthByProvider: { anthropic: health("anthropic") },
      call: async (provider) => {
        calls += 1;
        return {
          ok: false,
          provider,
          model: "claude-opus-4-6",
          error: FIRST_BYTE,
          latencyMs: 60_000,
        };
      },
      onLog: () => undefined,
      onBudgetExceeded: () => undefined,
      onFallback: async () => choices.shift() ?? "cancel",
    });
    assert.equal(calls, 1 + MAX_SAME_PROVIDER_USER_RETRIES);
    assert.equal(result?.error, FIRST_BYTE);
    assert.equal(result?.provider, "anthropic");
  });

  it("selects a configured alternate provider instead of relabeling Anthropic as fallback", async () => {
    const seen: ProviderId[] = [];
    const fallbackLogs: string[] = [];
    const result = await invokeStageProvider({
      settings: settings(),
      stage: "coder",
      tracker: new AiCallTracker(),
      estimatedTokens: 100,
      skipSmartRetry: true,
      healthByProvider: {
        anthropic: health("anthropic"),
        gemini: health("gemini"),
      },
      call: async (provider) => {
        seen.push(provider);
        if (provider === "anthropic") {
          return {
            ok: false,
            provider,
            model: "claude-opus-4-6",
            error: FIRST_BYTE,
            latencyMs: 60_000,
          };
        }
        return {
          ok: true,
          provider,
          model: "gemini-2.5-flash",
          latencyMs: 40,
        };
      },
      onLog: () => undefined,
      onBudgetExceeded: () => undefined,
      onReliabilityLog: (event) => {
        fallbackLogs.push(`${event.kind}:${event.status}:${event.message}`);
      },
      onFallback: async (request) => {
        assert.equal(request.failedProvider, "anthropic");
        assert.ok(request.options.some((o) => o.provider === "gemini"));
        assert.ok(request.options.every((o) => o.provider !== "anthropic"));
        return "gemini";
      },
    });
    assert.deepEqual(seen, ["anthropic", "gemini"]);
    assert.equal(result?.ok, true);
    assert.equal(result?.provider, "gemini");
    assert.ok(fallbackLogs.some((l) => l.startsWith("provider_fallback:selected:gemini")));
    assert.ok(!fallbackLogs.some((l) => /provider_fallback:selected:anthropic/.test(l)));
    assert.ok(!fallbackLogs.some((l) => /provider_fallback:.*anthropic/.test(l) && /selected/.test(l)));
  });

  it("cancel or no alternate settles as failed without looping", async () => {
    let calls = 0;
    const result = await invokeStageProvider({
      settings: settings({
        hasGeminiKey: false,
        hasGroqKey: false,
        hasOpenRouterKey: false,
        ollamaBaseUrl: "",
      }),
      stage: "coder",
      tracker: new AiCallTracker(),
      estimatedTokens: 100,
      skipSmartRetry: true,
      healthByProvider: { anthropic: health("anthropic") },
      call: async (provider) => {
        calls += 1;
        return {
          ok: false,
          provider,
          model: "claude-opus-4-6",
          error: FIRST_BYTE,
          latencyMs: 60_000,
        };
      },
      onLog: () => undefined,
      onBudgetExceeded: () => undefined,
      onFallback: async () => "cancel",
    });
    assert.equal(calls, 1);
    assert.equal(result?.ok, false);
    assert.equal(result?.error, FIRST_BYTE);
  });

  it("boundFallbackOffer never lists the failed provider as a fallback", () => {
    const request: ProviderFallbackRequestV2 = {
      stage: "coder",
      failedProvider: "anthropic",
      failedModel: "claude-opus-4-6",
      failure: {
        provider: "anthropic",
        model: "claude-opus-4-6",
        status: "timeout",
        errorCode: "timeout",
        userMessage: FIRST_BYTE,
        technicalMessage: FIRST_BYTE,
        retryable: true,
        suggestedFallbacks: ["gemini"],
      },
      options: [
        { provider: "gemini", label: "Gemini", model: "gemini-2.5-flash" },
        { provider: "anthropic", label: "Anthropic", model: "claude-opus-4-6" },
      ],
      allowRetry: true,
    };
    const afterOne = boundFallbackOffer(request, 1);
    assert.equal(afterOne.allowRetry, false);
    assert.ok(afterOne.options.every((o) => o.provider !== "anthropic"));
    assert.equal(shouldPromptProviderFallback(afterOne), true);
    const noneLeft = boundFallbackOffer(
      { ...request, options: [], allowRetry: true },
      1,
    );
    assert.equal(shouldPromptProviderFallback(noneLeft), false);
  });

  it("Anthropic-only mode never calls another provider even when keys exist", async () => {
    const seen: ProviderId[] = [];
    const result = await invokeStageProvider({
      settings: settings(ANTHROPIC_ONLY),
      stage: "coder",
      tracker: new AiCallTracker(),
      estimatedTokens: 100,
      skipSmartRetry: true,
      healthByProvider: {
        anthropic: health("anthropic"),
        gemini: health("gemini"),
        groq: health("groq"),
        openrouter: health("openrouter"),
      },
      call: async (provider) => {
        seen.push(provider);
        return {
          ok: false,
          provider,
          model: "claude-opus-4-6",
          error: FIRST_BYTE,
          latencyMs: 60_000,
        };
      },
      onLog: () => undefined,
      onBudgetExceeded: () => undefined,
      onFallback: async (request) => {
        assert.equal(request.options.length, 0);
        return "gemini";
      },
    });
    assert.deepEqual(seen, ["anthropic"]);
    assert.equal(result?.provider, "anthropic");
    assert.equal(result?.error, FIRST_BYTE);
    assert.equal(result?.ok, false);
  });

  it("exhausts one user retry then settles without contacting other providers", async () => {
    const seen: ProviderId[] = [];
    const result = await invokeStageProvider({
      settings: settings(ANTHROPIC_ONLY),
      stage: "coder",
      tracker: new AiCallTracker(),
      estimatedTokens: 100,
      skipSmartRetry: true,
      healthByProvider: { anthropic: health("anthropic") },
      call: async (provider) => {
        seen.push(provider);
        return {
          ok: false,
          provider,
          model: "claude-opus-4-6",
          error: FIRST_BYTE,
          latencyMs: 60_000,
        };
      },
      onLog: () => undefined,
      onBudgetExceeded: () => undefined,
      onFallback: async () => "retry",
    });
    assert.deepEqual(seen, ["anthropic", "anthropic"]);
    assert.equal(result?.ok, false);
    assert.equal(result?.error, FIRST_BYTE);
  });

  it("successful Anthropic Apply Plan remains a single call", async () => {
    let calls = 0;
    const result = await invokeStageProvider({
      settings: settings(ANTHROPIC_ONLY),
      stage: "coder",
      tracker: new AiCallTracker(),
      estimatedTokens: 100,
      skipSmartRetry: true,
      healthByProvider: { anthropic: health("anthropic") },
      call: async (provider) => {
        calls += 1;
        return {
          ok: true,
          provider,
          model: "claude-opus-4-6",
          latencyMs: 40,
        };
      },
      onLog: () => undefined,
      onBudgetExceeded: () => undefined,
      onFallback: async () => "gemini",
    });
    assert.equal(calls, 1);
    assert.equal(result?.ok, true);
    assert.equal(result?.provider, "anthropic");
  });
});
