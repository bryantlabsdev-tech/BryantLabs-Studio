import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, chmod, mkdir, symlink, readFile, rm, link, realpath } from "node:fs/promises";
import * as path from "node:path";
import { writeBryantlabsJson } from "./safeFs.cjs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { buildProductGitEnv } from "./gitPush.cjs";
import {
  buildGitWorktreeAddArgs,
  buildGitWorktreeRemoveArgs,
  cancelGitWorktreeToken,
  clearGitWorktreeSession,
  executeApprovedGitWorktreeCreate,
  executeApprovedGitWorktreeRemove,
  listStudioWorktrees,
  parseWorktreePorcelainZ,
  peekGitWorktreeTokenForTests,
  prepareGitWorktreeCreate,
  prepareGitWorktreeRemove,
  resetWorktreeRuntimeForTests,
  resolveGitWorktreeOpen,
  revokeGitWorktreeOwner,
  setWorktreeRuntimeForTests,
  shouldPersistBryantlabsRelative,
} from "./gitWorktree.cjs";

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

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "bl-wt-repo-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await writeFile(path.join(repo, "README.md"), "one\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init"]);
  return repo;
}

async function withRuntime<T>(fn: (ctx: { managedRoot: string; recordsDir: string; repo: string }) => Promise<T>): Promise<T> {
  await clearGitWorktreeSession();
  const repo = await makeRepo();
  const managedRoot = await mkdtemp(path.join(tmpdir(), "bl-wt-managed-"));
  const recordsDir = await mkdtemp(path.join(tmpdir(), "bl-wt-records-"));
  setWorktreeRuntimeForTests({
    managedRoot,
    recordsDir,
    hmacSecret: randomBytes(32),
  });
  try {
    return await fn({ managedRoot, recordsDir, repo });
  } finally {
    await clearGitWorktreeSession();
    resetWorktreeRuntimeForTests();
  }
}

