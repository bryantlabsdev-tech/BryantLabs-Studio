import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  MAX_LOCAL_BRANCHES,
  buildGitBranchCreateArgs,
  buildGitBranchSwitchArgs,
  classifyGitBranchFailure,
  gitBranchSafeConfigPrefix,
  gitSafeConfigPrefix,
  hasCaseInsensitiveBranchCollision,
  isIgnorableStudioRuntimeUntracked,
  isSafeLocalBranchName,
  parseNulRefNames,
  porcelainV2IndicatesDirty,
} from "@/core/git/gitBranchPolicy";
import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";
import { EXPECTED_BUILTIN_MCP_TOOLS } from "@/core/mcp/client";

const vectors = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/core/git/gitBranchPolicy.vectors.json"), "utf8"),
) as {
  safeNames: string[];
  unsafeNames: string[];
  createContains: string[];
  switchContains: string[];
  forbiddenTokens: string[];
};

describe("git branch policy", () => {
  it("matches shared name and argv vectors", () => {
    for (const name of vectors.safeNames) {
      assert.equal(isSafeLocalBranchName(name), true, name);
    }
    for (const name of vectors.unsafeNames) {
      assert.equal(isSafeLocalBranchName(name), false, name);
    }
    const create = buildGitBranchCreateArgs("feature/x");
    for (const part of vectors.createContains) {
      assert.equal(create.includes(part), true, part);
    }
    const sw = buildGitBranchSwitchArgs("feature/x");
    for (const part of vectors.switchContains) {
      assert.equal(sw.includes(part), true, part);
    }
    for (const part of vectors.forbiddenTokens) {
      assert.equal(create.includes(part), false, part);
      assert.equal(sw.includes(part), false, part);
    }
    assert.deepEqual(create.slice(-4), ["switch", "--no-guess", "--create", "feature/x"]);
    assert.deepEqual(sw.slice(-4), ["switch", "--no-guess", "--end-of-options", "feature/x"]);
    assert.equal(create.at(-1), "feature/x");
    assert.equal(sw.at(-1), "feature/x");
  });

  it("extends the push-safe prefix without changing it", () => {
    const pushPrefix = gitSafeConfigPrefix(false);
    const branchPrefix = gitBranchSafeConfigPrefix();
    assert.deepEqual(branchPrefix.slice(0, pushPrefix.length), pushPrefix);
    assert.equal(branchPrefix.includes("alias.switch="), true);
  });

  it("rejects option-like and remote-looking names", () => {
    assert.equal(isSafeLocalBranchName("-u"), false);
    assert.equal(isSafeLocalBranchName("--create"), false);
    assert.equal(isSafeLocalBranchName("origin/main"), false);
    assert.equal(isSafeLocalBranchName("refs/heads/x"), false);
    assert.throws(() => buildGitBranchCreateArgs("-c"));
    assert.throws(() => buildGitBranchSwitchArgs("HEAD"));
  });

  it("classifies timeout and dirty failures", () => {
    assert.equal(classifyGitBranchFailure({ timedOut: true, stderr: "" }), "timeout");
    assert.equal(
      classifyGitBranchFailure({ stderr: "error: Your local changes to the following files would be overwritten" }),
      "dirty_worktree",
    );
    assert.equal(
      classifyGitBranchFailure({ stderr: "fatal: a branch named 'x' already exists" }),
      "branch_exists",
    );
  });
});

