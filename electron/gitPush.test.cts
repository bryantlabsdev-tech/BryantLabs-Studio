import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import {
  buildGitPushArgs,
  buildGitPushEnv,
  cancelGitPushToken,
  classifyGitPushFailure,
  clearGitPushSession,
  executeApprovedGitPush,
  prepareGitPush,
  redactSensitiveText,
  sanitizeGitRemoteUrl,
} from "./gitPush.cjs";

const exec = promisify(execFile);
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.test",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.test",
};
const seam = { allowLocalRemotes: true as const };

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, env: gitEnv, encoding: "utf8" });
  return (stdout ?? "").trim();
}

async function listRefs(bare: string): Promise<string[]> {
  try {
    const out = await git(bare, ["show-ref", "--heads", "--tags"]);
    return out ? out.split("\n").map((line) => line.split(" ")[1] ?? "").filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function makePair(): Promise<{
  repo: string;
  bare: string;
  feature: string;
}> {
  const repo = await mkdtemp(path.join(tmpdir(), "bl-push-repo-"));
  const bare = await mkdtemp(path.join(tmpdir(), "bl-push-bare-"));
  await git(bare, ["init", "--bare"]);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await git(repo, ["config", "init.defaultBranch", "main"]);
  await writeFile(path.join(repo, "README.md"), "one\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init main"]);
  await git(repo, ["checkout", "-b", "feature/push-demo"]);
  await writeFile(path.join(repo, "feature.txt"), "feat\n", "utf8");
  await git(repo, ["add", "feature.txt"]);
  await git(repo, ["commit", "-m", "add feature"]);
  await git(repo, ["remote", "add", "origin", bare]);
  await git(repo, ["tag", "v-local-only"]);
  return { repo, bare, feature: "feature/push-demo" };
}

describe("git push policy vectors (electron copy)", () => {
  it("matches shared sanitize/classify/argv vectors", () => {
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
  });
});

describe("approval-gated git push", () => {
  it("establishes origin/<branch> on the first push and not tags or main", async () => {
    clearGitPushSession();
    const { repo, bare, feature } = await makePair();
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    assert.equal(preflight.branch, feature);
    assert.equal(preflight.setUpstream, true);
    assert.equal(preflight.networkMayBeRequired, false);
    assert.match(preflight.originDisplay, /^local:/);
    const before = await listRefs(bare);
    assert.deepEqual(before, []);
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, true);
    const refs = await listRefs(bare);
    assert.ok(refs.includes(`refs/heads/${feature}`));
    assert.equal(refs.includes("refs/heads/main"), false);
    assert.equal(refs.some((ref) => ref.startsWith("refs/tags/")), false);
    const upstream = await git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    assert.equal(upstream, `origin/${feature}`);
  });

  it("later push updates only the current branch without --force", async () => {
    clearGitPushSession();
    const { repo, bare, feature } = await makePair();
    const first = await prepareGitPush(repo, seam);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const pushed = await executeApprovedGitPush(repo, first.token, seam);
    assert.equal(pushed.ok, true);
    await writeFile(path.join(repo, "feature.txt"), "feat2\n", "utf8");
    await git(repo, ["add", "feature.txt"]);
    await git(repo, ["commit", "-m", "second"]);
    const second = await prepareGitPush(repo, seam);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.setUpstream, false);
    const result = await executeApprovedGitPush(repo, second.token, seam);
    assert.equal(result.ok, true);
    const sha = await git(repo, ["rev-parse", "HEAD"]);
    const remoteSha = await git(bare, ["rev-parse", feature]);
    assert.equal(sha, remoteSha);
  });

  it("cancel performs no remote update", async () => {
    clearGitPushSession();
    const { repo, bare } = await makePair();
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    cancelGitPushToken(preflight.token);
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "token_invalid");
    assert.deepEqual(await listRefs(bare), []);
  });

  it("tokens are single-use and expire", async () => {
    clearGitPushSession();
    const { repo, bare } = await makePair();
    const first = await prepareGitPush(repo, seam);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const ok = await executeApprovedGitPush(repo, first.token, seam);
    assert.equal(ok.ok, true);
    const reuse = await executeApprovedGitPush(repo, first.token, seam);
    assert.equal(reuse.ok, false);
    if (!reuse.ok) assert.equal(reuse.code, "token_invalid");

    await writeFile(path.join(repo, "feature.txt"), "feat3\n", "utf8");
    await git(repo, ["add", "feature.txt"]);
    await git(repo, ["commit", "-m", "third"]);
    const expired = await prepareGitPush(repo, { ...seam, ttlMs: 0 });
    assert.equal(expired.ok, true);
    if (!expired.ok) return;
    const late = await executeApprovedGitPush(repo, expired.token, seam);
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.code, "token_expired");
    const refs = await listRefs(bare);
    assert.equal(refs.length, 1);
  });

  it("invalidates approval when HEAD changes", async () => {
    clearGitPushSession();
    const { repo } = await makePair();
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    await writeFile(path.join(repo, "feature.txt"), "changed-head\n", "utf8");
    await git(repo, ["add", "feature.txt"]);
    await git(repo, ["commit", "-m", "head moved"]);
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "branch_or_head_changed");
  });

  it("does not let another project consume a token", async () => {
    clearGitPushSession();
    const a = await makePair();
    const b = await makePair();
    const preflight = await prepareGitPush(a.repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitPush(b.repo, preflight.token, seam);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "token_invalid");
    assert.deepEqual(await listRefs(b.bare), []);
    const still = await executeApprovedGitPush(a.repo, preflight.token, seam);
    assert.equal(still.ok, true);
  });

  it("session reset and renderer-style cleanup invalidate tokens", async () => {
    clearGitPushSession();
    const { repo, bare } = await makePair();
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    clearGitPushSession();
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "token_invalid");
    assert.deepEqual(await listRefs(bare), []);
  });

  it("rejects detached HEAD and default branch", async () => {
    clearGitPushSession();
    const { repo } = await makePair();
    await git(repo, ["checkout", "--detach", "HEAD"]);
    const detached = await prepareGitPush(repo, seam);
    assert.equal(detached.ok, false);
    if (!detached.ok) assert.equal(detached.code, "detached_head");

    await git(repo, ["checkout", "main"]);
    const def = await prepareGitPush(repo, seam);
    assert.equal(def.ok, false);
    if (!def.ok) assert.equal(def.code, "default_branch");
  });

  it("rejects a mismatched upstream", async () => {
    clearGitPushSession();
    const { repo, feature } = await makePair();
    const first = await prepareGitPush(repo, seam);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal((await executeApprovedGitPush(repo, first.token, seam)).ok, true);
    await git(repo, ["branch", `--set-upstream-to=origin/${feature}`]);
    await git(repo, ["checkout", "-b", "feature/other"]);
    await writeFile(path.join(repo, "other.txt"), "o\n", "utf8");
    await git(repo, ["add", "other.txt"]);
    await git(repo, ["commit", "-m", "other"]);
    await git(repo, ["branch", `--set-upstream-to=origin/${feature}`]);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, false);
    if (!preflight.ok) assert.equal(preflight.code, "mismatched_upstream");
  });

  it("warns on a dirty tree but still pushes commits", async () => {
    clearGitPushSession();
    const { repo, bare, feature } = await makePair();
    await writeFile(path.join(repo, "dirty.txt"), "unstaged\n", "utf8");
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    assert.equal(preflight.dirty, true);
    assert.match(preflight.dirtyWarning ?? "", /not included/);
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, true);
    assert.ok((await listRefs(bare)).includes(`refs/heads/${feature}`));
  });

  it("returns nothing-to-push after the branch is up to date", async () => {
    clearGitPushSession();
    const { repo } = await makePair();
    const first = await prepareGitPush(repo, seam);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal((await executeApprovedGitPush(repo, first.token, seam)).ok, true);
    const again = await prepareGitPush(repo, seam);
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.code, "nothing_to_push");
  });

  it("rejects non-fast-forward without force and consumes the token", async () => {
    clearGitPushSession();
    const { repo, feature } = await makePair();
    const first = await prepareGitPush(repo, seam);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal((await executeApprovedGitPush(repo, first.token, seam)).ok, true);
    await git(repo, ["reset", "--hard", "HEAD~1"]);
    await writeFile(path.join(repo, "feature.txt"), "diverged\n", "utf8");
    await git(repo, ["add", "feature.txt"]);
    await git(repo, ["commit", "-m", "diverge"]);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "non_fast_forward");
    const reuse = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(reuse.ok, false);
    if (!reuse.ok) assert.equal(reuse.code, "token_invalid");
    assert.equal(JSON.stringify(buildGitPushArgs({ branch: feature, setUpstream: false })).includes("force"), false);
  });

  it("rejects a duplicate concurrent push", async () => {
    clearGitPushSession();
    const { repo, bare } = await makePair();
    const hook = path.join(bare, "hooks", "pre-receive");
    await writeFile(hook, "#!/bin/sh\nsleep 2\n", "utf8");
    await chmod(hook, 0o755);
    const a = await prepareGitPush(repo, seam);
    const b = await prepareGitPush(repo, seam);
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    const [first, second] = await Promise.all([
      executeApprovedGitPush(repo, a.token, seam),
      executeApprovedGitPush(repo, b.token, seam),
    ]);
    const codes = [first, second].map((item) => (item.ok ? "ok" : item.code)).sort();
    assert.ok(codes.includes("ok"));
    assert.ok(codes.includes("push_already_active"));
  });

  it("does not execute local repository hooks", async () => {
    clearGitPushSession();
    const { repo, bare, feature } = await makePair();
    const hook = path.join(repo, ".git", "hooks", "pre-push");
    const sentinel = path.join(repo, "HOOK_RAN");
    await writeFile(hook, `#!/bin/sh\necho hooked > "${sentinel}"\n`, "utf8");
    await chmod(hook, 0o755);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, true);
    assert.equal(existsSync(sentinel), false);
    assert.ok((await listRefs(bare)).includes(`refs/heads/${feature}`));
  });

  it("rejects ext::, helper, credential, and control-character remotes", async () => {
    clearGitPushSession();
    const { repo } = await makePair();
    for (const url of [
      "ext::sh -c touch pwned",
      "foo::bar",
      "https://user:ghp_secretTOKEN12@example.test/org/repo.git",
      "https://github.com/org/repo.git\n-u",
    ]) {
      await git(repo, ["remote", "set-url", "origin", url]);
      const preflight = await prepareGitPush(repo, seam);
      assert.equal(preflight.ok, false, url);
      if (!preflight.ok) assert.equal(preflight.code, "unsafe_remote");
    }
  });

  it("rejects local remotes outside the test seam", async () => {
    clearGitPushSession();
    const { repo } = await makePair();
    const preflight = await prepareGitPush(repo);
    assert.equal(preflight.ok, false);
    if (!preflight.ok) assert.equal(preflight.code, "unsafe_remote");
  });

  it("strips dangerous Git environment variables", () => {
    const previous = process.env.GIT_SSH_COMMAND;
    process.env.GIT_SSH_COMMAND = "touch pwned";
    process.env.GIT_ASKPASS = "/tmp/askpass";
    process.env.GIT_DIR = "/tmp/not-a-repo";
    try {
      const env = buildGitPushEnv();
      assert.equal(env.GIT_SSH_COMMAND, undefined);
      assert.equal(env.GIT_ASKPASS, undefined);
      assert.equal(env.GIT_DIR, undefined);
      assert.equal(env.GIT_TERMINAL_PROMPT, "0");
      assert.equal(JSON.stringify(env).includes("touch pwned"), false);
    } finally {
      if (previous === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = previous;
      delete process.env.GIT_ASKPASS;
      delete process.env.GIT_DIR;
    }
  });

  it("does not run a repository alias or sshCommand on push", async () => {
    clearGitPushSession();
    const { repo, bare, feature } = await makePair();
    const pwned = path.join(repo, "PWNED");
    await git(repo, ["config", "alias.push", `!touch "${pwned}"`]);
    await git(repo, ["config", "core.sshCommand", `touch "${pwned}"`]);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, true);
    assert.equal(existsSync(pwned), false);
    assert.ok((await listRefs(bare)).includes(`refs/heads/${feature}`));
  });

  it("rejects url.insteadOf rewrite config", async () => {
    clearGitPushSession();
    const { repo } = await makePair();
    await git(repo, ["config", "url.https://evil.example/.insteadof", "placeholder"]);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, false);
    if (!preflight.ok) assert.equal(preflight.code, "unsafe_remote");
  });

  it("consumes the token on timeout and kills the receive hook", async () => {
    clearGitPushSession();
    const { repo, bare } = await makePair();
    const hook = path.join(bare, "hooks", "pre-receive");
    const finished = path.join(bare, "HOOK_FINISHED");
    await writeFile(
      hook,
      `#!/bin/sh\nsleep 20\ntouch "${finished}"\n`,
      "utf8",
    );
    await chmod(hook, 0o755);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const startedAt = Date.now();
    const result = await executeApprovedGitPush(repo, preflight.token, {
      ...seam,
      timeoutMs: 400,
    });
    assert.ok(Date.now() - startedAt < 8_000);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "timeout");
    const reuse = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(reuse.ok, false);
    if (!reuse.ok) assert.equal(reuse.code, "token_invalid");
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(existsSync(finished), false);
  });

  it("bounds remote hook output in the classified result", async () => {
    clearGitPushSession();
    const { repo, bare } = await makePair();
    const hook = path.join(bare, "hooks", "pre-receive");
    await writeFile(
      hook,
      `#!/bin/sh\nawk 'BEGIN{for(i=0;i<20000;i++)printf "AAAAAAAAAA"}' >&2\nexit 1\n`,
      "utf8",
    );
    await chmod(hook, 0o755);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, true);
    if (!preflight.ok) return;
    const result = await executeApprovedGitPush(repo, preflight.token, seam);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "generic_failure");
      assert.equal(result.message, "Push failed.");
      assert.ok(JSON.stringify(result).length < 400);
      assert.equal(result.message.includes("A".repeat(50)), false);
    }
  });

  it("does not turn hostile names into a shell command", () => {
    assert.throws(() => buildGitPushArgs({ branch: "x;touch /tmp/pwned", setUpstream: true }));
    const args = buildGitPushArgs({ branch: "feature/x", setUpstream: true });
    assert.equal(args.includes("-u"), false);
    assert.equal(args.some((part) => part.includes(" ")), false);
  });

  it("does not display credential-bearing origin URLs", async () => {
    clearGitPushSession();
    const { repo } = await makePair();
    await git(repo, [
      "remote",
      "set-url",
      "origin",
      "https://user:ghp_secretTOKEN12@example.test/org/repo.git",
    ]);
    const preflight = await prepareGitPush(repo, seam);
    assert.equal(preflight.ok, false);
    if (!preflight.ok) assert.equal(preflight.code, "unsafe_remote");
    const redacted = redactSensitiveText("https://user:ghp_secretTOKEN12@example.test/org/repo.git");
    assert.equal(redacted.includes("ghp_secret"), false);
  });
});
