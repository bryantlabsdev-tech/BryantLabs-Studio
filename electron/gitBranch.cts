import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { terminateTrackedPids } from "./processTree.cjs";
import { isCanonicalPathWithinRoot } from "./fileWriter.cjs";
import { buildProductGitEnv } from "./gitPush.cjs";
import {
  GIT_BRANCH_MAX_TOKENS,
  GIT_BRANCH_PREFLIGHT_TTL_MS,
  GIT_BRANCH_TIMEOUT_MS,
  MAX_BRANCH_OUTPUT_CHARS,
  MAX_LOCAL_BRANCHES,
  branchFailureMessage,
  buildGitBranchCreateArgs,
  buildGitBranchSwitchArgs,
  classifyGitBranchFailure,
  gitBranchSafeConfigPrefix,
  hasCaseInsensitiveBranchCollision,
  isSafeLocalBranchName,
  parseNulRefNames,
  porcelainV2IndicatesDirty,
  redactSensitiveText,
  type GitBranchExecuteResult,
  type GitBranchFailureCode,
  type GitBranchListResult,
  type GitBranchOp,
  type GitBranchPreflightErr,
  type GitBranchPreflightResult,
} from "./gitBranchPolicy.cjs";

export {
  GIT_BRANCH_MAX_TOKENS,
  GIT_BRANCH_PREFLIGHT_TTL_MS,
  GIT_BRANCH_TIMEOUT_MS,
  MAX_LOCAL_BRANCHES,
  STUDIO_RUNTIME_METADATA_PATHS,
  branchFailureMessage,
  buildGitBranchCreateArgs,
  buildGitBranchSwitchArgs,
  classifyGitBranchFailure,
  gitBranchSafeConfigPrefix,
  isSafeLocalBranchName,
  porcelainV2IndicatesDirty,
} from "./gitBranchPolicy.cjs";
export type {
  GitBranchExecuteErr,
  GitBranchExecuteOk,
  GitBranchExecuteResult,
  GitBranchFailureCode,
  GitBranchListErr,
  GitBranchListOk,
  GitBranchListResult,
  GitBranchOp,
  GitBranchPreflightErr,
  GitBranchPreflightOk,
  GitBranchPreflightResult,
} from "./gitBranchPolicy.cjs";

interface TokenRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly ownerId: number;
  readonly canonicalRoot: string;
  readonly currentBranch: string;
  readonly headSha: string;
  readonly dirty: boolean;
  readonly op: GitBranchOp;
  readonly destination: string;
}

interface GitRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

const PROGRESS_MARKERS = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
] as const;

const tokens = new Map<string, TokenRecord>();
let sessionEpoch = 0;
let branchInFlight = false;
let activeBranchPid: number | null = null;
let clearing: Promise<void> | null = null;

function fail(code: GitBranchFailureCode): GitBranchPreflightErr {
  return { ok: false, code, message: branchFailureMessage(code) };
}

function failExec(code: GitBranchFailureCode): GitBranchExecuteResult {
  return { ok: false, code, message: branchFailureMessage(code) };
}

function prependGit(args: readonly string[]): string[] {
  return [...gitBranchSafeConfigPrefix(), ...args];
}

