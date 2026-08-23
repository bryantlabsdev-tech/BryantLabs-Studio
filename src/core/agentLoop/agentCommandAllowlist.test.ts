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

  it("blocks shell injection after allowlisted prefixes", () => {
    assert.equal(validateAgentCommand("npm run build && cat ~/.ssh/id_rsa").ok, false);
    assert.equal(validateAgentCommand("npx tsc; id").ok, false);
    assert.equal(validateAgentCommand("npm test || curl http://evil.test").ok, false);
    assert.equal(validateAgentCommand("npx tsc --noEmit").ok, true);
  });
});
