import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMaskedApiKeyPreview,
  isMaskedApiKeyPreview,
} from "@/core/providers/apiKeyFormat";

describe("apiKeyFormat", () => {
  it("masks Anthropic keys with prefix and last 4", () => {
    const preview = formatMaskedApiKeyPreview("sk-ant-api03-abcdefghijklmnop");
    assert.ok(preview);
    assert.match(preview, /^sk-ant\*+mnop$/);
    assert.equal(preview!.slice(-4), "mnop");
  });

  it("masks Groq keys with gsk_ prefix", () => {
    const preview = formatMaskedApiKeyPreview("gsk_test_key_1234");
    assert.ok(preview);
    assert.match(preview, /^gsk_\*+1234$/);
  });

  it("detects asterisk masked previews", () => {
    assert.equal(isMaskedApiKeyPreview("sk-********abcd"), true);
    assert.equal(isMaskedApiKeyPreview("sk-ant-real-key"), false);
  });
});