describe("studio-managed git worktrees", () => {
  it("creates a clean worktree from exact HEAD and lists it as studio-owned", async () => {
    await withRuntime(async ({ repo, managedRoot }) => {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const preflight = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/isolated" });
      assert.equal(preflight.ok, true);
      if (!preflight.ok) return;
      const result = await executeApprovedGitWorktreeCreate(repo, preflight.token);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(await git(repo, ["rev-parse", "HEAD"]), head);
      assert.equal(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), "main");
      const listed = await listStudioWorktrees(repo);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      const studio = listed.entries.find((entry) => entry.kind === "studio");
      assert.ok(studio);
      assert.equal(studio?.branch, "feature/isolated");
      assert.equal(studio?.canRemove, true);
      const trees = await git(repo, ["worktree", "list", "--porcelain"]);
      assert.equal(trees.includes(managedRoot), true);
      assert.equal(await git(repo, ["rev-parse", "feature/isolated"]), head);
    });
  });

  it("cancel leaves no token mutation artifacts", async () => {
    await withRuntime(async ({ repo, managedRoot }) => {
      const beforeRefs = await git(repo, ["show-ref"]);
      const preflight = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/cancelled" });
      assert.equal(preflight.ok, true);
      if (!preflight.ok) return;
      cancelGitWorktreeToken(preflight.token);
      const replay = await executeApprovedGitWorktreeCreate(repo, preflight.token);
      assert.equal(replay.ok, false);
      assert.equal(await git(repo, ["show-ref"]), beforeRefs);
      assert.equal((await git(repo, ["worktree", "list"])).split("\n").length, 1);
      const leftover = await readFile(managedRoot).catch(() => "dir");
      void leftover;
    });
  });

  it("rejects invalid, colliding, and case-colliding branch names", async () => {
    await withRuntime(async ({ repo }) => {
      await git(repo, ["branch", "feature/Keep"]);
      for (const destinationBranch of ["-c", "--force", "HEAD", "origin/main", "feat;rm"]) {
        const result = await prepareGitWorktreeCreate(repo, { destinationBranch });
        assert.equal(result.ok, false, destinationBranch);
      }
      const exists = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/Keep" });
      assert.equal(exists.ok, false);
      const folded = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/keep" });
      assert.equal(folded.ok, false);
    });
  });

  it("uses the same dirty policy as branch management", async () => {
    await withRuntime(async ({ repo }) => {
      await writeFile(path.join(repo, "dirty.txt"), "x\n", "utf8");
      const untracked = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/d" });
      assert.equal(untracked.ok, false);
      if (!untracked.ok) assert.equal(untracked.code, "dirty_worktree");
      await git(repo, ["add", "dirty.txt"]);
      const staged = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/d" });
      assert.equal(staged.ok, false);
      await mkdir(path.join(repo, ".bryantlabs", "semantic-index"), { recursive: true });
      await mkdir(path.join(repo, ".bryantlabs", "scan-manifest"), { recursive: true });
      await git(repo, ["restore", "--staged", "dirty.txt"]);
      await rm(path.join(repo, "dirty.txt"));
      await writeFile(path.join(repo, ".bryantlabs", "session-memory.json"), "{}\n", "utf8");
      await writeFile(path.join(repo, ".bryantlabs", "semantic-index", "v1.json"), "{}\n", "utf8");
      await writeFile(path.join(repo, ".bryantlabs", "scan-manifest", "v1.json"), "{}\n", "utf8");
      const allowed = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/meta" });
      assert.equal(allowed.ok, true);
      await writeFile(path.join(repo, ".bryantlabs", "mcp.json"), "{}\n", "utf8");
      const mcp = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/mcp" });
      assert.equal(mcp.ok, false);
    });
  });

  it("refuses detached, unborn, and in-progress repositories", async () => {
    await withRuntime(async ({ repo }) => {
      await git(repo, ["checkout", "--detach", "HEAD"]);
      const detached = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/d" });
      assert.equal(detached.ok, false);
      if (!detached.ok) assert.equal(detached.code, "detached_head");
    });
    const unborn = await mkdtemp(path.join(tmpdir(), "bl-wt-unborn-"));
    await git(unborn, ["init", "-b", "main"]);
    const managedRoot = await mkdtemp(path.join(tmpdir(), "bl-wt-managed-"));
    const recordsDir = await mkdtemp(path.join(tmpdir(), "bl-wt-records-"));
    setWorktreeRuntimeForTests({ managedRoot, recordsDir, hmacSecret: randomBytes(32) });
    const unbornResult = await prepareGitWorktreeCreate(unborn, { destinationBranch: "feature/u" });
    assert.equal(unbornResult.ok, false);
    await clearGitWorktreeSession();
    resetWorktreeRuntimeForTests();
  });

  it("lists external worktrees as read-only", async () => {
    await withRuntime(async ({ repo }) => {
      const extra = await mkdtemp(path.join(tmpdir(), "bl-wt-ext-"));
      await git(repo, ["worktree", "add", extra, "-b", "feature/external"]);
      const listed = await listStudioWorktrees(repo);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      const ext = listed.entries.find((entry) => entry.branch === "feature/external");
      assert.equal(ext?.kind, "external");
      assert.equal(ext?.canRemove, false);
      assert.equal(ext?.canOpen, true);
    });
  });

  it("fails closed on malformed porcelain", () => {
    assert.equal(parseWorktreePorcelainZ("worktree /x\0HEAD notasha\0", false).ok, false);
    assert.equal(parseWorktreePorcelainZ("", false).ok, false);
  });

  it("rolls back a partial create without deleting pre-existing data", async () => {
    await withRuntime(async ({ repo, recordsDir, managedRoot }) => {
      const keep = path.join(managedRoot, "keep-me");
      await writeFile(keep, "keep\n", "utf8");
      await git(repo, ["branch", "feature/preexisting"]);
      const preflight = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/rollback" });
      assert.equal(preflight.ok, true);
      if (!preflight.ok) return;
      await chmod(recordsDir, 0o400);
      const result = await executeApprovedGitWorktreeCreate(repo, preflight.token);
      await chmod(recordsDir, 0o700);
      assert.equal(result.ok, false);
      const refs = await git(repo, ["show-ref", "--heads"]);
      assert.equal(refs.includes("refs/heads/feature/rollback"), false);
      assert.equal(refs.includes("refs/heads/feature/preexisting"), true);
      assert.equal(await readFile(keep, "utf8"), "keep\n");
    });
  });

  it("rejects cross-owner, expired, and replayed tokens", async () => {
    await withRuntime(async ({ repo }) => {
      const preflight = await prepareGitWorktreeCreate(
        repo,
        { destinationBranch: "feature/owner" },
        { ownerId: 7, ttlMs: 1, now: 1_000 },
      );
      assert.equal(preflight.ok, true);
      if (!preflight.ok) return;
      const wrongOwner = await executeApprovedGitWorktreeCreate(repo, preflight.token, {
        ownerId: 8,
        now: 1_000,
      });
      assert.equal(wrongOwner.ok, false);
      const expired = await executeApprovedGitWorktreeCreate(repo, preflight.token, {
        ownerId: 7,
        now: 200_000,
      });
      assert.equal(expired.ok, false);
      const again = await executeApprovedGitWorktreeCreate(repo, preflight.token, { ownerId: 7, now: 1_000 });
      assert.equal(again.ok, false);
    });
  });

  it("revokes tokens on owner destroy and session clear", async () => {
    await withRuntime(async ({ repo }) => {
      const preflight = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/rev" }, { ownerId: 3 });
      assert.equal(preflight.ok, true);
      if (!preflight.ok) return;
      revokeGitWorktreeOwner(3);
      assert.equal(peekGitWorktreeTokenForTests(preflight.token), undefined);
      const next = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/rev2" }, { ownerId: 3 });
      assert.equal(next.ok, true);
      if (!next.ok) return;
      await clearGitWorktreeSession();
      const afterClear = await executeApprovedGitWorktreeCreate(repo, next.token, { ownerId: 3 });
      assert.equal(afterClear.ok, false);
    });
  });

  it("removes a clean managed worktree and keeps the branch", async () => {
    await withRuntime(async ({ repo, managedRoot }) => {
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/rm" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const made = await executeApprovedGitWorktreeCreate(repo, created.token);
      assert.equal(made.ok, true);
      if (!made.ok) return;
      const listed = await listStudioWorktrees(repo);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      const studio = listed.entries.find((entry) => entry.kind === "studio");
      assert.ok(studio);
      const preflight = await prepareGitWorktreeRemove(repo, { id: studio!.id });
      assert.equal(preflight.ok, true);
      if (!preflight.ok) return;
      const removed = await executeApprovedGitWorktreeRemove(repo, preflight.token);
      assert.equal(removed.ok, true);
      assert.equal((await git(repo, ["show-ref", "--heads"])).includes("refs/heads/feature/rm"), true);
      assert.equal((await git(repo, ["worktree", "list"])).includes(managedRoot), false);
    });
  });

  it("refuses removing the active, main, external, dirty, or missing worktree", async () => {
    await withRuntime(async ({ repo }) => {
      const extra = await mkdtemp(path.join(tmpdir(), "bl-wt-ext-"));
      await git(repo, ["worktree", "add", extra, "-b", "feature/ext2"]);
      const listed = await listStudioWorktrees(repo);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      const main = listed.entries.find((entry) => entry.kind === "main");
      const ext = listed.entries.find((entry) => entry.kind === "external");
      assert.ok(main && ext);
      const mainRm = await prepareGitWorktreeRemove(repo, { id: main!.id });
      assert.equal(mainRm.ok, false);
      const extRm = await prepareGitWorktreeRemove(repo, { id: ext!.id });
      assert.equal(extRm.ok, false);
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/active" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const made = await executeApprovedGitWorktreeCreate(repo, created.token);
      assert.equal(made.ok, true);
      if (!made.ok) return;
      const after = await listStudioWorktrees(repo);
      assert.equal(after.ok, true);
      if (!after.ok) return;
      const studio = after.entries.find((entry) => entry.kind === "studio");
      assert.ok(studio);
      const opened = await resolveGitWorktreeOpen(repo, { id: studio!.id });
      assert.equal(opened.ok, true);
      if (!opened.ok) return;
      const activeRm = await prepareGitWorktreeRemove(opened.path, { id: studio!.id });
      assert.equal(activeRm.ok, false);
    });
  });

  it("uses product git env, no force flags, and opaque paths", () => {
    const env = buildProductGitEnv({ isolateConfigFiles: true });
    assert.equal(env.GIT_TERMINAL_PROMPT, "0");
    assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
    const argv = buildGitWorktreeAddArgs(
      "feature/x",
      "/tmp/wt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0123456789abcdef0123456789abcdef01234567",
    );
    assert.equal(argv.includes("--force"), false);
    assert.equal(argv.includes("--no-checkout"), false);
    const remove = buildGitWorktreeRemoveArgs("/tmp/wt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(remove.includes("--force"), false);
  });

  it("refuses symlink worktree paths on remove", async () => {
    await withRuntime(async ({ repo, managedRoot }) => {
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/link" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const made = await executeApprovedGitWorktreeCreate(repo, created.token);
      assert.equal(made.ok, true);
      const listed = await listStudioWorktrees(repo);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      const studio = listed.entries.find((entry) => entry.kind === "studio");
      assert.ok(studio);
      const trees = (await git(repo, ["worktree", "list", "--porcelain"])).split("\n");
      const wtLine = trees.find((line) => line.startsWith("worktree ") && line.includes(managedRoot));
      assert.ok(wtLine);
      const wtPath = wtLine!.slice("worktree ".length);
      const outside = await mkdtemp(path.join(tmpdir(), "bl-wt-out-"));
      await rm(wtPath, { recursive: true, force: true });
      await symlink(outside, wtPath);
      const remove = await prepareGitWorktreeRemove(repo, { id: studio!.id });
      assert.equal(remove.ok, false);
    });
  });

  it("does not persist features.json into a managed worktree and remains removable", async () => {
    await withRuntime(async ({ repo }) => {
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/meta-open" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const made = await executeApprovedGitWorktreeCreate(repo, created.token);
      assert.equal(made.ok, true);
      const listed = await listStudioWorktrees(repo);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      const studio = listed.entries.find((entry) => entry.kind === "studio");
      assert.ok(studio);
      const opened = await resolveGitWorktreeOpen(repo, { id: studio!.id });
      assert.equal(opened.ok, true);
      if (!opened.ok) return;
      assert.equal(await shouldPersistBryantlabsRelative(opened.path, "features.json"), false);
      const features = await writeBryantlabsJson(opened.path, "features.json", { version: 1 }, "test-features");
      assert.equal(features.ok, false);
      assert.equal(existsSync(path.join(opened.path, ".bryantlabs", "features.json")), false);
      const session = await writeBryantlabsJson(opened.path, "session-memory.json", { version: 1, turns: [] }, "test-session");
      assert.equal(session.ok, true);
      const listedAfter = await listStudioWorktrees(repo);
      assert.equal(listedAfter.ok, true);
      if (!listedAfter.ok) return;
      const studioAfter = listedAfter.entries.find((entry) => entry.id === studio!.id);
      assert.equal(studioAfter?.dirty, false);
      assert.equal(studioAfter?.canRemove, true);
      const preflight = await prepareGitWorktreeRemove(repo, { id: studio!.id });
      assert.equal(preflight.ok, true);
      if (!preflight.ok) return;
      const removed = await executeApprovedGitWorktreeRemove(repo, preflight.token);
      assert.equal(removed.ok, true);
      assert.equal((await git(repo, ["show-ref", "--heads"])).includes("refs/heads/feature/meta-open"), true);
    });
  });

  it("creates from an external linked worktree HEAD into the managed root", async () => {
    await withRuntime(async ({ repo, managedRoot }) => {
      const extra = await mkdtemp(path.join(tmpdir(), "bl-wt-ext-"));
      await git(repo, ["worktree", "add", extra, "-b", "feature/from-link"]);
      const extraHead = await git(extra, ["rev-parse", "HEAD"]);
      const listedBefore = await listStudioWorktrees(extra);
      assert.equal(listedBefore.ok, true);
      if (!listedBefore.ok) return;
      assert.equal(listedBefore.entries.some((entry) => entry.active && entry.canRemove), false);
      const created = await prepareGitWorktreeCreate(extra, { destinationBranch: "feature/from-ext" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const made = await executeApprovedGitWorktreeCreate(extra, created.token);
      assert.equal(made.ok, true);
      const listed = await listStudioWorktrees(extra);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      const studio = listed.entries.find((entry) => entry.kind === "studio");
      assert.ok(studio);
      const trees = (await git(extra, ["worktree", "list", "--porcelain"])).split("\n");
      const wtLine = trees.find((line) => line.startsWith("worktree ") && line.includes(managedRoot));
      assert.ok(wtLine);
      const wtPath = wtLine!.slice("worktree ".length);
      const managedReal = await realpath(managedRoot);
      const wtReal = await realpath(wtPath);
      assert.equal(wtReal.startsWith(managedReal + path.sep), true);
      assert.equal(await git(wtPath, ["rev-parse", "HEAD"]), extraHead);
      assert.equal(await git(extra, ["rev-parse", "--abbrev-ref", "HEAD"]), "feature/from-link");
    });
  });

  it("rejects a replaced managed root before spawn", async () => {
    await withRuntime(async ({ repo, managedRoot }) => {
      const keep = path.join(managedRoot, "keep-me");
      await writeFile(keep, "keep\n", "utf8");
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/toctou" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const escape = await mkdtemp(path.join(tmpdir(), "bl-wt-escape-"));
      await writeFile(path.join(escape, "secret.txt"), "no\n", "utf8");
      await rm(managedRoot, { recursive: true, force: true });
      await symlink(escape, managedRoot);
      const made = await executeApprovedGitWorktreeCreate(repo, created.token);
      assert.equal(made.ok, false);
      assert.equal(await readFile(path.join(escape, "secret.txt"), "utf8"), "no\n");
      const refs = await git(repo, ["show-ref", "--heads"]);
      assert.equal(refs.includes("refs/heads/feature/toctou"), false);
    });
  });

  it("does not overwrite an existing ownership record", async () => {
    await withRuntime(async ({ repo, recordsDir }) => {
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/exclusive" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const token = peekGitWorktreeTokenForTests(created.token);
      assert.ok(token);
      const dest = path.join(recordsDir, `${token!.ownershipId}.json`);
      await writeFile(dest, "{\"preexisting\":true}\n", "utf8");
      const made = await executeApprovedGitWorktreeCreate(repo, created.token);
      assert.equal(made.ok, false);
      assert.equal(await readFile(dest, "utf8"), "{\"preexisting\":true}\n");
    });
  });

  it("rolls back when the project is no longer open after record creation", async () => {
    await withRuntime(async ({ repo }) => {
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/switch" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      let calls = 0;
      const made = await executeApprovedGitWorktreeCreate(repo, created.token, {
        isStillOpenRoot: () => {
          calls += 1;
          return calls < 2;
        },
      });
      assert.equal(made.ok, false);
      const refs = await git(repo, ["show-ref", "--heads"]);
      assert.equal(refs.includes("refs/heads/feature/switch"), false);
    });
  });

  it("fails closed on a hard-linked ownership record", async () => {
    await withRuntime(async ({ repo, recordsDir }) => {
      const created = await prepareGitWorktreeCreate(repo, { destinationBranch: "feature/nlink" });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const made = await executeApprovedGitWorktreeCreate(repo, created.token);
      assert.equal(made.ok, true);
      const names = (await import("node:fs/promises")).readdir;
      const files = (await names(recordsDir)).filter((name) => name.endsWith(".json"));
      assert.equal(files.length, 1);
      const dest = path.join(recordsDir, files[0]!);
      const alias = path.join(recordsDir, "alias-hardlink");
      await link(dest, alias);
      const listed = await listStudioWorktrees(repo);
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      assert.equal(listed.entries.some((entry) => entry.kind === "studio"), false);
    });
  });
});