export function runProductGit(
  root: string,
  args: readonly string[],
  options?: { readonly timeoutMs?: number; readonly trackTree?: boolean },
): Promise<GitRun> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let truncated = false;
    let settled = false;
    const finish = (result: GitRun) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn("git", [...args], {
      cwd: root,
      env: buildProductGitEnv({ isolateConfigFiles: true }),
      windowsHide: true,
      shell: false,
    });
    if (options?.trackTree && typeof child.pid === "number") {
      activeBranchPid = child.pid;
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
        const remaining = MAX_BRANCH_OUTPUT_CHARS - stdout.length;
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        if (chunk.length > remaining) truncated = true;
        stdout += chunk.subarray(0, remaining).toString("utf8");
        return;
      }
      const remaining = MAX_BRANCH_OUTPUT_CHARS - stderr.length;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      if (chunk.length > remaining) truncated = true;
      stderr += chunk.subarray(0, remaining).toString("utf8");
    };
    child.stdout?.on("data", (chunk: Buffer) => take(chunk, "out"));
    child.stderr?.on("data", (chunk: Buffer) => take(chunk, "err"));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (options?.trackTree) activeBranchPid = null;
      finish({
        code: 1,
        stdout: "",
        stderr: redactSensitiveText(err.message),
        timedOut: false,
        truncated: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (options?.trackTree) activeBranchPid = null;
      finish({
        code: timedOut ? 1 : (code ?? 1),
        stdout: stdout.slice(0, MAX_BRANCH_OUTPUT_CHARS),
        stderr: stderr.slice(0, MAX_BRANCH_OUTPUT_CHARS),
        timedOut,
        truncated,
      });
    });
  });
}

async function gitRun(root: string, args: readonly string[]): Promise<GitRun> {
  return runProductGit(root, prependGit(args));
}

async function gitOk(root: string, args: readonly string[]): Promise<string | null> {
  const result = await gitRun(root, args);
  if (result.timedOut || result.code !== 0 || result.truncated) return null;
  return result.stdout.trim();
}