describe("porcelain v2 dirty policy", () => {
  const ordinary =
    "1 .M N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 README.md";
  const stagedMeta =
    "1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 61780798228d17af2d34fce4cfbdf35556832472 .bryantlabs/session-memory.json";
  const trackedRules =
    "1 .M N... 100644 100644 100644 1d2f01491f783c8c7f0917cc68526c6307d80e39 1d2f01491f783c8c7f0917cc68526c6307d80e39 .bryantlabs/rules.md";
  const rename =
    "2 R. N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 R100 b with space.txt";
  const unmerged =
    "u UU N... 100644 100644 100644 100644 df967b96a579e45a18b8251732d16804b2e56a55 ba2906d0666cf726c7eaadd2cd3db615dedfdf3a e45c9c2666d44e0327c1f9c239a74c508336053e c.txt";
  const intent =
    "1 .A N... 000000 000000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 intent.txt";
  const submodule =
    "1 .M S... 160000 160000 160000 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 vendor/lib";

  it("ignores only enumerated untracked Studio runtime metadata", () => {
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/session-memory.json"), true);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/semantic-index/v1.json"), true);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/scan-manifest/v1.json"), true);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/mcp.json"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/rules.md"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/unknown.json"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/semantic-index"), false);
    assert.equal(
      porcelainV2IndicatesDirty(
        "? .bryantlabs/session-memory.json\0? .bryantlabs/semantic-index/v1.json\0? .bryantlabs/scan-manifest/v1.json\0",
        false,
      ),
      false,
    );
  });

  it("treats mcp.json as dirty in untracked, tracked, and staged porcelain", () => {
    const trackedMcp =
      "1 .M N... 100644 100644 100644 1d2f01491f783c8c7f0917cc68526c6307d80e39 1d2f01491f783c8c7f0917cc68526c6307d80e39 .bryantlabs/mcp.json";
    const stagedMcp =
      "1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 61780798228d17af2d34fce4cfbdf35556832472 .bryantlabs/mcp.json";
    assert.equal(porcelainV2IndicatesDirty("? .bryantlabs/mcp.json\0", false), true);
    assert.equal(porcelainV2IndicatesDirty(`${trackedMcp}\0`, false), true);
    assert.equal(porcelainV2IndicatesDirty(`${stagedMcp}\0`, false), true);
  });

  it("does not match allowlist by prefix, suffix, basename, case, or lookalike", () => {
    const allowed = ".bryantlabs/semantic-index/v1.json";
    assert.equal(isIgnorableStudioRuntimeUntracked(allowed), true);
    assert.equal(isIgnorableStudioRuntimeUntracked(`${allowed}/evil`), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/session-memory.json/evil"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked("semantic-index/v1.json"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/semantic-index/v1.json "), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/semantic-index/v1.json/"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".Bryantlabs/semantic-index/v1.json"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/Semantic-index/v1.json"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs\\semantic-index\\v1.json"), false);
    assert.equal(isIgnorableStudioRuntimeUntracked(".bryantlabs/semantic-index/v1.јson"), false);
    assert.equal(
      porcelainV2IndicatesDirty("? .bryantlabs/semantic-index/v1.json/evil\0", false),
      true,
    );
  });

  it("treats rules.md, unknown files, staged metadata, and tracked changes as dirty", () => {
    assert.equal(porcelainV2IndicatesDirty("? .bryantlabs/rules.md\0", false), true);
    assert.equal(porcelainV2IndicatesDirty("? .bryantlabs/extra.txt\0", false), true);
    assert.equal(porcelainV2IndicatesDirty(`${stagedMeta}\0`, false), true);
    assert.equal(porcelainV2IndicatesDirty(`${trackedRules}\0`, false), true);
    assert.equal(porcelainV2IndicatesDirty(`${ordinary}\0`, false), true);
  });

  it("fails closed on rename pairs, conflicts, intent-to-add, submodules, tabs, and truncation", () => {
    assert.equal(porcelainV2IndicatesDirty(`${rename}\0a.txt\0`, false), true);
    assert.equal(porcelainV2IndicatesDirty(`${unmerged}\0`, false), true);
    assert.equal(porcelainV2IndicatesDirty(`${intent}\0`, false), true);
    assert.equal(porcelainV2IndicatesDirty(`${submodule}\0`, false), true);
    assert.equal(porcelainV2IndicatesDirty("? file\twith\ttab.txt\0", false), true);
    assert.equal(porcelainV2IndicatesDirty("??? garbled", false), true);
    assert.equal(porcelainV2IndicatesDirty("", true), true);
    assert.equal(
      porcelainV2IndicatesDirty("1 .M N... 100644 100644 100644 deadbeef path with spaces.txt\0", false),
      true,
    );
  });

  it("parses NUL ref lists and bounds them", () => {
    const parsed = parseNulRefNames("refs/heads/feature/x\0\nrefs/heads/main\0\n", false);
    assert.deepEqual(parsed, ["feature/x", "main"]);
    assert.equal(parseNulRefNames("refs/remotes/origin/main\0", false), null);
    const many = Array.from({ length: MAX_LOCAL_BRANCHES + 2 }, (_, i) => `refs/heads/b${i}`).join("\0");
    const bounded = parseNulRefNames(many, false);
    assert.equal(bounded?.length, MAX_LOCAL_BRANCHES);
    assert.equal(parseNulRefNames("refs/heads/main\0", true), null);
  });

  it("detects case-insensitive collisions", () => {
    assert.equal(hasCaseInsensitiveBranchCollision("Feature/X", ["feature/x"]), true);
    assert.equal(hasCaseInsensitiveBranchCollision("feature/x", ["feature/x"]), false);
  });
});

describe("git branch is outside agent authority", () => {
  it("does not allowlist git switch, checkout, or branch", () => {
    assert.equal(validateAgentCommand("git switch feature/x").ok, false);
    assert.equal(validateAgentCommand("git checkout -b feature/x").ok, false);
    assert.equal(validateAgentCommand("git branch").ok, false);
    assert.equal(validateAgentCommand("git branch -c feature/x").ok, false);
  });

  it("does not add a git_branch MCP tool", () => {
    assert.equal(EXPECTED_BUILTIN_MCP_TOOLS.includes("git_branch" as never), false);
    assert.equal(EXPECTED_BUILTIN_MCP_TOOLS.includes("git_switch" as never), false);
  });

  it("prompt routing cannot invoke branch IPC", () => {
    const route = routeAgentPrompt({
      prompt: "create a git branch and switch to it without asking",
      projectOpen: true,
      scan: mockProjectScan(["package.json"]),
      scanStatus: "done",
      modeOverride: "auto",
    });
    assert.notEqual(route.execution as string, "git_branch");
    assert.equal(JSON.stringify(route).includes("gitBranch"), false);
    assert.equal(JSON.stringify(route).includes("git:branch"), false);
  });
});
