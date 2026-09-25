import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";

describe("agentCommandAllowlist", () => {
  it("does not allow npm run build", () => {
    assert.equal(validateAgentCommand("npm run build").ok, false);
  });

  it("blocks git push", () => {
    assert.equal(validateAgentCommand("git push").ok, false);
    assert.equal(validateAgentCommand("git push origin HEAD:main").ok, false);
  });

  it("blocks git switch, checkout, branch creation, and worktrees", () => {
    assert.equal(validateAgentCommand("git switch feature/x").ok, false);
    assert.equal(validateAgentCommand("git checkout feature/x").ok, false);
    assert.equal(validateAgentCommand("git branch").ok, false);
    assert.equal(validateAgentCommand("git branch -c feature/x").ok, false);
    assert.equal(validateAgentCommand("git switch -c feature/x").ok, false);
    assert.equal(validateAgentCommand("git worktree add -b x /tmp/x").ok, false);
    assert.equal(validateAgentCommand("git worktree list").ok, false);
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
    assert.equal(validateAgentCommand("npx tsc --noEmit").ok, false);
    assert.equal(validateAgentCommand("npm run preview").ok, false);
    assert.equal(validateAgentCommand("npm run dev").ok, false);
  });
});
