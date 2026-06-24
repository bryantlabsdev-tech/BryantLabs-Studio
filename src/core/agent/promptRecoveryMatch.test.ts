import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPrompt } from "@/core/agent/runContextReset";
import { promptsMatchForGreenfieldRecovery } from "@/core/agent/promptRecoveryMatch";

describe("promptRecoveryMatch", () => {
  it("matches exact prompt hash", () => {
    const prompt = "Build a CRM dashboard with auth";
    assert.equal(
      promptsMatchForGreenfieldRecovery(prompt, prompt),
      true,
    );
    assert.equal(hashPrompt(prompt), hashPrompt(prompt));
  });

  it("matches rephrased prompts with overlapping intent", () => {
    assert.equal(
      promptsMatchForGreenfieldRecovery(
        "Build FieldFlow — a field service management app with job scheduling",
        "Build FieldFlow field service app with scheduling and customer list",
      ),
      true,
    );
  });

  it("rejects unrelated prompts", () => {
    assert.equal(
      promptsMatchForGreenfieldRecovery(
        "Build a todo app",
        "Fix the login bug in the payment module",
      ),
      false,
    );
  });
});
