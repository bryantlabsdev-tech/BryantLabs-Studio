import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProviderSettingsSavePayload,
  formatStoredApiKeyPreview,
  shouldPersistApiKeyDraft,
} from "@/core/providers/apiKeyStorage";
import type { ProviderSettings } from "@/core/providers/types";
import { normalizeProviderSettings } from "@/core/providers/orchestration";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "anthropic",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "openai/gpt-4.1-mini",
    hasGeminiKey: false,
    hasAnthropicKey: false,
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

describe("apiKeyStorage", () => {
  it("formats Anthropic masked preview with last 4", () => {
    const preview = formatStoredApiKeyPreview("sk-ant-api03-abcdefghijklmnop");
    assert.ok(preview);
    assert.match(preview!, /^sk-ant\*+mnop$/);
  });

  it("includes anthropicApiKey in save payload for new key", () => {
    const payload = buildProviderSettingsSavePayload(
      baseSettings({ provider: "anthropic" }),
      "sk-ant-api03-testkey1234",
    );
    assert.equal(payload.anthropicApiKey, "sk-ant-api03-testkey1234");
    assert.equal(payload.provider, "anthropic");
    assert.equal(payload.anthropicModel, "claude-sonnet-4-6");
    assert.equal("geminiApiKey" in payload, false);
  });

  it("includes geminiApiKey in save payload for new key", () => {
    const payload = buildProviderSettingsSavePayload(
      baseSettings({ provider: "gemini" }),
      "AIzaSyTestKey1234567890",
    );
    assert.equal(payload.geminiApiKey, "AIzaSyTestKey1234567890");
    assert.equal(payload.provider, "gemini");
    assert.equal("anthropicApiKey" in payload, false);
  });

  it("includes groqApiKey in save payload for new key", () => {
    const payload = buildProviderSettingsSavePayload(
      baseSettings({ provider: "groq" }),
      "gsk_test_key_1234",
    );
    assert.equal(payload.groqApiKey, "gsk_test_key_1234");
    assert.equal(payload.provider, "groq");
    assert.equal("anthropicApiKey" in payload, false);
  });

  it("includes openrouterApiKey in save payload for new key", () => {
    const payload = buildProviderSettingsSavePayload(
      baseSettings({ provider: "openrouter" }),
      "sk-or-test-key",
    );
    assert.equal(payload.openrouterApiKey, "sk-or-test-key");
    assert.equal(payload.provider, "openrouter");
    assert.equal("groqApiKey" in payload, false);
  });

  it("does not overwrite gemini key when saving anthropic provider settings", () => {
    const payload = buildProviderSettingsSavePayload(
      baseSettings({
        provider: "anthropic",
        hasGeminiKey: true,
        geminiKeyPreview: "sk-••••1234",
      }),
      "",
    );
    assert.equal("geminiApiKey" in payload, false);
    assert.equal("anthropicApiKey" in payload, false);
  });

  it("does not persist masked preview as key", () => {
    const preview = "sk-ant****************1234";
    assert.equal(shouldPersistApiKeyDraft(preview, preview), false);
    const payload = buildProviderSettingsSavePayload(
      baseSettings({
        provider: "anthropic",
        anthropicKeyPreview: preview,
        hasAnthropicKey: true,
      }),
      preview,
    );
    assert.equal("anthropicApiKey" in payload, false);
  });
});
