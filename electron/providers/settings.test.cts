import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeProviderSettingsInput } from "./settings.cjs";

describe("provider settings", () => {
  it("sanitizes groq provider settings input", () => {
    const out = sanitizeProviderSettingsInput({
      provider: "groq",
      groqModel: "llama-3.3-70b-versatile",
      groqApiKey: "gsk_test_key_1234",
    });
    assert.equal(out.provider, "groq");
    assert.equal(out.groqModel, "llama-3.3-70b-versatile");
    assert.equal(out.groqApiKey, "gsk_test_key_1234");
  });

  it("sanitizes openrouter provider settings input", () => {
    const out = sanitizeProviderSettingsInput({
      provider: "openrouter",
      openrouterModel: "openai/gpt-4.1-mini",
      openrouterApiKey: "sk-or-test-key",
    });
    assert.equal(out.provider, "openrouter");
    assert.equal(out.openrouterModel, "openai/gpt-4.1-mini");
    assert.equal(out.openrouterApiKey, "sk-or-test-key");
  });

  it("does not mix groq and openrouter keys in sanitize", () => {
    const out = sanitizeProviderSettingsInput({
      provider: "groq",
      groqApiKey: "gsk_only",
      openrouterApiKey: "sk-or-should-pass-through",
    });
    assert.equal(out.groqApiKey, "gsk_only");
    assert.equal(out.openrouterApiKey, "sk-or-should-pass-through");
    assert.equal(out.provider, "groq");
  });

  it("accepts file write mode setting", () => {
    const out = sanitizeProviderSettingsInput({ fileWriteMode: "safe" });
    assert.equal(out.fileWriteMode, "safe");
    const workspace = sanitizeProviderSettingsInput({ fileWriteMode: "workspace" });
    assert.equal(workspace.fileWriteMode, "workspace");
  });

  it("accepts pipeline routing to groq and openrouter", () => {
    const out = sanitizeProviderSettingsInput({
      coderProvider: "openrouter",
      coderModel: "anthropic/claude-3.5-sonnet",
      repairProvider: "groq",
      repairModel: "llama-3.1-8b-instant",
    });
    assert.equal(out.coderProvider, "openrouter");
    assert.equal(out.coderModel, "anthropic/claude-3.5-sonnet");
    assert.equal(out.repairProvider, "groq");
    assert.equal(out.repairModel, "llama-3.1-8b-instant");
  });

  it("coerces planner max output tokens", () => {
    const out = sanitizeProviderSettingsInput({ plannerMaxOutputTokens: 12000 });
    assert.equal(out.plannerMaxOutputTokens, 12000);
    const clamped = sanitizeProviderSettingsInput({ plannerMaxOutputTokens: 256 });
    assert.equal(clamped.plannerMaxOutputTokens, 1024);
  });
});