function pruneTokens(now: number): void {
  for (const [id, record] of tokens) {
    if (record.expiresAt < now) tokens.delete(id);
  }
  while (tokens.size > GIT_BRANCH_MAX_TOKENS) {
    const oldest = [...tokens.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    tokens.delete(oldest.id);
  }
}

export async function clearGitBranchSession(): Promise<void> {
  if (clearing) {
    await clearing;
    return;
  }
  sessionEpoch += 1;
  tokens.clear();
  const pid = activeBranchPid;
  activeBranchPid = null;
  const epoch = sessionEpoch;
  clearing = (async () => {
    if (typeof pid === "number") {
      await terminateTrackedPids([pid], { termGraceMs: 200 });
    }
    if (sessionEpoch === epoch) {
      branchInFlight = false;
      activeBranchPid = null;
    }
  })().finally(() => {
    clearing = null;
  });
  await clearing;
}

export function revokeGitBranchOwner(ownerId: number): void {
  for (const [id, record] of tokens) {
    if (record.ownerId === ownerId) tokens.delete(id);
  }
}

export function cancelGitBranchToken(tokenId: string, ownerId?: number): void {
  if (typeof tokenId !== "string" || tokenId.length === 0) return;
  const record = tokens.get(tokenId);
  if (!record) return;
  if (ownerId !== undefined && record.ownerId !== ownerId) return;
  tokens.delete(tokenId);
}

async function operationInProgress(root: string): Promise<boolean> {
  const gitDir = await gitOk(root, ["rev-parse", "--git-dir"]);
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

interface Snapshot {
  readonly canonicalRoot: string;
  readonly currentBranch: string;
  readonly headSha: string;
  readonly dirty: boolean;
  readonly branches: readonly string[];
}

async function inspectBranchSnapshot(
  root: string,
): Promise<{ ok: true; snapshot: Snapshot } | GitBranchPreflightErr> {
  if (typeof root !== "string" || root.length === 0) {
    return fail("no_project");
  }

  const inside = await gitOk(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") return fail("not_a_worktree");
  const bare = await gitOk(root, ["rev-parse", "--is-bare-repository"]);
  if (bare === "true") return fail("bare_repository");

  const toplevel = await gitOk(root, ["rev-parse", "--show-toplevel"]);
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

  if (await operationInProgress(root)) return fail("operation_in_progress");

  const headSha = await gitOk(root, ["rev-parse", "--verify", "--end-of-options", "HEAD"]);
  if (!headSha) return fail("unborn_head");

  const symbolic = await gitOk(root, ["symbolic-ref", "--quiet", "--end-of-options", "HEAD"]);
  if (!symbolic) return fail("detached_head");
  const branchMatch = symbolic.match(/^refs\/heads\/(.+)$/);
  const currentBranch = branchMatch?.[1] ?? "";
  if (!isSafeLocalBranchName(currentBranch)) return fail("invalid_branch");
  const checkRef = await gitOk(root, ["check-ref-format", "--branch", currentBranch]);
  if (checkRef !== currentBranch) return fail("invalid_branch");

  const listed = await gitRun(root, [
    "for-each-ref",
    "--format=%(refname)%00",
    "--sort=refname",
    "--end-of-options",
    "refs/heads",
  ]);
  const parsed = parseNulRefNames(listed.stdout, listed.truncated);
  if (!parsed) return fail("invalid_branch");
  let branches = parsed.slice(0, MAX_LOCAL_BRANCHES);
  if (parsed.length > MAX_LOCAL_BRANCHES && !branches.includes(currentBranch)) {
    branches = [...branches.slice(0, MAX_LOCAL_BRANCHES - 1), currentBranch];
  }
  if (!branches.includes(currentBranch)) {
    return fail("invalid_branch");
  }

  const porcelain = await gitRun(root, [
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all",
  ]);
  if (porcelain.timedOut || porcelain.code !== 0) return fail("dirty_worktree");
  const dirty = porcelainV2IndicatesDirty(porcelain.stdout, porcelain.truncated);

  return {
    ok: true,
    snapshot: {
      canonicalRoot,
      currentBranch,
      headSha,
      dirty,
      branches,
    },
  };
}

export async function listLocalGitBranches(root: string): Promise<GitBranchListResult> {
  const inspected = await inspectBranchSnapshot(root);
  if (!inspected.ok) return inspected;
  return {
    ok: true,
    currentBranch: inspected.snapshot.currentBranch,
    headSha: inspected.snapshot.headSha,
    dirty: inspected.snapshot.dirty,
    branches: inspected.snapshot.branches,
  };
}

export async function prepareGitBranch(
  root: string,
  input: { readonly op: unknown; readonly destination: unknown },
  options?: { readonly ttlMs?: number; readonly now?: number; readonly ownerId?: number },
): Promise<GitBranchPreflightResult> {
  const now = options?.now ?? Date.now();
  pruneTokens(now);
  if (input.op !== "create" && input.op !== "switch") {
    return fail("invalid_branch");
  }
  if (typeof input.destination !== "string" || !isSafeLocalBranchName(input.destination)) {
    return fail("invalid_branch");
  }
  const destination = input.destination;

  const inspected = await inspectBranchSnapshot(root);
  if (!inspected.ok) return inspected;
  const checkDest = await gitOk(root, ["check-ref-format", "--branch", destination]);
  if (checkDest !== destination) return fail("invalid_branch");

  const snap = inspected.snapshot;
  if (snap.dirty) return fail("dirty_worktree");
  if (destination === snap.currentBranch) return fail("already_on_branch");
  if (hasCaseInsensitiveBranchCollision(destination, snap.branches)) {
    return fail(input.op === "create" ? "branch_exists" : "invalid_branch");
  }

  if (input.op === "create") {
    if (snap.branches.includes(destination)) return fail("branch_exists");
  } else if (!snap.branches.includes(destination)) {
    return fail("no_such_branch");
  }

  const ttl = options?.ttlMs ?? GIT_BRANCH_PREFLIGHT_TTL_MS;
  const id = randomBytes(16).toString("hex");
  tokens.set(id, {
    id,
    createdAt: now,
    expiresAt: now + Math.max(0, ttl),
    ownerId: options?.ownerId ?? 0,
    canonicalRoot: snap.canonicalRoot,
    currentBranch: snap.currentBranch,
    headSha: snap.headSha,
    dirty: false,
    op: input.op,
    destination,
  });
  pruneTokens(now);
  return {
    ok: true,
    token: id,
    op: input.op,
    currentBranch: snap.currentBranch,
    headSha: snap.headSha,
    destination,
  };
}

function resolveCanonicalRoot(root: string): string | null {
  try {
    return realpathSync(root);
  } catch {
    return null;
  }
}

export async function executeApprovedGitBranch(
  root: string,
  tokenId: string,
  options?: {
    readonly now?: number;
    readonly timeoutMs?: number;
    readonly ownerId?: number;
    readonly isStillOpenRoot?: (canonicalRoot: string) => boolean;
  },
): Promise<GitBranchExecuteResult> {
  if (clearing) await clearing;
  if (branchInFlight) return failExec("already_active");
  if (typeof tokenId !== "string" || tokenId.length < 16) return failExec("token_invalid");
  const currentRoot = resolveCanonicalRoot(root);
  const record = tokens.get(tokenId);
  if (!record || !currentRoot || record.canonicalRoot !== currentRoot) {
    return failExec("token_invalid");
  }
  if (options?.ownerId !== undefined && record.ownerId !== options.ownerId) {
    return failExec("token_invalid");
  }

  const epoch = sessionEpoch;
  branchInFlight = true;
  try {
    const now = options?.now ?? Date.now();
    tokens.delete(tokenId);
    pruneTokens(now);
    if (record.expiresAt <= now) return failExec("token_expired");
    if (sessionEpoch !== epoch) return failExec("cancelled");

    const inspected = await inspectBranchSnapshot(root);
    if (sessionEpoch !== epoch) return failExec("cancelled");
    if (!inspected.ok) {
      return failExec(
        inspected.code === "dirty_worktree" || inspected.code === "operation_in_progress"
          ? inspected.code
          : "branch_or_head_changed",
      );
    }
    const snap = inspected.snapshot;
    if (
      snap.canonicalRoot !== record.canonicalRoot ||
      snap.currentBranch !== record.currentBranch ||
      snap.headSha !== record.headSha ||
      snap.dirty !== record.dirty
    ) {
      return failExec("branch_or_head_changed");
    }
    if (record.op === "create") {
      if (snap.branches.includes(record.destination)) return failExec("branch_exists");
      if (hasCaseInsensitiveBranchCollision(record.destination, snap.branches)) {
        return failExec("branch_exists");
      }
    } else if (!snap.branches.includes(record.destination)) {
      return failExec("no_such_branch");
    }

    const liveRoot = resolveCanonicalRoot(root);
    const toplevel = await gitOk(root, ["rev-parse", "--show-toplevel"]);
    if (!liveRoot || !toplevel) return failExec("branch_or_head_changed");
    let toplevelResolved: string;
    try {
      toplevelResolved = realpathSync(toplevel);
    } catch {
      return failExec("branch_or_head_changed");
    }
    if (
      liveRoot !== record.canonicalRoot ||
      toplevelResolved !== record.canonicalRoot ||
      sessionEpoch !== epoch ||
      (options?.isStillOpenRoot && !options.isStillOpenRoot(record.canonicalRoot))
    ) {
      return failExec("cancelled");
    }

    const args =
      record.op === "create"
        ? buildGitBranchCreateArgs(record.destination)
        : buildGitBranchSwitchArgs(record.destination);
    const ran = await runProductGit(root, args, {
      timeoutMs: options?.timeoutMs ?? GIT_BRANCH_TIMEOUT_MS,
      trackTree: true,
    });
    if (sessionEpoch !== epoch) return failExec("cancelled");
    if (ran.timedOut) return failExec("timeout");
    if (ran.code !== 0) {
      const code = classifyGitBranchFailure({
        timedOut: ran.timedOut,
        stdout: redactSensitiveText(ran.stdout),
        stderr: redactSensitiveText(ran.stderr),
      });
      return failExec(code);
    }
    return {
      ok: true,
      op: record.op,
      branch: record.destination,
      summary:
        record.op === "create"
          ? `Created and switched to ${record.destination}.`
          : `Switched to ${record.destination}.`,
    };
  } finally {
    if (sessionEpoch === epoch) {
      branchInFlight = false;
      activeBranchPid = null;
    }
  }
}
