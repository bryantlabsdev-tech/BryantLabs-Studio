import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_AGENT_PROMPT_CHARS,
  validateAgentPrompt,
} from "@/core/agent/promptSubmission";

describe("validateAgentPrompt", () => {
  it("rejects empty prompts", () => {
    const result = validateAgentPrompt("  ");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /4 characters/);
  });

  it("warns on very long but allowed prompts", () => {
    const prompt = "a".repeat(16_000);
    const result = validateAgentPrompt(prompt);
    assert.equal(result.ok, true);
    assert.match(result.warning ?? "", /Long prompt/);
  });

  it("rejects prompts over the maximum", () => {
    const prompt = "a".repeat(MAX_AGENT_PROMPT_CHARS + 1);
    const result = validateAgentPrompt(prompt);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /too long/i);
  });
});
