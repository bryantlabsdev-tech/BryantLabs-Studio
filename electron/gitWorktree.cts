import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { terminateTrackedPids } from "./processTree.cjs";
import { isCanonicalPathWithinRoot } from "./fileWriter.cjs";
import { buildProductGitEnv } from "./gitPush.cjs";
import {
  GIT_WORKTREE_MAX_TOKENS,
  GIT_WORKTREE_PREFLIGHT_TTL_MS,
  GIT_WORKTREE_TIMEOUT_MS,
  MAX_LOCAL_BRANCHES,
  MAX_WORKTREE_OUTPUT_CHARS,
  OWNERSHIP_RECORD_VERSION,
  FORBIDDEN_GREENFIELD_MAIN,
  HMAC_KEY_BYTES,
  MAX_OWNERSHIP_RECORD_BYTES,
  WORKTREE_DIR_PREFIX,
  WORKTREE_DIR_HEX_LEN,
  buildGitWorktreeAddArgs,
  buildGitWorktreeListArgs,
  buildGitWorktreeRemoveArgs,
  buildGitWorktreeRollbackBranchDeleteArgs,
  classifyGitWorktreeFailure,
  gitWorktreeSafeConfigPrefix,
  hasCaseInsensitiveBranchCollision,
  ignorableRuntimeUntrackedPaths,
  isAllowedManagedWorktreeMetadataRel,
  isExactHeadSha,
  isIgnorableStudioRuntimeUntracked,
  isOpaqueWorktreeDirName,
  isSafeLocalBranchName,
  isSafeManagedWorktreePath,
  ownershipFingerprintPayload,
  parseNulRefNames,
  parseWorktreePorcelainZ,
  porcelainV2IndicatesDirty,
  redactSensitiveText,
  worktreeDisplayLabel,
  worktreeFailureMessage,
  worktreeLocationLabel,
  type GitWorktreeCreatePreflightResult,
  type GitWorktreeExecuteErr,
  type GitWorktreeExecuteResult,
  type GitWorktreeFailureCode,
  type GitWorktreeListEntry,
  type GitWorktreeListResult,
  type GitWorktreeOp,
  type GitWorktreeRemovePreflightResult,
  type ParsedWorktree,
} from "./gitWorktreePolicy.cjs";

export {
  GIT_WORKTREE_MAX_TOKENS,
  GIT_WORKTREE_PREFLIGHT_TTL_MS,
  GIT_WORKTREE_TIMEOUT_MS,
  buildGitWorktreeAddArgs,
  buildGitWorktreeListArgs,
  buildGitWorktreeRemoveArgs,
  buildGitWorktreeRollbackBranchDeleteArgs,
  classifyGitWorktreeFailure,
  gitWorktreeSafeConfigPrefix,
  parseWorktreePorcelainZ,
  worktreeFailureMessage,
} from "./gitWorktreePolicy.cjs";
export type {
  GitWorktreeCreatePreflightResult,
  GitWorktreeExecuteResult,
  GitWorktreeFailureCode,
  GitWorktreeListResult,
  GitWorktreeOpenResult,
  GitWorktreeRemovePreflightResult,
} from "./gitWorktreePolicy.cjs";

interface TokenRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly ownerId: number;
  readonly sessionEpoch: number;
  readonly op: GitWorktreeOp;
  readonly canonicalRoot: string;
  readonly commonDir: string;
  readonly sourceBranch: string;
  readonly headSha: string;
  readonly destinationBranch: string;
  readonly generatedPath: string;
  readonly managedRoot: string;
  readonly recordsDir: string;
  readonly ownershipId: string;
  readonly worktreeId: string;
  readonly ownershipHmac: string;
  readonly worktreePath: string;
  readonly branch: string;
}

interface OwnershipRecord {
  readonly version: number;
  readonly ownershipId: string;
  readonly repoCommonDir: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly headSha: string;
  readonly createdAt: number;
  readonly hmac: string;
}

interface GitRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

interface WorktreeRuntime {
  managedRoot?: string;
  recordsDir?: string;
  hmacSecret?: Buffer;
  now?: number;
}

const PROGRESS_MARKERS = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
] as const;

const tokens = new Map<string, TokenRecord>();
let sessionEpoch = 0;
let worktreeInFlight = false;
let activeWorktreePid: number | null = null;
let clearing: Promise<void> | null = null;
let testRuntime: WorktreeRuntime = {};

export function setWorktreeRuntimeForTests(runtime: WorktreeRuntime): void {
  testRuntime = { ...runtime };
}

export function resetWorktreeRuntimeForTests(): void {
  testRuntime = {};
}

function fail(code: GitWorktreeFailureCode): { ok: false; code: GitWorktreeFailureCode; message: string } {
  return { ok: false, code, message: worktreeFailureMessage(code) };
}

function failExec(code: GitWorktreeFailureCode): GitWorktreeExecuteResult {
  return fail(code);
}

function nowMs(): number {
  return testRuntime.now ?? Date.now();
}

function prependGit(args: readonly string[]): string[] {
  if (args[0] === "-c") return [...args];
  return [...gitWorktreeSafeConfigPrefix(), ...args];
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
    let truncated = false;
    let settled = false;
    const finish = (result: GitRun) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn("git", prependGit(args), {
      cwd: root,
      env: buildProductGitEnv({ isolateConfigFiles: true }),
      windowsHide: true,
      shell: false,
    });
    if (options?.trackTree && typeof child.pid === "number") {
      activeWorktreePid = child.pid;
    }
    const timeoutMs = options?.timeoutMs ?? GIT_WORKTREE_TIMEOUT_MS;
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
      const remaining =
        dest === "out"
          ? MAX_WORKTREE_OUTPUT_CHARS - stdout.length
          : MAX_WORKTREE_OUTPUT_CHARS - stderr.length;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      if (chunk.length > remaining) truncated = true;
      const text = chunk.subarray(0, remaining).toString("utf8");
      if (dest === "out") stdout += text;
      else stderr += text;
    };
    child.stdout?.on("data", (chunk: Buffer) => take(chunk, "out"));
    child.stderr?.on("data", (chunk: Buffer) => take(chunk, "err"));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (options?.trackTree) activeWorktreePid = null;
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
      if (options?.trackTree) activeWorktreePid = null;
      finish({
        code: timedOut ? 1 : (code ?? 1),
        stdout: stdout.slice(0, MAX_WORKTREE_OUTPUT_CHARS),
        stderr: redactSensitiveText(stderr.slice(0, MAX_WORKTREE_OUTPUT_CHARS)),
        timedOut,
        truncated,
      });
    });
  });
}

