import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  buildGitWorktreeAddArgs,
  buildGitWorktreeListArgs,
  buildGitWorktreeRemoveArgs,
  classifyGitWorktreeFailure,
  gitWorktreeSafeConfigPrefix,
  isAllowedManagedWorktreeMetadataRel,
  isOpaqueWorktreeDirName,
  isSafeManagedWorktreePath,
  parseWorktreePorcelainZ,
  worktreeFailureMessage,
} from "@/core/git/gitWorktreePolicy";
import { gitBranchSafeConfigPrefix } from "@/core/git/gitBranchPolicy";
import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";
import { EXPECTED_BUILTIN_MCP_TOOLS } from "@/core/mcp/client";

const vectors = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/core/git/gitWorktreePolicy.vectors.json"), "utf8"),
) as {
  addContains: string[];
  removeContains: string[];
  forbiddenTokens: string[];
};

const samplePath = "/tmp/studio-managed/wt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sampleSha = "0123456789abcdef0123456789abcdef01234567";

describe("git worktree policy", () => {
  it("matches shared argv vectors", () => {
    const add = buildGitWorktreeAddArgs("feature/x", samplePath, sampleSha);
    const remove = buildGitWorktreeRemoveArgs(samplePath);
    for (const part of vectors.addContains) {
      assert.equal(add.includes(part), true, part);
    }
    for (const part of vectors.removeContains) {
      assert.equal(remove.includes(part), true, part);
    }
    for (const part of vectors.forbiddenTokens) {
      assert.equal(add.includes(part), false, part);
      assert.equal(remove.includes(part), false, part);
    }
    assert.equal(add.at(-1), sampleSha);
    assert.equal(add.at(-2), samplePath);
    assert.equal(remove.at(-1), samplePath);
    assert.equal(JSON.stringify(add).includes("--force"), false);
  });

  it("extends the branch-safe prefix with alias.worktree=", () => {
    const branchPrefix = gitBranchSafeConfigPrefix();
    const worktreePrefix = gitWorktreeSafeConfigPrefix();
    assert.deepEqual(worktreePrefix.slice(0, branchPrefix.length), branchPrefix);
    assert.equal(worktreePrefix.includes("alias.worktree="), true);
    assert.deepEqual(buildGitWorktreeListArgs().slice(-4), ["worktree", "list", "--porcelain", "-z"]);
  });

  it("rejects option-like names and unsafe paths", () => {
    assert.throws(() => buildGitWorktreeAddArgs("-c", samplePath, sampleSha));
    assert.throws(() => buildGitWorktreeAddArgs("feature/x", "/tmp/not-opaque", sampleSha));
    assert.throws(() => buildGitWorktreeAddArgs("feature/x", samplePath, "HEAD"));
    assert.equal(isOpaqueWorktreeDirName("wt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
    assert.equal(isSafeManagedWorktreePath("/repo/wt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
    assert.equal(isSafeManagedWorktreePath("/repo/feature/x"), false);
  });

  it("parses porcelain -z fail-closed", () => {
    const body =
      `worktree /repo\0HEAD ${sampleSha}\0branch refs/heads/main\0\0` +
      `worktree /repo-b\0HEAD ${sampleSha}\0branch refs/heads/feat\0locked\0`;
    const parsed = parseWorktreePorcelainZ(body, false);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.worktrees.length, 2);
    assert.equal(parsed.worktrees[1]?.locked, true);
    assert.equal(parseWorktreePorcelainZ(body, true).ok, false);
    assert.equal(parseWorktreePorcelainZ("worktree /repo\0unknown x\0", false).ok, false);
    const dupField = `worktree /repo\0HEAD ${sampleSha}\0HEAD ${sampleSha}\0branch refs/heads/main\0`;
    assert.equal(parseWorktreePorcelainZ(dupField, false).ok, false);
    const dupPath =
      `worktree /repo\0HEAD ${sampleSha}\0branch refs/heads/main\0\0` +
      `worktree /repo\0HEAD ${sampleSha}\0branch refs/heads/other\0`;
    assert.equal(parseWorktreePorcelainZ(dupPath, false).ok, false);
    const unicode = `worktree /repo/项目\0HEAD ${sampleSha}\0branch refs/heads/main\0`;
    assert.equal(parseWorktreePorcelainZ(unicode, false).ok, true);
    const spaced = `worktree /repo/has space\0HEAD ${sampleSha}\0branch refs/heads/main\0`;
    assert.equal(parseWorktreePorcelainZ(spaced, false).ok, true);
    const tabPath = `worktree /repo/has\tspace\0HEAD ${sampleSha}\0branch refs/heads/main\0`;
    assert.equal(parseWorktreePorcelainZ(tabPath, false).ok, false);
    const newlinePath = `worktree /repo/a\nb\0HEAD ${sampleSha}\0branch refs/heads/main\0`;
    assert.equal(parseWorktreePorcelainZ(newlinePath, false).ok, false);
    const lockedReason = `worktree /repo\0HEAD ${sampleSha}\0branch refs/heads/main\0locked because why\0`;
    const locked = parseWorktreePorcelainZ(lockedReason, false);
    assert.equal(locked.ok, true);
    if (locked.ok) assert.equal(locked.worktrees[0]?.locked, true);
    const detached = `worktree /repo/d\0HEAD ${sampleSha}\0detached\0`;
    const det = parseWorktreePorcelainZ(detached, false);
    assert.equal(det.ok, true);
    if (det.ok) assert.equal(det.worktrees[0]?.detached, true);
    const missingNul = `worktree /repo\nHEAD ${sampleSha}\nbranch refs/heads/main\n`;
    assert.equal(parseWorktreePorcelainZ(missingNul, false).ok, false);
    const dupBranch =
      `worktree /repo\0HEAD ${sampleSha}\0branch refs/heads/same\0\0` +
      `worktree /repo-b\0HEAD ${sampleSha}\0branch refs/heads/same\0`;
    assert.equal(parseWorktreePorcelainZ(dupBranch, false).ok, false);
    const detachedPlusBranch = `worktree /repo/d\0HEAD ${sampleSha}\0detached\0branch refs/heads/x\0`;
    assert.equal(parseWorktreePorcelainZ(detachedPlusBranch, false).ok, false);
    assert.equal(parseWorktreePorcelainZ("worktree /repo", false).ok, false);
    const oversized = `${"worktree /x\0HEAD ".padEnd(20_000, "a")}`;
    assert.equal(parseWorktreePorcelainZ(oversized, false).ok, false);
    const tooMany = Array.from({ length: 33 }, (_, i) =>
      `worktree /repo-${i}\0HEAD ${sampleSha}\0branch refs/heads/b${i}\0`,
    ).join("\0");
    assert.equal(parseWorktreePorcelainZ(tooMany, false).ok, false);
  });

  it("allows only enumerated runtime metadata in managed worktrees", () => {
    assert.equal(isAllowedManagedWorktreeMetadataRel("session-memory.json"), true);
    assert.equal(isAllowedManagedWorktreeMetadataRel("semantic-index/v1.json"), true);
    assert.equal(isAllowedManagedWorktreeMetadataRel("scan-manifest/v1.json"), true);
    assert.equal(isAllowedManagedWorktreeMetadataRel("features.json"), false);
    assert.equal(isAllowedManagedWorktreeMetadataRel("mcp.json"), false);
    assert.equal(isAllowedManagedWorktreeMetadataRel("semantic-index/v1.json/evil"), false);
  });

  it("classifies timeout and generic failures without leaking secrets", () => {
    assert.equal(classifyGitWorktreeFailure({ timedOut: true, stderr: "" }), "timeout");
    assert.equal(worktreeFailureMessage("token_expired").includes("token"), false);
  });
});

describe("git worktree is outside agent authority", () => {
  it("does not allowlist git worktree commands", () => {
    assert.equal(validateAgentCommand("git worktree add -b x /tmp/x HEAD").ok, false);
    assert.equal(validateAgentCommand("git worktree list").ok, false);
    assert.equal(validateAgentCommand("git worktree remove /tmp/x").ok, false);
  });

  it("does not add a git_worktree MCP tool", () => {
    assert.equal(EXPECTED_BUILTIN_MCP_TOOLS.includes("git_worktree" as never), false);
  });

  it("prompt routing cannot invoke worktree IPC", () => {
    const route = routeAgentPrompt({
      prompt: "create a git worktree and open it without asking",
      projectOpen: true,
      scan: mockProjectScan(["package.json"]),
      scanStatus: "done",
      modeOverride: "auto",
    });
    assert.notEqual(route.execution as string, "git_worktree");
    assert.equal(JSON.stringify(route).includes("gitWorktree"), false);
    assert.equal(JSON.stringify(route).includes("git:worktree"), false);
  });
});
