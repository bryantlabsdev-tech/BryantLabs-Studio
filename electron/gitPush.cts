import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { buildSafePath } from "./processSpawn.cjs";
import { terminateTrackedPids } from "./processTree.cjs";
import { isCanonicalPathWithinRoot } from "./fileWriter.cjs";
import {
  GIT_PUSH_ENV_DROP,
  GIT_PUSH_ENV_KEEP,
  GIT_PUSH_MAX_TOKENS,
  GIT_PUSH_PREFLIGHT_TTL_MS,
  GIT_PUSH_REMOTE,
  GIT_PUSH_TIMEOUT_MS,
  MAX_PUSH_COMMIT_SUBJECTS,
  MAX_PUSH_OUTPUT_CHARS,
  boundCommitSubjects,
  buildGitPushArgs,
  classifyGitPushFailure,
  envKeyLooksUnsafe,
  failureMessage,
  gitSafeConfigPrefix,
  isProtectedDefaultBranch,
  isSafeGitBranchName,
  redactSensitiveText,
  sanitizeGitRemoteUrl,
  type GitPushExecuteResult,
  type GitPushFailureCode,
  type GitPushPreflightErr,
  type GitPushPreflightResult,
} from "./gitPushPolicy.cjs";

export {
  GIT_HOOKS_DISABLED_PATH,
  GIT_PUSH_ENV_DROP,
  GIT_PUSH_ENV_KEEP,
  GIT_PUSH_MAX_TOKENS,
  GIT_PUSH_PREFLIGHT_TTL_MS,
  GIT_PUSH_REMOTE,
  GIT_PUSH_TIMEOUT_MS,
  MAX_PUSH_COMMIT_SUBJECTS,
  MAX_PUSH_OUTPUT_CHARS,
  MAX_PUSH_SUBJECT_CHARS,
  boundCommitSubjects,
  buildGitPushArgs,
  classifyGitPushFailure,
  envKeyLooksUnsafe,
  failureMessage,
  gitPushRefspec,
  gitSafeConfigPrefix,
  isProtectedDefaultBranch,
  isSafeGitBranchName,
  redactSensitiveText,
  sanitizeGitRemoteUrl,
} from "./gitPushPolicy.cjs";
export type {
  GitPushCommitSubject,
  GitPushExecuteErr,
  GitPushExecuteOk,
  GitPushExecuteResult,
  GitPushFailureCode,
  GitPushPreflightErr,
  GitPushPreflightOk,
  GitPushPreflightResult,
} from "./gitPushPolicy.cjs";

interface TokenRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly canonicalRoot: string;
  readonly branch: string;
  readonly headSha: string;
  readonly originUrl: string;
  readonly setUpstream: boolean;
  readonly defaultBranch: string | null;
}

interface GitRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

const PROGRESS_MARKERS = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
] as const;

const tokens = new Map<string, TokenRecord>();
let pushInFlight = false;
let activePushPid: number | null = null;

export function gitPushAllowsLocalRemotes(): boolean {
  return (
    process.env.BRYANTLABS_MOCK_PROVIDER === "1" ||
    process.env.VITE_BRYANTLABS_E2E === "1" ||
    process.env.BRYANTLABS_GIT_PUSH_ALLOW_LOCAL === "1"
  );
}

/**
 * Minimal environment for product-managed Git.
 * Keeps PATH/HOME/locale/tmp and SSH agent sockets so `ssh` and OS credential
 * helpers can run. Drops GIT_SSH_COMMAND, GIT_ASKPASS, GIT_CONFIG_*, GIT_DIR,
 * pager/editor, and trace variables. Values from this object are never copied
 * into UI errors.
 */
/** Sanitized spawn env for product-managed Git. Push keeps system/global config for credential helpers. */
export function buildProductGitEnv(options?: {
  readonly isolateConfigFiles?: boolean;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of GIT_PUSH_ENV_KEEP) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) env[key] = value;
  }
  env.PATH = buildSafePath(process.env.PATH);
  for (const key of [...Object.keys(env)]) {
    if (envKeyLooksUnsafe(key) || GIT_PUSH_ENV_DROP.includes(key as (typeof GIT_PUSH_ENV_DROP)[number])) {
      delete env[key];
    }
  }
  env.GIT_TERMINAL_PROMPT = "0";
  if (options?.isolateConfigFiles) {
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CONFIG_GLOBAL = "/dev/null";
    env.GIT_CONFIG_SYSTEM = "/dev/null";
  }
  return env;
}