async function gitOk(root: string, args: readonly string[]): Promise<string | null> {
  const result = await runGit(root, args);
  if (result.timedOut || result.code !== 0 || result.truncated) return null;
  return result.stdout.trim();
}

function pruneTokens(now: number): void {
  for (const [id, record] of tokens) {
    if (record.expiresAt < now) tokens.delete(id);
  }
  while (tokens.size > GIT_WORKTREE_MAX_TOKENS) {
    const oldest = [...tokens.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    tokens.delete(oldest.id);
  }
}

export async function clearGitWorktreeSession(): Promise<void> {
  if (clearing) {
    await clearing;
    return;
  }
  sessionEpoch += 1;
  tokens.clear();
  const pid = activeWorktreePid;
  activeWorktreePid = null;
  const epoch = sessionEpoch;
  clearing = (async () => {
    if (typeof pid === "number") {
      await terminateTrackedPids([pid], { termGraceMs: 200 });
    }
    if (sessionEpoch === epoch) {
      worktreeInFlight = false;
      activeWorktreePid = null;
    }
  })().finally(() => {
    clearing = null;
  });
  await clearing;
}

export function revokeGitWorktreeOwner(ownerId: number): void {
  for (const [id, record] of tokens) {
    if (record.ownerId === ownerId) tokens.delete(id);
  }
}

export function cancelGitWorktreeToken(tokenId: string, ownerId?: number): void {
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

function realpathOrNull(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

function isForbiddenLocation(candidate: string, containers: readonly string[]): boolean {
  const resolved = realpathOrNull(candidate) ?? path.resolve(candidate);
  if (resolved === FORBIDDEN_GREENFIELD_MAIN) return true;
  if (isCanonicalPathWithinRoot(FORBIDDEN_GREENFIELD_MAIN, resolved)) return true;
  for (const container of containers) {
    if (!container) continue;
    const base = realpathOrNull(container) ?? path.resolve(container);
    if (resolved === base) return true;
    if (isCanonicalPathWithinRoot(base, resolved)) return true;
  }
  return false;
}

async function resolveUserDataPaths(): Promise<{ managedRoot: string; recordsDir: string } | null> {
  if (testRuntime.managedRoot && testRuntime.recordsDir) {
    return { managedRoot: testRuntime.managedRoot, recordsDir: testRuntime.recordsDir };
  }
  try {
    const electron = await import("electron");
    const userData = electron.app.getPath("userData");
    return {
      managedRoot: testRuntime.managedRoot ?? path.join(userData, "git-worktrees"),
      recordsDir: testRuntime.recordsDir ?? path.join(userData, "git-worktree-records"),
    };
  } catch {
    return null;
  }
}

async function hmacSecret(recordsDir: string): Promise<Buffer | null> {
  if (testRuntime.hmacSecret) {
    if (testRuntime.hmacSecret.length < HMAC_KEY_BYTES) return null;
    return testRuntime.hmacSecret.subarray(0, HMAC_KEY_BYTES);
  }
  const keyPath = path.join(recordsDir, ".hmac");
  const keyKind = await lstatKind(keyPath);
  if (keyKind === "symlink" || keyKind === "dir") return null;
  if (keyKind === "other") {
    try {
      const st = await fs.lstat(keyPath);
      if (!st.isFile() || st.size < HMAC_KEY_BYTES || st.size > HMAC_KEY_BYTES * 2) return null;
      const existing = await fs.readFile(keyPath);
      if (existing.length < HMAC_KEY_BYTES) return null;
      return existing.subarray(0, HMAC_KEY_BYTES);
    } catch {
      return null;
    }
  }
  let names: string[] = [];
  try {
    names = await fs.readdir(recordsDir);
  } catch {
    names = [];
  }
  if (names.some((name) => name.endsWith(".json"))) {
    return null;
  }
  try {
    await fs.mkdir(recordsDir, { recursive: true, mode: 0o700 });
    const secret = randomBytes(HMAC_KEY_BYTES);
    const handle = await fs.open(keyPath, "wx", 0o600);
    try {
      await handle.write(secret);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return secret;
  } catch {
    return null;
  }
}

function signOwnership(record: Omit<OwnershipRecord, "hmac">, secret: Buffer): string {
  return createHmac("sha256", secret)
    .update(
      ownershipFingerprintPayload({
        version: record.version,
        ownershipId: record.ownershipId,
        repoCommonDir: record.repoCommonDir,
        worktreePath: record.worktreePath,
        branch: record.branch,
        headSha: record.headSha,
        createdAt: record.createdAt,
      }),
    )
    .digest("hex");
}

function hmacMatches(record: OwnershipRecord, secret: Buffer): boolean {
  const expected = Buffer.from(signOwnership(record, secret), "hex");
  const actual = Buffer.from(record.hmac, "hex");
  if (expected.length !== actual.length || expected.length === 0) return false;
  return timingSafeEqual(expected, actual);
}

function recordPath(recordsDir: string, ownershipId: string): string {
  return path.join(recordsDir, `${ownershipId}.json`);
}

async function readOwnershipRecord(
  recordsDir: string,
  ownershipId: string,
  secret: Buffer,
): Promise<OwnershipRecord | null> {
  if (!/^[0-9a-f]{32}$/.test(ownershipId)) return null;
  const file = recordPath(recordsDir, ownershipId);
  try {
    const st = await fs.lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size === 0 || st.size > MAX_OWNERSHIP_RECORD_BYTES) {
      return null;
    }
    const raw = await fs.readFile(file, "utf8");
    if (raw.length > MAX_OWNERSHIP_RECORD_BYTES) return null;
    const parsed = JSON.parse(raw) as Partial<OwnershipRecord>;
    if (parsed.version !== OWNERSHIP_RECORD_VERSION) return null;
    if (typeof parsed.ownershipId !== "string" || parsed.ownershipId !== ownershipId) return null;
    if (typeof parsed.repoCommonDir !== "string") return null;
    if (typeof parsed.worktreePath !== "string") return null;
    if (typeof parsed.branch !== "string" || !isSafeLocalBranchName(parsed.branch)) return null;
    if (typeof parsed.headSha !== "string" || !isExactHeadSha(parsed.headSha)) return null;
    if (typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) return null;
    if (typeof parsed.hmac !== "string" || !/^[0-9a-f]{64}$/.test(parsed.hmac)) return null;
    const record: OwnershipRecord = {
      version: parsed.version,
      ownershipId: parsed.ownershipId,
      repoCommonDir: parsed.repoCommonDir,
      worktreePath: parsed.worktreePath,
      branch: parsed.branch,
      headSha: parsed.headSha,
      createdAt: parsed.createdAt,
      hmac: parsed.hmac,
    };
    if (!hmacMatches(record, secret)) return null;
    return record;
  } catch {
    return null;
  }
}

async function listOwnershipRecords(
  recordsDir: string,
  secret: Buffer,
  commonDir: string,
): Promise<OwnershipRecord[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(recordsDir);
  } catch {
    return [];
  }
  const out: OwnershipRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    const record = await readOwnershipRecord(recordsDir, id, secret);
    if (!record) continue;
    if (record.repoCommonDir !== commonDir) continue;
    out.push(record);
  }
  return out;
}

async function writeOwnershipRecord(recordsDir: string, record: OwnershipRecord): Promise<boolean> {
  try {
    if ((await lstatKind(recordsDir)) !== "dir") return false;
    const dest = recordPath(recordsDir, record.ownershipId);
    if ((await lstatKind(dest)) !== "missing") return false;
    const payload = `${JSON.stringify(record)}\n`;
    if (payload.length > MAX_OWNERSHIP_RECORD_BYTES) return false;
    const tmp = path.join(recordsDir, `.${record.ownershipId}.${randomBytes(8).toString("hex")}.tmp`);
    const handle = await fs.open(tmp, "wx", 0o600);
    try {
      await handle.writeFile(payload);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if ((await lstatKind(dest)) !== "missing") {
      await fs.unlink(tmp).catch(() => undefined);
      return false;
    }
    await fs.link(tmp, dest);
    await fs.unlink(tmp).catch(() => undefined);
    const published = await fs.lstat(dest);
    if (!published.isFile() || published.isSymbolicLink() || published.nlink !== 1) {
      await fs.unlink(dest).catch(() => undefined);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function deleteOwnershipRecord(recordsDir: string, ownershipId: string): Promise<boolean> {
  const file = recordPath(recordsDir, ownershipId);
  try {
    const st = await fs.lstat(file);
    if (!st.isFile() || st.isSymbolicLink()) return false;
    await fs.unlink(file);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
    if (code === "ENOENT") return true;
    return false;
  }
  try {
    await fs.lstat(file);
    return false;
  } catch {
    return true;
  }
}

interface RepoSnapshot {
  readonly canonicalRoot: string;
  readonly commonDir: string;
  readonly mainPath: string;
  readonly currentBranch: string | null;
  readonly headSha: string | null;
  readonly detached: boolean;
  readonly dirty: boolean;
  readonly branches: readonly string[];
  readonly worktrees: readonly ParsedWorktree[];
}

async function inspectRepo(
  root: string,
): Promise<{ ok: true; snapshot: RepoSnapshot } | { ok: false; code: GitWorktreeFailureCode; message: string }> {
  if (typeof root !== "string" || root.length === 0) return fail("no_project");
  const inside = await gitOk(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") return fail("not_a_worktree");
  const bare = await gitOk(root, ["rev-parse", "--is-bare-repository"]);
  if (bare === "true") return fail("bare_repository");
  const toplevel = await gitOk(root, ["rev-parse", "--show-toplevel"]);
  if (!toplevel) return fail("not_a_worktree");
  if (!isCanonicalPathWithinRoot(root, toplevel)) return fail("outside_root");
  const canonicalRoot = realpathOrNull(toplevel);
  const projectResolved = realpathOrNull(root);
  if (!canonicalRoot || !projectResolved || canonicalRoot !== projectResolved) return fail("outside_root");

  let commonRaw =
    (await gitOk(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) ??
    (await gitOk(root, ["rev-parse", "--git-common-dir"]));
  if (!commonRaw) return fail("not_a_worktree");
  const commonResolved = path.isAbsolute(commonRaw) ? commonRaw : path.resolve(root, commonRaw);
  const commonDir = realpathOrNull(commonResolved);
  if (!commonDir) return fail("not_a_worktree");

  const listed = await runGit(root, buildGitWorktreeListArgs());
  const parsed = parseWorktreePorcelainZ(listed.stdout, listed.truncated || listed.timedOut || listed.code !== 0);
  if (!parsed.ok) {
    if (parsed.reason === "too_many") return fail("too_many_worktrees");
    if (parsed.reason === "truncated" || parsed.reason === "oversized") return fail("malformed_list");
    return fail("malformed_list");
  }
  const mainPath = parsed.worktrees[0]?.path ?? canonicalRoot;
  const headShaRaw = await gitOk(root, ["rev-parse", "--verify", "--end-of-options", "HEAD"]);
  const headSha = headShaRaw && isExactHeadSha(headShaRaw.toLowerCase()) ? headShaRaw.toLowerCase() : null;
  const symbolic = await gitOk(root, ["symbolic-ref", "--quiet", "--end-of-options", "HEAD"]);
  let currentBranch: string | null = null;
  let detached = !symbolic;
  if (symbolic) {
    const match = symbolic.match(/^refs\/heads\/(.+)$/);
    currentBranch = match?.[1] ?? null;
    if (!currentBranch || !isSafeLocalBranchName(currentBranch)) return fail("invalid_branch");
  }
  const refs = await runGit(root, [
    "for-each-ref",
    "--format=%(refname)%00",
    "--sort=refname",
    "--end-of-options",
    "refs/heads",
  ]);
  const parsedBranches = parseNulRefNames(refs.stdout, refs.truncated);
  if (!parsedBranches) return fail("invalid_branch");
  const porcelain = await runGit(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
  const dirty =
    porcelain.timedOut || porcelain.code !== 0
      ? true
      : porcelainV2IndicatesDirty(porcelain.stdout, porcelain.truncated);
  return {
    ok: true,
    snapshot: {
      canonicalRoot,
      commonDir,
      mainPath: realpathOrNull(mainPath) ?? mainPath,
      currentBranch,
      headSha,
      detached,
      dirty,
      branches: parsedBranches.slice(0, MAX_LOCAL_BRANCHES),
      worktrees: parsed.worktrees,
    },
  };
}

async function worktreeDirty(worktreePath: string): Promise<boolean> {
  const porcelain = await runGit(worktreePath, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
  if (porcelain.timedOut || porcelain.code !== 0) return true;
  return porcelainV2IndicatesDirty(porcelain.stdout, porcelain.truncated);
}

async function unlinkExactContainedFile(root: string, relativePath: string): Promise<boolean> {
  if (!isIgnorableStudioRuntimeUntracked(relativePath)) return false;
  const abs = path.join(root, ...relativePath.split("/"));
  if (!isCanonicalPathWithinRoot(root, abs)) return false;
  try {
    const st = await fs.lstat(abs);
    if (!st.isFile() || st.isSymbolicLink()) return false;
    await fs.unlink(abs);
    return true;
  } catch {
    return false;
  }
}

async function rmdirExactContainedIfEmpty(root: string, relativeDir: string): Promise<void> {
  const abs = path.join(root, ...relativeDir.split("/"));
  if (!isCanonicalPathWithinRoot(root, abs) || abs === root) return;
  if ((await lstatKind(abs)) !== "dir") return;
  const resolved = realpathOrNull(abs);
  if (!resolved || !isCanonicalPathWithinRoot(root, resolved)) return;
  let names: string[] = [];
  try {
    names = await fs.readdir(resolved);
  } catch {
    return;
  }
  if (names.filter((name) => name !== "." && name !== "..").length > 0) return;
  try {
    await fs.rmdir(resolved);
  } catch {
    /* leave in place */
  }
}

/**
 * Git `worktree remove` has no Studio cache allowlist. When the tree is clean
 * under the product dirty policy, delete only the exact ignorable cache files
 * so Git will accept a non-force removal.
 */
async function scrubIgnorableRuntimeCaches(worktreePath: string): Promise<boolean> {
  if ((await lstatKind(worktreePath)) !== "dir") return false;
  const porcelain = await runGit(worktreePath, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
  if (porcelain.timedOut || porcelain.code !== 0) return false;
  const ignorable = ignorableRuntimeUntrackedPaths(porcelain.stdout, porcelain.truncated);
  if (!ignorable) return false;
  for (const rel of ignorable) {
    const ok = await unlinkExactContainedFile(worktreePath, rel);
    if (!ok) return false;
  }
  await rmdirExactContainedIfEmpty(worktreePath, ".bryantlabs/semantic-index");
  await rmdirExactContainedIfEmpty(worktreePath, ".bryantlabs/scan-manifest");
  await rmdirExactContainedIfEmpty(worktreePath, ".bryantlabs");
  return !(await worktreeDirty(worktreePath));
}

async function lstatKind(target: string): Promise<"missing" | "dir" | "symlink" | "other"> {
  try {
    const st = await fs.lstat(target);
    if (st.isSymbolicLink()) return "symlink";
    if (st.isDirectory()) return "dir";
    return "other";
  } catch {
    return "missing";
  }
}

function externalId(worktreePath: string): string {
  return `x-${createHash("sha256").update(worktreePath).digest("hex").slice(0, 32)}`;
}

function studioId(ownershipId: string): string {
  return `s-${ownershipId}`;
}

async function ensureManagedRoot(
  snap: RepoSnapshot,
): Promise<{ ok: true; managedRoot: string; recordsDir: string; secret: Buffer } | { ok: false; code: GitWorktreeFailureCode; message: string }> {
  const paths = await resolveUserDataPaths();
  if (!paths) return fail("unsafe_location");
  const containers = [snap.canonicalRoot, snap.commonDir, snap.mainPath];
  if (isForbiddenLocation(paths.managedRoot, containers)) return fail("unsafe_location");
  if (isForbiddenLocation(paths.recordsDir, containers)) return fail("unsafe_location");
  try {
    await fs.mkdir(paths.managedRoot, { recursive: true, mode: 0o700 });
    await fs.mkdir(paths.recordsDir, { recursive: true, mode: 0o700 });
  } catch {
    return fail("unsafe_location");
  }
  const managedRoot = realpathOrNull(paths.managedRoot);
  const recordsDir = realpathOrNull(paths.recordsDir);
  if (!managedRoot || !recordsDir) return fail("unsafe_location");
  if (isForbiddenLocation(managedRoot, containers)) return fail("unsafe_location");
  const secret = await hmacSecret(recordsDir);
  if (!secret) return fail("generic_failure");
  const kind = await lstatKind(managedRoot);
  if (kind === "symlink" || kind !== "dir") return fail("symlink_escape");
  return { ok: true, managedRoot, recordsDir, secret };
}

function matchingStudioRecord(
  records: readonly OwnershipRecord[],
  live: ParsedWorktree,
  commonDir: string,
): OwnershipRecord | null {
  const livePath = realpathOrNull(live.path) ?? live.path;
  for (const record of records) {
    if (record.repoCommonDir !== commonDir) continue;
    if (record.worktreePath !== livePath && record.worktreePath !== live.path) continue;
    if (record.branch !== live.branch) continue;
    return record;
  }
  return null;
}

export async function listStudioWorktrees(root: string): Promise<GitWorktreeListResult> {
  const inspected = await inspectRepo(root);
  if (!inspected.ok) return inspected;
  const snap = inspected.snapshot;
  const managed = await ensureManagedRoot(snap);
  const records =
    managed.ok ? await listOwnershipRecords(managed.recordsDir, managed.secret, snap.commonDir) : [];
  const active = snap.canonicalRoot;
  const entries: GitWorktreeListEntry[] = [];
  for (const [index, live] of snap.worktrees.entries()) {
    const resolved = realpathOrNull(live.path);
    const missing = !resolved;
    const kindLstat = await lstatKind(live.path);
    const isMain = index === 0 || (resolved !== null && resolved === snap.mainPath);
    const record = !isMain && managed.ok ? matchingStudioRecord(records, live, snap.commonDir) : null;
    const underManaged =
      Boolean(managed.ok && resolved && isCanonicalPathWithinRoot(managed.managedRoot, resolved));
    const kind: GitWorktreeListEntry["kind"] = isMain
      ? "main"
      : record && underManaged
        ? "studio"
        : "external";
    const dirty = missing || kindLstat !== "dir" ? true : await worktreeDirty(resolved ?? live.path);
    const id = kind === "studio" && record ? studioId(record.ownershipId) : externalId(resolved ?? live.path);
    const dirName = resolved ? path.basename(resolved) : "";
    entries.push({
      id,
      kind,
      branch: live.branch,
      headShort: live.head ? live.head.slice(0, 12) : "",
      dirty,
      active: Boolean(resolved && resolved === active),
      locked: live.locked,
      missing,
      displayLabel: worktreeDisplayLabel(kind),
      locationLabel: worktreeLocationLabel(kind, dirName),
      canOpen: !missing && kindLstat === "dir" && !live.prunable,
      canRemove:
        kind === "studio" &&
        Boolean(record) &&
        !isMain &&
        !(resolved && resolved === active) &&
        !live.locked &&
        !live.prunable &&
        !missing &&
        !dirty &&
        kindLstat === "dir",
    });
  }
  return { ok: true, entries };
}

async function generateManagedPath(managedRoot: string): Promise<string | null> {
  for (let i = 0; i < 8; i += 1) {
    const name = `${WORKTREE_DIR_PREFIX}${randomBytes(WORKTREE_DIR_HEX_LEN / 2).toString("hex")}`;
    const candidate = path.join(managedRoot, name);
    if (!isSafeManagedWorktreePath(candidate)) continue;
    if ((await lstatKind(candidate)) !== "missing") continue;
    if (!isCanonicalPathWithinRoot(managedRoot, candidate)) continue;
    return candidate;
  }
  return null;
}

export async function prepareGitWorktreeCreate(
  root: string,
  input: { readonly destinationBranch: unknown },
  options?: { readonly ttlMs?: number; readonly now?: number; readonly ownerId?: number },
): Promise<GitWorktreeCreatePreflightResult> {
  const now = options?.now ?? nowMs();
  pruneTokens(now);
  if (typeof input.destinationBranch !== "string" || !isSafeLocalBranchName(input.destinationBranch)) {
    return fail("invalid_branch");
  }
  const destination = input.destinationBranch;
  const inspected = await inspectRepo(root);
  if (!inspected.ok) return inspected;
  const snap = inspected.snapshot;
  if (!snap.headSha) return fail("unborn_head");
  if (snap.detached || !snap.currentBranch) return fail("detached_head");
  if (await operationInProgress(root)) return fail("operation_in_progress");
  if (snap.dirty) return fail("dirty_worktree");
  const checkDest = await gitOk(root, ["check-ref-format", "--branch", destination]);
  if (checkDest !== destination) return fail("invalid_branch");
  if (snap.branches.includes(destination) || destination === snap.currentBranch) {
    return fail("branch_exists");
  }
  if (hasCaseInsensitiveBranchCollision(destination, snap.branches)) return fail("branch_exists");
  const managed = await ensureManagedRoot(snap);
  if (!managed.ok) return managed;
  const generatedPath = await generateManagedPath(managed.managedRoot);
  if (!generatedPath) return fail("path_exists");
  if (isForbiddenLocation(generatedPath, [snap.canonicalRoot, snap.commonDir, snap.mainPath, managed.recordsDir])) {
    return fail("unsafe_location");
  }
  const ownershipId = randomBytes(16).toString("hex");
  const ttl = options?.ttlMs ?? GIT_WORKTREE_PREFLIGHT_TTL_MS;
  const id = randomBytes(16).toString("hex");
  tokens.set(id, {
    id,
    createdAt: now,
    expiresAt: now + Math.max(0, ttl),
    ownerId: options?.ownerId ?? 0,
    sessionEpoch,
    op: "create",
    canonicalRoot: snap.canonicalRoot,
    commonDir: snap.commonDir,
    sourceBranch: snap.currentBranch,
    headSha: snap.headSha,
    destinationBranch: destination,
    generatedPath,
    managedRoot: managed.managedRoot,
    recordsDir: managed.recordsDir,
    ownershipId,
    worktreeId: studioId(ownershipId),
    ownershipHmac: "",
    worktreePath: generatedPath,
    branch: destination,
  });
  pruneTokens(now);
  return {
    ok: true,
    token: id,
    op: "create",
    sourceBranch: snap.currentBranch,
    destinationBranch: destination,
    headSha: snap.headSha,
    locationLabel: worktreeLocationLabel("studio", path.basename(generatedPath)),
  };
}

async function boundedRemoveDirectory(target: string, managedRoot: string): Promise<"ok" | "cleanup_required"> {
  const kind = await lstatKind(target);
  if (kind === "missing") return "ok";
  if (kind !== "dir") return "cleanup_required";
  const resolved = realpathOrNull(target);
  if (!resolved || resolved === managedRoot) return "cleanup_required";
  if (!isCanonicalPathWithinRoot(managedRoot, resolved)) return "cleanup_required";
  if (!isOpaqueWorktreeDirName(path.basename(resolved))) return "cleanup_required";
  let names: string[] = [];
  try {
    names = await fs.readdir(resolved);
  } catch {
    return "cleanup_required";
  }
  const allowed = names.filter((name) => name !== "." && name !== "..");
  if (allowed.length > 0) return "cleanup_required";
  try {
    await fs.rmdir(resolved);
    return "ok";
  } catch {
    return "cleanup_required";
  }
}

async function rollbackCreate(input: {
  readonly repoRoot: string;
  readonly branch: string;
  readonly managedPath: string;
  readonly managedRoot: string;
  readonly recordsDir: string;
  readonly branchExisted: boolean;
  readonly pathExisted: boolean;
  readonly registrationExisted: boolean;
  readonly recordExisted: boolean;
  readonly expectedHead: string;
  readonly ownershipId: string;
}): Promise<void> {
  const relist = async () => {
    const liveList = await runGit(input.repoRoot, buildGitWorktreeListArgs());
    return parseWorktreePorcelainZ(liveList.stdout, liveList.truncated || liveList.timedOut);
  };
  const matchesPath = (
    parsed: Awaited<ReturnType<typeof relist>>,
    target: string,
  ): boolean => {
    if (!parsed.ok) return false;
    const resolvedTarget = realpathOrNull(target);
    return parsed.worktrees.some((item) => {
      const resolved = realpathOrNull(item.path);
      return resolved === resolvedTarget || item.path === target || item.path === resolvedTarget;
    });
  };
  const managedResolved = realpathOrNull(input.managedPath) ?? input.managedPath;
  let parsed = await relist();
  if (
    parsed.ok &&
    !input.pathExisted &&
    !input.registrationExisted &&
    matchesPath(parsed, input.managedPath) &&
    isSafeManagedWorktreePath(managedResolved) &&
    (await lstatKind(input.managedRoot)) === "dir" &&
    isCanonicalPathWithinRoot(input.managedRoot, managedResolved) &&
    (await lstatKind(managedResolved)) === "dir"
  ) {
    await scrubIgnorableRuntimeCaches(managedResolved);
    await runGit(input.repoRoot, buildGitWorktreeRemoveArgs(managedResolved));
  }

  parsed = await relist();
  if (
    !input.pathExisted &&
    (!parsed.ok || !matchesPath(parsed, input.managedPath)) &&
    (await lstatKind(managedResolved)) === "dir"
  ) {
    await boundedRemoveDirectory(managedResolved, input.managedRoot);
  }

  parsed = await relist();
  const branchCheckedOut = parsed.ok && parsed.worktrees.some((item) => item.branch === input.branch);
  if (!parsed.ok) {
    /* fail closed: do not delete a branch while list identity is ambiguous */
  } else if (!input.branchExisted && isSafeLocalBranchName(input.branch) && !branchCheckedOut) {
    const sha = await gitOk(input.repoRoot, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `refs/heads/${input.branch}`,
    ]);
    parsed = await relist();
    const stillCheckedOut = parsed.ok && parsed.worktrees.some((item) => item.branch === input.branch);
    if (!stillCheckedOut && sha && sha.toLowerCase() === input.expectedHead) {
      await runGit(input.repoRoot, buildGitWorktreeRollbackBranchDeleteArgs(input.branch));
    }
  }

  if (!input.recordExisted) {
    await deleteOwnershipRecord(input.recordsDir, input.ownershipId);
  }
}

export async function executeApprovedGitWorktreeCreate(
  root: string,
  tokenId: string,
  options?: {
    readonly now?: number;
    readonly ownerId?: number;
    readonly isStillOpenRoot?: (canonicalRoot: string) => boolean;
  },
): Promise<GitWorktreeExecuteResult> {
  if (clearing) await clearing;
  if (worktreeInFlight) return failExec("already_active");
  const now = options?.now ?? nowMs();
  pruneTokens(now);
  const token = tokens.get(tokenId);
  if (!token || token.op !== "create") return failExec("token_invalid");
  if (options?.ownerId !== undefined && token.ownerId !== options.ownerId) {
    return failExec("token_invalid");
  }
  if (token.expiresAt < now) {
    tokens.delete(tokenId);
    return failExec("token_expired");
  }
  if (token.sessionEpoch !== sessionEpoch) {
    tokens.delete(tokenId);
    return failExec("stale_project");
  }
  tokens.delete(tokenId);
  const projectRoot = realpathOrNull(root);
  if (!projectRoot || projectRoot !== token.canonicalRoot) return failExec("stale_project");
  if (options?.isStillOpenRoot && !options.isStillOpenRoot(token.canonicalRoot)) {
    return failExec("stale_project");
  }

  const inspected = await inspectRepo(root);
  if (!inspected.ok) return inspected;
  const snap = inspected.snapshot;
  if (snap.canonicalRoot !== token.canonicalRoot || snap.commonDir !== token.commonDir) {
    return failExec("identity_changed");
  }
  if (snap.currentBranch !== token.sourceBranch || snap.headSha !== token.headSha) {
    return failExec("identity_changed");
  }
  if (snap.detached) return failExec("detached_head");
  if (await operationInProgress(root)) return failExec("operation_in_progress");
  if (snap.dirty) return failExec("dirty_worktree");
  if (snap.branches.includes(token.destinationBranch)) return failExec("branch_exists");
  if ((await lstatKind(token.generatedPath)) !== "missing") return failExec("path_exists");

  const managed = await ensureManagedRoot(snap);
  if (!managed.ok) return managed;
  if (managed.managedRoot !== token.managedRoot || managed.recordsDir !== token.recordsDir) {
    return failExec("identity_changed");
  }
  if ((await lstatKind(managed.managedRoot)) !== "dir" || (await lstatKind(managed.recordsDir)) !== "dir") {
    return failExec("symlink_escape");
  }
  if (!isCanonicalPathWithinRoot(managed.managedRoot, token.generatedPath)) {
    return failExec("unsafe_location");
  }
  if ((await lstatKind(token.generatedPath)) !== "missing") return failExec("path_exists");

  worktreeInFlight = true;
  const branchExisted = snap.branches.includes(token.destinationBranch);
  const pathExisted = false;
  const registrationExisted = snap.worktrees.some((item) => {
    const resolved = realpathOrNull(item.path);
    return resolved === token.generatedPath || item.path === token.generatedPath;
  });
  const recordExisted = (await lstatKind(recordPath(managed.recordsDir, token.ownershipId))) !== "missing";
  const rollback = {
    repoRoot: root,
    branch: token.destinationBranch,
    managedPath: token.generatedPath,
    managedRoot: managed.managedRoot,
    recordsDir: managed.recordsDir,
    branchExisted,
    pathExisted,
    registrationExisted,
    recordExisted,
    expectedHead: token.headSha,
    ownershipId: token.ownershipId,
  };
  try {
    const args = buildGitWorktreeAddArgs(token.destinationBranch, token.generatedPath, token.headSha);
    const ran = await runGit(root, args, { trackTree: true });
    if (ran.timedOut || ran.code !== 0 || ran.truncated) {
      await rollbackCreate(rollback);
      return failExec(classifyGitWorktreeFailure({ timedOut: ran.timedOut, stderr: ran.stderr }));
    }
    const verify = await inspectRepo(root);
    if (!verify.ok) {
      await rollbackCreate(rollback);
      return verify;
    }
    const created = verify.snapshot.worktrees.find((item) => {
      const resolved = realpathOrNull(item.path);
      return resolved === realpathOrNull(token.generatedPath) || item.path === token.generatedPath;
    });
    const createdKind = await lstatKind(token.generatedPath);
    const createdDirty = await worktreeDirty(token.generatedPath);
    const createdCommon =
      (await gitOk(token.generatedPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) ??
      "";
    const createdCommonReal = realpathOrNull(createdCommon);
    if (
      !created ||
      created.branch !== token.destinationBranch ||
      created.head !== token.headSha ||
      created.locked ||
      created.detached ||
      createdDirty ||
      createdKind !== "dir" ||
      createdCommonReal !== token.commonDir
    ) {
      await rollbackCreate(rollback);
      return failExec("identity_changed");
    }
    const unsigned = {
      version: OWNERSHIP_RECORD_VERSION,
      ownershipId: token.ownershipId,
      repoCommonDir: token.commonDir,
      worktreePath: realpathOrNull(token.generatedPath) ?? token.generatedPath,
      branch: token.destinationBranch,
      headSha: token.headSha,
      createdAt: now,
    };
    const record: OwnershipRecord = {
      ...unsigned,
      hmac: signOwnership(unsigned, managed.secret),
    };
    const written = await writeOwnershipRecord(managed.recordsDir, record);
    if (!written) {
      await rollbackCreate(rollback);
      return failExec("generic_failure");
    }
    if (options?.isStillOpenRoot && !options.isStillOpenRoot(token.canonicalRoot)) {
      await rollbackCreate({ ...rollback, recordExisted: false, branchExisted: false, pathExisted: false, registrationExisted: false });
      return failExec("stale_project");
    }
    return {
      ok: true,
      op: "create",
      summary: `Created worktree on ${token.destinationBranch}.`,
      branch: token.destinationBranch,
      worktreeId: studioId(token.ownershipId),
    };
  } finally {
    worktreeInFlight = false;
    activeWorktreePid = null;
  }
}

async function liveById(
  snap: RepoSnapshot,
  records: readonly OwnershipRecord[],
  id: string,
): Promise<
  | { ok: true; live: ParsedWorktree; record: OwnershipRecord | null; resolved: string | null; isMain: boolean }
  | { ok: false; code: GitWorktreeFailureCode; message: string }
> {
  for (const [index, live] of snap.worktrees.entries()) {
    const resolved = realpathOrNull(live.path);
    const isMain = index === 0 || (resolved !== null && resolved === snap.mainPath);
    const record = !isMain ? matchingStudioRecord(records, live, snap.commonDir) : null;
    const liveId = record ? studioId(record.ownershipId) : externalId(resolved ?? live.path);
    if (liveId !== id) continue;
    return { ok: true, live, record, resolved, isMain };
  }
  return fail("missing_worktree");
}

export async function prepareGitWorktreeRemove(
  root: string,
  input: { readonly id: unknown },
  options?: { readonly ttlMs?: number; readonly now?: number; readonly ownerId?: number },
): Promise<GitWorktreeRemovePreflightResult> {
  const now = options?.now ?? nowMs();
  pruneTokens(now);
  if (typeof input.id !== "string" || !input.id.startsWith("s-")) return fail("not_studio_owned");
  const inspected = await inspectRepo(root);
  if (!inspected.ok) return inspected;
  const snap = inspected.snapshot;
  if (await operationInProgress(root)) return fail("operation_in_progress");
  const managed = await ensureManagedRoot(snap);
  if (!managed.ok) return managed;
  const records = await listOwnershipRecords(managed.recordsDir, managed.secret, snap.commonDir);
  const found = await liveById(snap, records, input.id);
  if (!found.ok) return found;
  if (found.isMain) return fail("is_main_worktree");
  if (!found.record) return fail("not_studio_owned");
  if (found.resolved && found.resolved === snap.canonicalRoot) return fail("is_active_worktree");
  if (found.live.locked) return fail("locked_worktree");
  if (found.live.prunable) return fail("prunable_worktree");
  if (found.live.detached || !found.live.branch) return fail("not_studio_owned");
  if (!found.resolved) return fail("missing_worktree");
  if ((await lstatKind(found.resolved)) !== "dir") return fail("symlink_escape");
  if (!isCanonicalPathWithinRoot(managed.managedRoot, found.resolved)) return fail("unsafe_location");
  if (!isSafeManagedWorktreePath(found.resolved) && !isOpaqueWorktreeDirName(path.basename(found.resolved))) {
    return fail("unsafe_location");
  }
  if (await worktreeDirty(found.resolved)) return fail("dirty_worktree");
  const ttl = options?.ttlMs ?? GIT_WORKTREE_PREFLIGHT_TTL_MS;
  const id = randomBytes(16).toString("hex");
  tokens.set(id, {
    id,
    createdAt: now,
    expiresAt: now + Math.max(0, ttl),
    ownerId: options?.ownerId ?? 0,
    sessionEpoch,
    op: "remove",
    canonicalRoot: snap.canonicalRoot,
    commonDir: snap.commonDir,
    sourceBranch: snap.currentBranch ?? "",
    headSha: found.live.head ?? "",
    destinationBranch: found.record.branch,
    generatedPath: found.resolved,
    managedRoot: managed.managedRoot,
    recordsDir: managed.recordsDir,
    ownershipId: found.record.ownershipId,
    worktreeId: studioId(found.record.ownershipId),
    ownershipHmac: found.record.hmac,
    worktreePath: found.resolved,
    branch: found.record.branch,
  });
  pruneTokens(now);
  return {
    ok: true,
    token: id,
    op: "remove",
    worktreeId: studioId(found.record.ownershipId),
    branch: found.record.branch,
    headSha: found.live.head ?? "",
    locationLabel: worktreeLocationLabel("studio", path.basename(found.resolved)),
  };
}

export async function executeApprovedGitWorktreeRemove(
  root: string,
  tokenId: string,
  options?: {
    readonly now?: number;
    readonly ownerId?: number;
    readonly isStillOpenRoot?: (canonicalRoot: string) => boolean;
  },
): Promise<GitWorktreeExecuteResult> {
  if (clearing) await clearing;
  if (worktreeInFlight) return failExec("already_active");
  const now = options?.now ?? nowMs();
  pruneTokens(now);
  const token = tokens.get(tokenId);
  if (!token || token.op !== "remove") return failExec("token_invalid");
  if (options?.ownerId !== undefined && token.ownerId !== options.ownerId) {
    return failExec("token_invalid");
  }
  if (token.expiresAt < now) {
    tokens.delete(tokenId);
    return failExec("token_expired");
  }
  if (token.sessionEpoch !== sessionEpoch) {
    tokens.delete(tokenId);
    return failExec("stale_project");
  }
  tokens.delete(tokenId);
  const projectRoot = realpathOrNull(root);
  if (!projectRoot || projectRoot !== token.canonicalRoot) return failExec("stale_project");
  if (options?.isStillOpenRoot && !options.isStillOpenRoot(token.canonicalRoot)) {
    return failExec("stale_project");
  }

  const inspected = await inspectRepo(root);
  if (!inspected.ok) return inspected;
  const snap = inspected.snapshot;
  if (snap.canonicalRoot !== token.canonicalRoot || snap.commonDir !== token.commonDir) {
    return failExec("identity_changed");
  }
  if (await operationInProgress(root)) return failExec("operation_in_progress");
  const managed = await ensureManagedRoot(snap);
  if (!managed.ok) return managed;
  const records = await listOwnershipRecords(managed.recordsDir, managed.secret, snap.commonDir);
  const found = await liveById(snap, records, token.worktreeId);
  if (!found.ok) return found;
  if (found.isMain) return failExec("is_main_worktree");
  if (!found.record || found.record.ownershipId !== token.ownershipId) return failExec("not_studio_owned");
  if (found.record.hmac !== token.ownershipHmac) return failExec("identity_changed");
  if (!found.resolved || found.resolved !== token.worktreePath) return failExec("identity_changed");
  if (found.resolved === snap.canonicalRoot) return failExec("is_active_worktree");
  if (found.live.branch !== token.branch || (found.live.head ?? "") !== token.headSha) {
    return failExec("identity_changed");
  }
  if (found.live.locked) return failExec("locked_worktree");
  if (found.live.prunable) return failExec("prunable_worktree");
  if (found.live.detached || !found.live.branch) return failExec("not_studio_owned");
  if ((await lstatKind(managed.managedRoot)) !== "dir" || (await lstatKind(managed.recordsDir)) !== "dir") {
    return failExec("symlink_escape");
  }
  if ((await lstatKind(found.resolved)) !== "dir") return failExec("symlink_escape");
  if (!isCanonicalPathWithinRoot(managed.managedRoot, found.resolved)) return failExec("unsafe_location");
  if (await worktreeDirty(found.resolved)) return failExec("dirty_worktree");
  if (!(await scrubIgnorableRuntimeCaches(found.resolved))) return failExec("dirty_worktree");
  if (!isSafeManagedWorktreePath(found.resolved)) return failExec("unsafe_location");
  if ((await lstatKind(found.resolved)) !== "dir") return failExec("symlink_escape");

  worktreeInFlight = true;
  try {
    const args = buildGitWorktreeRemoveArgs(found.resolved);
    const ran = await runGit(root, args, { trackTree: true });
    if (ran.timedOut || ran.code !== 0 || ran.truncated) {
      return failExec(classifyGitWorktreeFailure({ timedOut: ran.timedOut, stderr: ran.stderr }));
    }
    const stillListed = await runGit(root, buildGitWorktreeListArgs());
    const parsed = parseWorktreePorcelainZ(stillListed.stdout, stillListed.truncated || stillListed.timedOut);
    const stillRegistered =
      parsed.ok &&
      parsed.worktrees.some((item) => {
        const resolved = realpathOrNull(item.path);
        return resolved === found.resolved || item.path === found.resolved;
      });
    if (stillRegistered) return failExec("cleanup_required");
    const cleanup = await boundedRemoveDirectory(found.resolved, managed.managedRoot);
    if (cleanup === "cleanup_required" && (await lstatKind(found.resolved)) !== "missing") {
      return failExec("cleanup_required");
    }
    const recordGone = await deleteOwnershipRecord(managed.recordsDir, token.ownershipId);
    if (!recordGone) return failExec("cleanup_required");
    return {
      ok: true,
      op: "remove",
      summary: `Removed worktree for ${token.branch}. The branch was kept.`,
      branch: token.branch,
    };
  } finally {
    worktreeInFlight = false;
    activeWorktreePid = null;
  }
}

export async function resolveGitWorktreeOpen(
  root: string,
  input: { readonly id: unknown },
): Promise<{ ok: true; path: string; name: string } | GitWorktreeExecuteErr> {
  if (typeof input.id !== "string" || input.id.length === 0) return fail("missing_worktree");
  if (worktreeInFlight) return fail("already_active");
  const inspected = await inspectRepo(root);
  if (!inspected.ok) return inspected;
  const snap = inspected.snapshot;
  const managed = await ensureManagedRoot(snap);
  const records =
    managed.ok ? await listOwnershipRecords(managed.recordsDir, managed.secret, snap.commonDir) : [];
  const found = await liveById(snap, records, input.id);
  if (!found.ok) return found;
  if (!found.resolved) return fail("missing_worktree");
  if ((await lstatKind(found.resolved)) !== "dir") return fail("symlink_escape");
  if (input.id.startsWith("s-")) {
    if (!managed.ok || !found.record) return fail("not_studio_owned");
    if (!isCanonicalPathWithinRoot(managed.managedRoot, found.resolved)) return fail("unsafe_location");
    if (!isSafeManagedWorktreePath(found.resolved)) return fail("unsafe_location");
  }
  const common =
    (await gitOk(found.resolved, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) ?? "";
  if (realpathOrNull(common) !== snap.commonDir) return fail("identity_changed");
  if ((await lstatKind(found.resolved)) !== "dir") return fail("symlink_escape");
  return { ok: true, path: found.resolved, name: path.basename(found.resolved) };
}

export async function isStudioManagedWorktreeRoot(projectRoot: string): Promise<boolean> {
  const resolved = realpathOrNull(projectRoot);
  if (!resolved) return false;
  if ((await lstatKind(resolved)) !== "dir") return false;
  if (!isOpaqueWorktreeDirName(path.basename(resolved))) return false;
  const paths = await resolveUserDataPaths();
  if (!paths) return false;
  if ((await lstatKind(paths.managedRoot)) !== "dir" || (await lstatKind(paths.recordsDir)) !== "dir") {
    return false;
  }
  const managedRoot = realpathOrNull(paths.managedRoot);
  const recordsDir = realpathOrNull(paths.recordsDir);
  if (!managedRoot || !recordsDir) return false;
  if (!isCanonicalPathWithinRoot(managedRoot, resolved)) return false;
  const secret = await hmacSecret(recordsDir);
  if (!secret) return false;
  let names: string[] = [];
  try {
    names = await fs.readdir(recordsDir);
  } catch {
    return false;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    const record = await readOwnershipRecord(recordsDir, id, secret);
    if (!record) continue;
    if (record.worktreePath === resolved || realpathOrNull(record.worktreePath) === resolved) {
      return true;
    }
  }
  return false;
}

export async function shouldPersistBryantlabsRelative(
  projectRoot: string,
  relativePath: string,
): Promise<boolean> {
  if (!(await isStudioManagedWorktreeRoot(projectRoot))) return true;
  return isAllowedManagedWorktreeMetadataRel(relativePath);
}

export function peekGitWorktreeTokenForTests(tokenId: string): TokenRecord | undefined {
  return tokens.get(tokenId);
}

export function gitWorktreeCreateArgvForTests(
  branch: string,
  managedPath: string,
  headSha: string,
): string[] {
  return buildGitWorktreeAddArgs(branch, managedPath, headSha);
}
