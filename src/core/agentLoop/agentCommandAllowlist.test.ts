import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";

describe("agentCommandAllowlist", () => {
  it("allows npm run build", () => {
    assert.equal(validateAgentCommand("npm run build").ok, true);
  });

  it("allows git status", () => {
    assert.equal(validateAgentCommand("git status").ok, true);
  });

  it("blocks destructive commands", () => {
    const result = validateAgentCommand("rm -rf node_modules");
    assert.equal(result.ok, false);
  });

  it("blocks unknown commands", () => {
    const result = validateAgentCommand("python exploit.py");
    assert.equal(result.ok, false);
  });
});
