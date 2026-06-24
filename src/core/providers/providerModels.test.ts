import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUSTOM_MODEL_VALUE,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  GEMINI_CURATED_MODELS,
  GROQ_CURATED_MODELS,
  curatedModelSelectValue,
  formatCuratedModelOptionLabel,
  isCuratedModel,
  providerUsesCuratedModels,
} from "@/core/providers/providerModels";

describe("providerModels", () => {
  it("lists Groq curated models with recommended default", () => {
    assert.equal(GROQ_CURATED_MODELS[0]?.id, DEFAULT_GROQ_MODEL);
    assert.equal(GROQ_CURATED_MODELS[0]?.recommended, true);
    assert.equal(
      formatCuratedModelOptionLabel(GROQ_CURATED_MODELS[0]!),
      `${DEFAULT_GROQ_MODEL} (Recommended)`,
    );
  });

  it("uses anthropic/claude-sonnet-4 as OpenRouter default", () => {
    assert.equal(DEFAULT_OPENROUTER_MODEL, "anthropic/claude-sonnet-4");
  });

  it("detects curated vs custom model selection", () => {
    assert.equal(isCuratedModel(DEFAULT_GROQ_MODEL, "groq"), true);
    assert.equal(isCuratedModel("my/custom-model", "groq"), false);
    assert.equal(curatedModelSelectValue("my/custom-model", "groq"), CUSTOM_MODEL_VALUE);
  });

  it("lists Gemini curated models with recommended default", () => {
    assert.equal(GEMINI_CURATED_MODELS.length, 5);
    assert.equal(
      GEMINI_CURATED_MODELS.find((entry) => entry.recommended)?.id,
      DEFAULT_GEMINI_MODEL,
    );
    assert.ok(GEMINI_CURATED_MODELS.some((entry) => entry.id === "gemini-2.5-pro"));
    assert.ok(GEMINI_CURATED_MODELS.some((entry) => entry.id === "gemini-2.0-flash-lite"));
  });

  it("formats unavailable Gemini model labels", () => {
    const entry = GEMINI_CURATED_MODELS[0]!;
    assert.equal(
      formatCuratedModelOptionLabel(entry, { unavailable: true }),
      `${entry.id} — Model unavailable`,
    );
  });

  it("flags gemini, groq, and openrouter as curated providers", () => {
    assert.equal(providerUsesCuratedModels("gemini"), true);
    assert.equal(providerUsesCuratedModels("groq"), true);
    assert.equal(providerUsesCuratedModels("openrouter"), true);
  });
});