export function buildGitPushEnv(): NodeJS.ProcessEnv {
  return buildProductGitEnv();
}

function fail(code: GitPushFailureCode): GitPushPreflightErr {
  return { ok: false, code, message: failureMessage(code) };
}

function failExec(code: GitPushFailureCode): GitPushExecuteResult {
  return { ok: false, code, message: failureMessage(code) };
}

function prependGit(args: readonly string[], allowLocalRemotes: boolean): string[] {
  return [...gitSafeConfigPrefix(allowLocalRemotes), ...args];
}

function runGit(
  root: string,
  args: readonly string[],
  options?: { readonly timeoutMs?: number; readonly trackTree?: boolean },
): Promise<GitRun> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: GitRun) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn("git", [...args], {
      cwd: root,
      env: buildGitPushEnv(),
      windowsHide: true,
      shell: false,
    });
    if (options?.trackTree && typeof child.pid === "number") {
      activePushPid = child.pid;
    }
    const timeoutMs = options?.timeoutMs ?? 15_000;
    const timer = setTimeout(() => {
      timedOut = true;
      const pid = child.pid;
      if (typeof pid === "number") {
        void terminateTrackedPids([pid], { termGraceMs: 200 }).finally(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* already gone */
          }
        });
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    const take = (chunk: Buffer, dest: "out" | "err") => {
      if (dest === "out") {
        const remaining = MAX_PUSH_OUTPUT_CHARS - stdout.length;
        if (remaining <= 0) return;
        stdout += chunk.subarray(0, remaining).toString("utf8");
        return;
      }
      const remaining = MAX_PUSH_OUTPUT_CHARS - stderr.length;
      if (remaining <= 0) return;
      stderr += chunk.subarray(0, remaining).toString("utf8");
    };
    child.stdout?.on("data", (chunk: Buffer) => take(chunk, "out"));
    child.stderr?.on("data", (chunk: Buffer) => take(chunk, "err"));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (options?.trackTree) activePushPid = null;
      finish({
        code: 1,
        stdout: "",
        stderr: redactSensitiveText(err.message),
        timedOut: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (options?.trackTree) activePushPid = null;
      finish({
        code: timedOut ? 1 : (code ?? 1),
        stdout: stdout.slice(0, MAX_PUSH_OUTPUT_CHARS),
        stderr: stderr.slice(0, MAX_PUSH_OUTPUT_CHARS),
        timedOut,
      });
    });
  });
}

async function gitOk(
  root: string,
  args: readonly string[],
  allowLocalRemotes: boolean,
): Promise<string | null> {
  const result = await runGit(root, prependGit(args, allowLocalRemotes));
  if (result.timedOut || result.code !== 0) return null;
  return result.stdout.trim();
}

