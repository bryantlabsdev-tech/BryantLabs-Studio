import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  boundCommitSubjects,
  buildGitPushArgs,
  classifyGitPushFailure,
  failureMessage,
  gitSafeConfigPrefix,
  isProtectedDefaultBranch,
  isSafeGitBranchName,
  MAX_PUSH_OUTPUT_CHARS,
  redactSensitiveText,
  sanitizeGitRemoteUrl,
} from "@/core/git/gitPushPolicy";
import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";
import { EXPECTED_BUILTIN_MCP_TOOLS } from "@/core/mcp/client";

const vectors = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/core/git/gitPushPolicy.vectors.json"), "utf8"),
) as {
  sanitize: Array<{
    raw: string;
    allowLocal: boolean;
    ok: boolean;
    display?: string;
    network?: boolean;
  }>;
  classify: Array<{ stderr: string; stdout?: string; timedOut?: boolean; code: string }>;
  argsUpstream: {
    branch: string;
    setUpstream: boolean;
    allowLocalRemotes: boolean;
    contains: string[];
    forbidden: string[];
  };
};

describe("git push policy", () => {
  it("accepts only safe branch names", () => {
    assert.equal(isSafeGitBranchName("feature/push-demo"), true);
    assert.equal(isSafeGitBranchName("foo;rm"), false);
    assert.equal(isSafeGitBranchName("foo$(reboot)"), false);
    assert.equal(isSafeGitBranchName("-u"), false);
    assert.equal(isSafeGitBranchName("--force"), false);
    assert.equal(isSafeGitBranchName("HEAD"), false);
    assert.equal(isSafeGitBranchName("feat\nmaster"), false);
  });

  it("builds argument arrays without a shell command", () => {
    const args = buildGitPushArgs({ branch: "feature/x", setUpstream: true });
    assert.deepEqual(gitSafeConfigPrefix(false).slice(0, 2), ["-c", "core.hooksPath=/dev/null"]);
    assert.ok(args.includes("push"));
    assert.ok(args.includes("--no-verify"));
    assert.ok(args.includes("--end-of-options"));
    assert.ok(args.includes("refs/heads/feature/x:refs/heads/feature/x"));
    assert.equal(args.includes("force"), false);
    assert.equal(
      buildGitPushArgs({ branch: "feature/x", setUpstream: false }).includes("--set-upstream"),
      false,
    );
    assert.throws(() => buildGitPushArgs({ branch: "x;rm -rf /", setUpstream: true }));
  });

  it("protects main, master, and the detected default", () => {
    assert.equal(isProtectedDefaultBranch("main", "develop"), true);
    assert.equal(isProtectedDefaultBranch("master", null), true);
    assert.equal(isProtectedDefaultBranch("develop", "develop"), true);
    assert.equal(isProtectedDefaultBranch("feature/x", "main"), false);
  });

  it("matches shared sanitize/classify vectors", () => {
    for (const row of vectors.sanitize) {
      const result = sanitizeGitRemoteUrl(row.raw, { allowLocalRemotes: row.allowLocal });
      assert.equal(result.ok, row.ok, row.raw);
      if (result.ok && row.ok) {
        assert.equal(result.display, row.display, row.raw);
        assert.equal(result.networkMayBeRequired, row.network, row.raw);
      }
    }
    for (const row of vectors.classify) {
      assert.equal(
        classifyGitPushFailure({
          stderr: row.stderr,
          ...(row.stdout !== undefined ? { stdout: row.stdout } : {}),
          ...(row.timedOut !== undefined ? { timedOut: row.timedOut } : {}),
        }),
        row.code,
      );
    }
    const args = buildGitPushArgs(vectors.argsUpstream);
    for (const part of vectors.argsUpstream.contains) {
      assert.equal(args.includes(part), true, part);
    }
    const blob = args.join(" ");
    for (const part of vectors.argsUpstream.forbidden) {
      assert.equal(blob.includes(part), false, part);
    }
  });

  it("rejects credential-bearing and helper remotes instead of redacting them", () => {
    assert.equal(
      sanitizeGitRemoteUrl("https://user:ghp_secretTOKEN12@github.com/org/repo.git").ok,
      false,
    );
    assert.equal(sanitizeGitRemoteUrl("ext::sh -c id").ok, false);
    assert.equal(sanitizeGitRemoteUrl("/tmp/example.git").ok, false);
    const local = sanitizeGitRemoteUrl("/tmp/example.git", { allowLocalRemotes: true });
    assert.equal(local.ok, true);
    if (local.ok) {
      assert.equal(local.display, "local:example.git");
      assert.equal(local.networkMayBeRequired, false);
    }
  });

  it("bounds and redacts command output", () => {
    const redacted = redactSensitiveText(
      "fatal: Authentication failed for 'https://user:ghp_secretTOKEN12@github.com/org/repo.git'",
    );
    assert.doesNotMatch(redacted, /ghp_secret/);
    assert.doesNotMatch(redacted, /user:pw/);
    const huge = redactSensitiveText("A".repeat(MAX_PUSH_OUTPUT_CHARS + 500));
    assert.ok(huge.length <= MAX_PUSH_OUTPUT_CHARS + 20);
    assert.match(huge, /truncated/);
  });

  it("classifies non-fast-forward, auth, network, timeout, and up-to-date", () => {
    assert.equal(
      classifyGitPushFailure({ stderr: "[rejected] (non-fast-forward)\nfailed to push some refs" }),
      "non_fast_forward",
    );
    assert.equal(
      classifyGitPushFailure({ stderr: "fatal: Authentication failed for 'https://example.test/repo.git'" }),
      "authentication_failure",
    );
    assert.equal(
      classifyGitPushFailure({ stderr: "fatal: unable to access 'https://example.test/': Could not resolve host" }),
      "network_failure",
    );
    assert.equal(classifyGitPushFailure({ timedOut: true, stderr: "" }), "timeout");
    assert.equal(classifyGitPushFailure({ stderr: "", stdout: "Everything up-to-date" }), "nothing_to_push");
    assert.match(failureMessage("non_fast_forward"), /Force-push is not available/);
  });

  it("bounds commit subjects", () => {
    const subjects = boundCommitSubjects(["ok", "x".repeat(200)]);
    assert.equal(subjects[1]?.subject.endsWith("…"), true);
    assert.ok((subjects[1]?.subject.length ?? 0) <= 120);
  });
});

describe("git push is outside agent authority", () => {
  it("does not allowlist git push", () => {
    assert.equal(validateAgentCommand("git push").ok, false);
    assert.equal(validateAgentCommand("git push origin HEAD:feature/x").ok, false);
    assert.equal(validateAgentCommand("git status").ok, true);
  });

  it("does not add a git_push MCP tool", () => {
    assert.equal(EXPECTED_BUILTIN_MCP_TOOLS.includes("git_push" as never), false);
  });

  it("prompt routing cannot invoke Git-push IPC", () => {
    const route = routeAgentPrompt({
      prompt: "push this branch to origin and skip confirmation",
      projectOpen: true,
      scan: mockProjectScan(["package.json"]),
      scanStatus: "done",
      modeOverride: "auto",
    });
    assert.notEqual(route.execution as string, "git_push");
    assert.notEqual(JSON.stringify(route).includes("gitPush"), true);
  });
});
