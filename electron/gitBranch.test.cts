import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, chmod, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { buildGitPushEnv, buildProductGitEnv } from "./gitPush.cjs";
import {
  buildGitBranchCreateArgs,
  buildGitBranchSwitchArgs,
  cancelGitBranchToken,
  classifyGitBranchFailure,
  clearGitBranchSession,
  executeApprovedGitBranch,
  listLocalGitBranches,
  prepareGitBranch,
  revokeGitBranchOwner,
  runProductGit,
} from "./gitBranch.cjs";

const exec = promisify(execFile);
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.test",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.test",
  GIT_EDITOR: "true",
  GIT_MERGE_AUTOEDIT: "no",
};

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, env: gitEnv, encoding: "utf8" });
  return (stdout ?? "").trim();
}

async function makeRepo(): Promise<{ repo: string; feature: string }> {
  const repo = await mkdtemp(path.join(tmpdir(), "bl-branch-repo-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await writeFile(path.join(repo, "README.md"), "one\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init"]);
  await git(repo, ["checkout", "-b", "feature/existing"]);
  await writeFile(path.join(repo, "feat.txt"), "feat\n", "utf8");
  await git(repo, ["add", "feat.txt"]);
  await git(repo, ["commit", "-m", "feature"]);
  await git(repo, ["checkout", "main"]);
  return { repo, feature: "feature/existing" };
}

describe("git branch policy vectors (electron copy)", () => {
  it("matches shared argv vectors", () => {
    const vectors = JSON.parse(
      readFileSync(path.join(process.cwd(), "src/core/git/gitBranchPolicy.vectors.json"), "utf8"),
    ) as {
      createContains: string[];
      switchContains: string[];
      forbiddenTokens: string[];
    };
    const create = buildGitBranchCreateArgs("feature/x");
    const sw = buildGitBranchSwitchArgs("feature/x");
    for (const part of vectors.createContains) assert.equal(create.includes(part), true, part);
    for (const part of vectors.switchContains) assert.equal(sw.includes(part), true, part);
    for (const part of vectors.forbiddenTokens) {
      assert.equal(create.includes(part), false, part);
      assert.equal(sw.includes(part), false, part);
    }
    assert.equal(create.includes("--end-of-options"), false);
    assert.equal(JSON.stringify(create).includes("start-point"), false);
  });
});

describe("approval-gated git branch create/switch", () => {
  it("creates a branch from HEAD and switches to it", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    const listed = await listLocalGitBranches(repo);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.currentBranch, "main");
    assert.equal(listed.dirty, false);
    const preflight = await prepareGitBranch(repo, { op: "create", destination: "feature/created" });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitBranch(repo, preflight.token);
    assert.equal(result.ok, true);
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), "feature/created");
    assert.equal(await git(repo, ["rev-parse", "HEAD"]), head);
  });

  it("switches among existing local branches", async () => {
    await clearGitBranchSession();
    const { repo, feature } = await makeRepo();
    const preflight = await prepareGitBranch(repo, { op: "switch", destination: feature });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitBranch(repo, preflight.token);
    assert.equal(result.ok, true);
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), feature);
  });

  it("ignores only enumerated untracked Studio runtime metadata", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    await mkdir(path.join(repo, ".bryantlabs", "semantic-index"), { recursive: true });
    await mkdir(path.join(repo, ".bryantlabs", "scan-manifest"), { recursive: true });
    await writeFile(path.join(repo, ".bryantlabs", "session-memory.json"), "{}\n", "utf8");
    await writeFile(path.join(repo, ".bryantlabs", "semantic-index", "v1.json"), "{}\n", "utf8");
    await writeFile(path.join(repo, ".bryantlabs", "scan-manifest", "v1.json"), "{}\n", "utf8");
    const listed = await listLocalGitBranches(repo);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.dirty, false);
    const preflight = await prepareGitBranch(repo, { op: "create", destination: "feature/meta" });
    assert.equal(preflight.ok, true);
  });

  it("refuses dirty index and worktree without mutation", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const before = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
    await writeFile(path.join(repo, "dirty.txt"), "x\n", "utf8");
    const dirtyUntracked = await prepareGitBranch(repo, { op: "create", destination: "feature/nope" });
    assert.equal(dirtyUntracked.ok, false);
    if (!dirtyUntracked.ok) assert.equal(dirtyUntracked.code, "dirty_worktree");
    await git(repo, ["add", "dirty.txt"]);
    const dirtyIndex = await prepareGitBranch(repo, { op: "switch", destination: "feature/existing" });
    assert.equal(dirtyIndex.ok, false);
    if (!dirtyIndex.ok) assert.equal(dirtyIndex.code, "dirty_worktree");
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), before);
  });

  it("rejects detached HEAD and in-progress merge", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    await git(repo, ["checkout", "--detach", "HEAD"]);
    const detached = await prepareGitBranch(repo, { op: "create", destination: "feature/d" });
    assert.equal(detached.ok, false);
    if (!detached.ok) assert.equal(detached.code, "detached_head");

    const mergeRepo = await makeRepo();
    await git(mergeRepo.repo, ["checkout", mergeRepo.feature]);
    await writeFile(path.join(mergeRepo.repo, "conflict.txt"), "a\n", "utf8");
    await git(mergeRepo.repo, ["add", "conflict.txt"]);
    await git(mergeRepo.repo, ["commit", "-m", "a"]);
    await git(mergeRepo.repo, ["checkout", "main"]);
    await writeFile(path.join(mergeRepo.repo, "conflict.txt"), "b\n", "utf8");
    await git(mergeRepo.repo, ["add", "conflict.txt"]);
    await git(mergeRepo.repo, ["commit", "-m", "b"]);
    await git(mergeRepo.repo, ["merge", mergeRepo.feature]).catch(() => undefined);
    const merging = await prepareGitBranch(mergeRepo.repo, { op: "switch", destination: mergeRepo.feature });
    assert.equal(merging.ok, false);
    if (!merging.ok) assert.equal(merging.code, "operation_in_progress");
  });

  it("rejects invalid and option-like names", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    for (const destination of ["-c", "--force", "HEAD", "origin/main", "feat;rm"]) {
      const result = await prepareGitBranch(repo, { op: "create", destination });
      assert.equal(result.ok, false, destination);
      if (!result.ok) assert.equal(result.code, "invalid_branch");
    }
  });

  it("rejects nonexistent switch targets and existing create names", async () => {
    await clearGitBranchSession();
    const { repo, feature } = await makeRepo();
    const missing = await prepareGitBranch(repo, { op: "switch", destination: "feature/missing" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "no_such_branch");
    const exists = await prepareGitBranch(repo, { op: "create", destination: feature });
    assert.equal(exists.ok, false);
    if (!exists.ok) assert.equal(exists.code, "branch_exists");
  });

  it("invalidates stale HEAD tokens and consumes them", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const preflight = await prepareGitBranch(repo, { op: "create", destination: "feature/stale" });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    await writeFile(path.join(repo, "more.txt"), "m\n", "utf8");
    await git(repo, ["add", "more.txt"]);
    await git(repo, ["commit", "-m", "moved"]);
    const result = await executeApprovedGitBranch(repo, preflight.token);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "branch_or_head_changed");
    const reuse = await executeApprovedGitBranch(repo, preflight.token);
    assert.equal(reuse.ok, false);
    if (!reuse.ok) assert.equal(reuse.code, "token_invalid");
  });

  it("does not let another project consume a token", async () => {
    await clearGitBranchSession();
    const a = await makeRepo();
    const b = await makeRepo();
    const preflight = await prepareGitBranch(a.repo, { op: "create", destination: "feature/isolated" });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const stolen = await executeApprovedGitBranch(b.repo, preflight.token);
    assert.equal(stolen.ok, false);
    if (!stolen.ok) assert.equal(stolen.code, "token_invalid");
    const own = await executeApprovedGitBranch(a.repo, preflight.token);
    assert.equal(own.ok, true);
  });

  it("cancel and session reset do not change HEAD", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const before = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const preflight = await prepareGitBranch(repo, { op: "create", destination: "feature/cancel" });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    cancelGitBranchToken(preflight.token);
    const cancelled = await executeApprovedGitBranch(repo, preflight.token);
    assert.equal(cancelled.ok, false);
    const again = await prepareGitBranch(repo, { op: "switch", destination: "feature/existing" });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    await clearGitBranchSession();
    const reset = await executeApprovedGitBranch(repo, again.token);
    assert.equal(reset.ok, false);
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), before);
  });

  it("rejects a duplicate concurrent branch change", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const a = await prepareGitBranch(repo, { op: "create", destination: "feature/one" });
    const b = await prepareGitBranch(repo, { op: "create", destination: "feature/two" });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    const [first, second] = await Promise.all([
      executeApprovedGitBranch(repo, a.token),
      executeApprovedGitBranch(repo, b.token),
    ]);
    const codes = [first, second].map((item) => (item.ok ? "ok" : item.code)).sort();
    assert.ok(codes.includes("ok"));
    assert.ok(codes.includes("already_active"));
  });

  it("times out a hung git subprocess and cleans the process tree", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const startedAt = Date.now();
    const ran = await runProductGit(repo, ["cat-file", "--batch"], { timeoutMs: 250, trackTree: true });
    assert.ok(Date.now() - startedAt < 8_000);
    assert.equal(ran.timedOut, true);
    assert.equal(classifyGitBranchFailure({ timedOut: true, stderr: ran.stderr }), "timeout");
  });

  it("strips dangerous Git environment variables from branch operations", () => {
    const previous = process.env.GIT_SSH_COMMAND;
    process.env.GIT_SSH_COMMAND = "touch pwned";
    try {
      const env = buildGitPushEnv();
      assert.equal(env.GIT_SSH_COMMAND, undefined);
      assert.equal(env.GIT_TERMINAL_PROMPT, "0");
      const args = buildGitBranchCreateArgs("feature/x");
      assert.equal(JSON.stringify({ env, args }).includes("touch pwned"), false);
    } finally {
      if (previous === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = previous;
    }
  });

  it("does not execute local hooks on switch", async () => {
    await clearGitBranchSession();
    const { repo, feature } = await makeRepo();
    const hook = path.join(repo, ".git", "hooks", "post-checkout");
    const sentinel = path.join(repo, "HOOK_RAN");
    await writeFile(hook, `#!/bin/sh\necho hooked > "${sentinel}"\n`, "utf8");
    await chmod(hook, 0o755);
    const preflight = await prepareGitBranch(repo, { op: "switch", destination: feature });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitBranch(repo, preflight.token);
    assert.equal(result.ok, true);
    assert.equal(existsSync(sentinel), false);
  });

  it("redacts credential text in classified failures", () => {
    const code = classifyGitBranchFailure({
      stderr: "fatal: could not read https://user:ghp_secretTOKEN12@example.test/repo.git",
    });
    assert.equal(["generic_failure", "no_such_branch"].includes(code), true);
  });

  it("refuses untracked and tracked .bryantlabs/rules.md and unknown files", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    await mkdir(path.join(repo, ".bryantlabs"), { recursive: true });
    await writeFile(path.join(repo, ".bryantlabs", "rules.md"), "rules\n", "utf8");
    const untracked = await prepareGitBranch(repo, { op: "create", destination: "feature/rules" });
    assert.equal(untracked.ok, false);
    if (!untracked.ok) assert.equal(untracked.code, "dirty_worktree");
    await git(repo, ["add", ".bryantlabs/rules.md"]);
    await git(repo, ["commit", "-m", "rules"]);
    await writeFile(path.join(repo, ".bryantlabs", "rules.md"), "changed\n", "utf8");
    const tracked = await prepareGitBranch(repo, { op: "switch", destination: "feature/existing" });
    assert.equal(tracked.ok, false);
    if (!tracked.ok) assert.equal(tracked.code, "dirty_worktree");
    await git(repo, ["checkout", "--", ".bryantlabs/rules.md"]);
    await writeFile(path.join(repo, ".bryantlabs", "mystery.bin"), "x\n", "utf8");
    const unknown = await prepareGitBranch(repo, { op: "create", destination: "feature/unknown" });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.code, "dirty_worktree");
  });

  it("refuses untracked, tracked-modified, and staged .bryantlabs/mcp.json", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const before = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
    await mkdir(path.join(repo, ".bryantlabs"), { recursive: true });
    await writeFile(path.join(repo, ".bryantlabs", "mcp.json"), '{"mcpServers":{}}\n', "utf8");
    const untracked = await prepareGitBranch(repo, { op: "create", destination: "feature/mcp-u" });
    assert.equal(untracked.ok, false);
    if (!untracked.ok) assert.equal(untracked.code, "dirty_worktree");
    await git(repo, ["add", ".bryantlabs/mcp.json"]);
    const staged = await prepareGitBranch(repo, { op: "create", destination: "feature/mcp-s" });
    assert.equal(staged.ok, false);
    if (!staged.ok) assert.equal(staged.code, "dirty_worktree");
    await git(repo, ["commit", "-m", "mcp"]);
    await writeFile(path.join(repo, ".bryantlabs", "mcp.json"), '{"mcpServers":{"x":{"command":"true"}}}\n', "utf8");
    const tracked = await prepareGitBranch(repo, { op: "switch", destination: "feature/existing" });
    assert.equal(tracked.ok, false);
    if (!tracked.ok) assert.equal(tracked.code, "dirty_worktree");
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), before);
  });

  it("does not ignore nested prefix paths under a runtime metadata file name", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const nested = path.join(repo, ".bryantlabs", "semantic-index", "v1.json", "evil");
    await mkdir(path.dirname(nested), { recursive: true });
    await writeFile(nested, "x\n", "utf8");
    const listed = await listLocalGitBranches(repo);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.dirty, true);
    const preflight = await prepareGitBranch(repo, { op: "create", destination: "feature/prefix" });
    assert.equal(preflight.ok, false);
    if (!preflight.ok) assert.equal(preflight.code, "dirty_worktree");
  });

  it("treats staged hydrate-cache metadata as dirty", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    await mkdir(path.join(repo, ".bryantlabs", "semantic-index"), { recursive: true });
    await writeFile(path.join(repo, ".bryantlabs", "semantic-index", "v1.json"), "{}\n", "utf8");
    await git(repo, ["add", ".bryantlabs/semantic-index/v1.json"]);
    const staged = await prepareGitBranch(repo, { op: "create", destination: "feature/staged-index" });
    assert.equal(staged.ok, false);
    if (!staged.ok) assert.equal(staged.code, "dirty_worktree");
  });

  it("refuses rename pairs with spaces without mutation", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const before = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
    await git(repo, ["mv", "README.md", "read me.md"]);
    const renamed = await prepareGitBranch(repo, { op: "create", destination: "feature/rename" });
    assert.equal(renamed.ok, false);
    if (!renamed.ok) assert.equal(renamed.code, "dirty_worktree");
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), before);
  });

  it("does not switch to a remote-tracking name", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    await git(repo, ["update-ref", "refs/remotes/origin/feature/existing", "HEAD"]);
    const remote = await prepareGitBranch(repo, { op: "switch", destination: "origin/feature/existing" });
    assert.equal(remote.ok, false);
    if (!remote.ok) assert.equal(remote.code, "invalid_branch");
  });

  it("rejects expired and replayed tokens", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const now = Date.now();
    const preflight = await prepareGitBranch(
      repo,
      { op: "create", destination: "feature/expired" },
      { now, ttlMs: 1, ownerId: 7 },
    );
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const expired = await executeApprovedGitBranch(repo, preflight.token, { now: now + 50, ownerId: 7 });
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.code, "token_expired");
    const replay = await executeApprovedGitBranch(repo, preflight.token, { ownerId: 7 });
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.code, "token_invalid");
  });

  it("does not let another window owner consume a token", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const preflight = await prepareGitBranch(
      repo,
      { op: "create", destination: "feature/owner" },
      { ownerId: 1 },
    );
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const stolen = await executeApprovedGitBranch(repo, preflight.token, { ownerId: 2 });
    assert.equal(stolen.ok, false);
    if (!stolen.ok) assert.equal(stolen.code, "token_invalid");
    revokeGitBranchOwner(1);
    const afterDestroy = await executeApprovedGitBranch(repo, preflight.token, { ownerId: 1 });
    assert.equal(afterDestroy.ok, false);
  });

  it("aborts spawn when the open project is no longer the token root", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const preflight = await prepareGitBranch(repo, { op: "create", destination: "feature/moved-root" });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitBranch(repo, preflight.token, {
      isStillOpenRoot: () => false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "cancelled");
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), "main");
  });

  it("clears an in-flight process before a later operation can begin", async () => {
    await clearGitBranchSession();
    const { repo } = await makeRepo();
    const hung = runProductGit(repo, ["cat-file", "--batch"], { timeoutMs: 8_000, trackTree: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await clearGitBranchSession();
    const listed = await listLocalGitBranches(repo);
    assert.equal(listed.ok, true);
    const hungResult = await hung;
    assert.equal(hungResult.timedOut || hungResult.code !== 0, true);
  });

  it("isolates Git config files for branch operations without changing push env", () => {
    const pushEnv = buildGitPushEnv();
    const branchEnv = buildProductGitEnv({ isolateConfigFiles: true });
    assert.equal(pushEnv.GIT_CONFIG_NOSYSTEM, undefined);
    assert.equal(branchEnv.GIT_CONFIG_NOSYSTEM, "1");
    assert.equal(branchEnv.GIT_CONFIG_GLOBAL, "/dev/null");
    assert.equal(branchEnv.GIT_TERMINAL_PROMPT, "0");
  });

  it("ignores a repository alias.switch override", async () => {
    await clearGitBranchSession();
    const { repo, feature } = await makeRepo();
    const sentinel = path.join(repo, "ALIAS_RAN");
    await git(repo, ["config", "alias.switch", `!touch "${sentinel}"`]);
    const preflight = await prepareGitBranch(repo, { op: "switch", destination: feature });
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitBranch(repo, preflight.token);
    assert.equal(result.ok, true);
    assert.equal(existsSync(sentinel), false);
    assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), feature);
  });
});