function pruneTokens(now: number): void {
  for (const [id, record] of tokens) {
    if (record.expiresAt < now) tokens.delete(id);
  }
  while (tokens.size > GIT_PUSH_MAX_TOKENS) {
    const oldest = [...tokens.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    tokens.delete(oldest.id);
  }
}

export function clearGitPushSession(): void {
  tokens.clear();
  pushInFlight = false;
  const pid = activePushPid;
  activePushPid = null;
  if (typeof pid === "number") {
    void terminateTrackedPids([pid], { termGraceMs: 200 });
  }
}

export function cancelGitPushToken(tokenId: string): void {
  if (typeof tokenId === "string" && tokenId.length > 0) {
    tokens.delete(tokenId);
  }
}

async function operationInProgress(root: string, allowLocalRemotes: boolean): Promise<boolean> {
  const gitDir = await gitOk(root, ["rev-parse", "--git-dir"], allowLocalRemotes);
  if (!gitDir) return true;
  const abs = path.resolve(root, gitDir);
  for (const marker of PROGRESS_MARKERS) {
    try {
      await fs.access(path.join(abs, marker));
      return true;
    } catch {
      /* missing */
    }
  }
  for (const dir of ["rebase-merge", "rebase-apply"] as const) {
    try {
      const st = await fs.stat(path.join(abs, dir));
      if (st.isDirectory()) return true;
    } catch {
      /* missing */
    }
  }
  return false;
}

export async function detectDefaultBranch(
  root: string,
  allowLocalRemotes = false,
): Promise<string | null> {
  const originHead = await gitOk(
    root,
    ["symbolic-ref", "--quiet", "--end-of-options", "refs/remotes/origin/HEAD"],
    allowLocalRemotes,
  );
  const originMatch = originHead?.match(/^refs\/remotes\/origin\/(.+)$/);
  if (originMatch?.[1] && isSafeGitBranchName(originMatch[1])) return originMatch[1];

  const localDefault = await gitOk(
    root,
    ["config", "--local", "--get", "init.defaultBranch"],
    allowLocalRemotes,
  );
  if (localDefault && isSafeGitBranchName(localDefault)) return localDefault;

  if (
    (await gitOk(
      root,
      ["show-ref", "--verify", "--quiet", "--end-of-options", "refs/heads/main"],
      allowLocalRemotes,
    )) !== null
  ) {
    return "main";
  }
  if (
    (await gitOk(
      root,
      ["show-ref", "--verify", "--quiet", "--end-of-options", "refs/heads/master"],
      allowLocalRemotes,
    )) !== null
  ) {
    return "master";
  }
  return null;
}

interface Snapshot {
  readonly canonicalRoot: string;
  readonly identity: string;
  readonly branch: string;
  readonly headSha: string;
  readonly originUrl: string;
  readonly originDisplay: string;
  readonly networkMayBeRequired: boolean;
  readonly upstream: string | null;
  readonly setUpstream: boolean;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly commitCount: number;
  readonly commitSubjects: readonly { readonly subject: string }[];
  readonly dirty: boolean;
  readonly defaultBranch: string | null;
}

async function inspectPushSnapshot(
  root: string,
  allowLocalRemotes: boolean,
): Promise<{ ok: true; snapshot: Snapshot } | GitPushPreflightErr> {
  if (typeof root !== "string" || root.length === 0) {
    return fail("no_project");
  }

  const inside = await gitOk(root, ["rev-parse", "--is-inside-work-tree"], allowLocalRemotes);
  if (inside !== "true") return fail("not_a_worktree");

  const toplevel = await gitOk(root, ["rev-parse", "--show-toplevel"], allowLocalRemotes);
  if (!toplevel) return fail("not_a_worktree");
  if (!isCanonicalPathWithinRoot(root, toplevel)) return fail("outside_root");
  let canonicalRoot: string;
  let projectResolved: string;
  try {
    canonicalRoot = realpathSync(toplevel);
    projectResolved = realpathSync(root);
  } catch {
    return fail("outside_root");
  }
  if (canonicalRoot !== projectResolved) return fail("outside_root");

  if (await operationInProgress(root, allowLocalRemotes)) return fail("operation_in_progress");

  const headSha = await gitOk(root, ["rev-parse", "--verify", "--end-of-options", "HEAD"], allowLocalRemotes);
  if (!headSha) return fail("unborn_head");

  const symbolic = await gitOk(root, ["symbolic-ref", "--quiet", "--end-of-options", "HEAD"], allowLocalRemotes);
  if (!symbolic) return fail("detached_head");
  const branchMatch = symbolic.match(/^refs\/heads\/(.+)$/);
  const branch = branchMatch?.[1] ?? "";
  if (!isSafeGitBranchName(branch)) return fail("invalid_branch");
  const checkRef = await gitOk(root, ["check-ref-format", "--branch", branch], allowLocalRemotes);
  if (checkRef !== branch) return fail("invalid_branch");

  const detectedDefault = await detectDefaultBranch(root, allowLocalRemotes);
  if (isProtectedDefaultBranch(branch, detectedDefault)) return fail("default_branch");

  const originUrl = await gitOk(root, ["remote", "get-url", GIT_PUSH_REMOTE], allowLocalRemotes);
  if (!originUrl) return fail("no_origin");
  const pushUrl = await gitOk(root, ["remote", "get-url", "--push", GIT_PUSH_REMOTE], allowLocalRemotes);
  if (pushUrl && pushUrl !== originUrl) return fail("unsafe_remote");
  const rewritten = await gitOk(root, ["ls-remote", "--get-url", GIT_PUSH_REMOTE], allowLocalRemotes);
  if (rewritten && rewritten !== originUrl) return fail("unsafe_remote");
  const insteadOf = await gitOk(
    root,
    ["config", "--get-regexp", String.raw`^url\..*\.insteadof$`],
    allowLocalRemotes,
  );
  if (insteadOf) return fail("unsafe_remote");
  const remoteVcs = await gitOk(root, ["config", "--get", "remote.origin.vcs"], allowLocalRemotes);
  if (remoteVcs) return fail("unsafe_remote");
  const sanitized = sanitizeGitRemoteUrl(originUrl, { allowLocalRemotes });
  if (!sanitized.ok) return fail("unsafe_remote");

  const upstreamRaw = await gitOk(
    root,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    allowLocalRemotes,
  );
  let setUpstream = true;
  let upstream: string | null = null;
  if (upstreamRaw) {
    if (upstreamRaw !== `${GIT_PUSH_REMOTE}/${branch}`) {
      return fail("mismatched_upstream");
    }
    upstream = upstreamRaw;
    setUpstream = false;
  }

  const tracking = `${GIT_PUSH_REMOTE}/${branch}`;
  const trackingExists =
    (await gitOk(
      root,
      ["rev-parse", "--verify", "--quiet", "--end-of-options", tracking],
      allowLocalRemotes,
    )) !== null;

  let ahead: number | null = null;
  let behind: number | null = null;
  let commitCount = 0;
  let subjectSource = "HEAD";
  if (trackingExists) {
    const counts = await gitOk(
      root,
      ["rev-list", "--left-right", "--count", "--end-of-options", `${tracking}...HEAD`],
      allowLocalRemotes,
    );
    if (counts) {
      const [left, right] = counts.split(/\s+/);
      behind = Number.parseInt(left ?? "0", 10);
      ahead = Number.parseInt(right ?? "0", 10);
      if (!Number.isFinite(behind)) behind = null;
      if (!Number.isFinite(ahead)) ahead = null;
    }
    commitCount = ahead ?? 0;
    subjectSource = `${tracking}..HEAD`;
  } else {
    const countRaw = await gitOk(
      root,
      ["rev-list", "--count", "--end-of-options", "HEAD"],
      allowLocalRemotes,
    );
    commitCount = Number.parseInt(countRaw ?? "0", 10) || 0;
    ahead = commitCount;
    behind = null;
  }

  if (commitCount <= 0) return fail("nothing_to_push");

  const logOut = await gitOk(
    root,
    ["log", "--format=%s", "-n", String(MAX_PUSH_COMMIT_SUBJECTS), "--end-of-options", subjectSource],
    allowLocalRemotes,
  );
  const subjects = boundCommitSubjects(
    (logOut ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  const porcelain = await gitOk(
    root,
    ["status", "--porcelain=v1", "-u", "--no-renames"],
    allowLocalRemotes,
  );
  const dirty = Boolean(porcelain && porcelain.length > 0);

  return {
    ok: true,
    snapshot: {
      canonicalRoot,
      identity: path.basename(canonicalRoot),
      branch,
      headSha,
      originUrl,
      originDisplay: sanitized.display,
      networkMayBeRequired: sanitized.networkMayBeRequired,
      upstream,
      setUpstream,
      ahead,
      behind,
      commitCount,
      commitSubjects: subjects,
      dirty,
      defaultBranch: detectedDefault,
    },
  };
}

export async function prepareGitPush(
  root: string,
  options?: { readonly ttlMs?: number; readonly now?: number; readonly allowLocalRemotes?: boolean },
): Promise<GitPushPreflightResult> {
  const now = options?.now ?? Date.now();
  const allowLocalRemotes = Boolean(options?.allowLocalRemotes);
  pruneTokens(now);
  const inspected = await inspectPushSnapshot(root, allowLocalRemotes);
  if (!inspected.ok) return inspected;
  const ttl = options?.ttlMs ?? GIT_PUSH_PREFLIGHT_TTL_MS;
  const id = randomBytes(16).toString("hex");
  tokens.set(id, {
    id,
    createdAt: now,
    expiresAt: now + Math.max(0, ttl),
    canonicalRoot: inspected.snapshot.canonicalRoot,
    branch: inspected.snapshot.branch,
    headSha: inspected.snapshot.headSha,
    originUrl: inspected.snapshot.originUrl,
    setUpstream: inspected.snapshot.setUpstream,
    defaultBranch: inspected.snapshot.defaultBranch,
  });
  pruneTokens(now);
  return {
    ok: true,
    token: id,
    identity: inspected.snapshot.identity,
    originDisplay: inspected.snapshot.originDisplay,
    branch: inspected.snapshot.branch,
    upstream: inspected.snapshot.upstream,
    ahead: inspected.snapshot.ahead,
    behind: inspected.snapshot.behind,
    commitCount: inspected.snapshot.commitCount,
    commitSubjects: inspected.snapshot.commitSubjects,
    dirty: inspected.snapshot.dirty,
    dirtyWarning: inspected.snapshot.dirty
      ? "Local tracked or untracked changes are not included in this push."
      : null,
    networkMayBeRequired: inspected.snapshot.networkMayBeRequired,
    setUpstream: inspected.snapshot.setUpstream,
  };
}

function resolveCanonicalRoot(root: string): string | null {
  try {
    return realpathSync(root);
  } catch {
    return null;
  }
}

export async function executeApprovedGitPush(
  root: string,
  tokenId: string,
  options?: {
    readonly now?: number;
    readonly allowLocalRemotes?: boolean;
    readonly timeoutMs?: number;
  },
): Promise<GitPushExecuteResult> {
  if (pushInFlight) return failExec("push_already_active");
  if (typeof tokenId !== "string" || tokenId.length < 16) return failExec("token_invalid");
  const allowLocalRemotes = Boolean(options?.allowLocalRemotes);
  const currentRoot = resolveCanonicalRoot(root);
  const record = tokens.get(tokenId);
  if (!record || !currentRoot || record.canonicalRoot !== currentRoot) {
    return failExec("token_invalid");
  }

  pushInFlight = true;
  try {
    const now = options?.now ?? Date.now();
    tokens.delete(tokenId);
    pruneTokens(now);
    if (record.expiresAt <= now) return failExec("token_expired");

    const inspected = await inspectPushSnapshot(root, allowLocalRemotes);
    if (!inspected.ok) {
      return failExec(
        inspected.code === "nothing_to_push" || inspected.code === "non_fast_forward"
          ? inspected.code
          : inspected.code === "operation_in_progress"
            ? "operation_in_progress"
            : "branch_or_head_changed",
      );
    }
    const snap = inspected.snapshot;
    if (
      snap.canonicalRoot !== record.canonicalRoot ||
      snap.branch !== record.branch ||
      snap.headSha !== record.headSha ||
      snap.originUrl !== record.originUrl ||
      snap.setUpstream !== record.setUpstream ||
      snap.defaultBranch !== record.defaultBranch
    ) {
      return failExec("branch_or_head_changed");
    }

    const args = buildGitPushArgs({
      branch: snap.branch,
      setUpstream: snap.setUpstream,
      allowLocalRemotes,
    });
    const ran = await runGit(root, args, {
      timeoutMs: options?.timeoutMs ?? GIT_PUSH_TIMEOUT_MS,
      trackTree: true,
    });
    if (ran.timedOut) return failExec("timeout");
    if (ran.code !== 0) {
      const code = classifyGitPushFailure({
        timedOut: ran.timedOut,
        stdout: redactSensitiveText(ran.stdout),
        stderr: redactSensitiveText(ran.stderr),
      });
      return failExec(code);
    }
    return {
      ok: true,
      branch: snap.branch,
      setUpstream: snap.setUpstream,
      summary: "Push completed.",
    };
  } finally {
    pushInFlight = false;
    activePushPid = null;
  }
}
