/**
 * Shared Studio-managed Git worktree policy (no filesystem, no process spawn).
 *
 * Electron main cannot import this file (electron/tsconfig rootDir is electron/).
 * Keep electron/gitWorktreePolicy.cts in lockstep; shared vectors prove identical
 * argv, porcelain parsing, and name-validation behavior.
 *
 * Create uses `git worktree add --no-guess-remote -b <branch> --end-of-options
 * <managed-path> <exact-40-char-HEAD>`. `-b` consumes the next operand as the
 * branch name, so `--end-of-options` sits after `-b <name>` (Apple Git 2.50.1).
 * Remove uses `git worktree remove --end-of-options <path>` without `--force`.
 * Rollback may `git branch --delete --end-of-options <name>` only for a branch
 * proven created by that same operation.
 */

import {
  gitBranchSafeConfigPrefix,
  isIgnorableStudioRuntimeUntracked,
  isSafeLocalBranchName,
} from "./gitBranchPolicy";

export {
  isSafeLocalBranchName,
  porcelainV2IndicatesDirty,
  ignorableRuntimeUntrackedPaths,
  STUDIO_RUNTIME_METADATA_PATHS,
  hasCaseInsensitiveBranchCollision,
  redactSensitiveText,
  parseNulRefNames,
  MAX_LOCAL_BRANCHES,
  isIgnorableStudioRuntimeUntracked,
} from "./gitBranchPolicy";

export const GIT_WORKTREE_TIMEOUT_MS = 20_000;
export const GIT_WORKTREE_PREFLIGHT_TTL_MS = 120_000;
export const GIT_WORKTREE_MAX_TOKENS = 8;
export const MAX_WORKTREES = 32;
export const MAX_WORKTREE_PATH_CHARS = 1024;
export const MAX_WORKTREE_OUTPUT_CHARS = 16_384;
export const MAX_WORKTREE_BRANCH_CHARS = 255;
export const WORKTREE_DIR_PREFIX = "wt-";
export const WORKTREE_DIR_HEX_LEN = 32;
export const OWNERSHIP_RECORD_VERSION = 1;
export const MAX_OWNERSHIP_RECORD_BYTES = 4_096;
export const HMAC_KEY_BYTES = 32;
export const FORBIDDEN_GREENFIELD_MAIN = "/private/tmp/bryantlabs-greenfield-main";

export const GIT_WORKTREE_ALIAS_CLEARS: readonly string[] = ["alias.worktree="];

export type GitWorktreeOp = "create" | "remove";

export type GitWorktreeKind = "main" | "studio" | "external";

export type GitWorktreeFailureCode =
  | "no_project"
  | "outside_root"
  | "not_a_worktree"
  | "bare_repository"
  | "detached_head"
  | "unborn_head"
  | "invalid_branch"
  | "operation_in_progress"
  | "dirty_worktree"
  | "branch_exists"
  | "path_exists"
  | "unsafe_location"
  | "too_many_worktrees"
  | "malformed_list"
  | "locked_worktree"
  | "prunable_worktree"
  | "missing_worktree"
  | "not_studio_owned"
  | "is_main_worktree"
  | "is_active_worktree"
  | "identity_changed"
  | "unexpected_files"
  | "symlink_escape"
  | "cleanup_required"
  | "already_active"
  | "cancelled"
  | "token_invalid"
  | "token_expired"
  | "stale_project"
  | "timeout"
  | "generic_failure";

export interface GitWorktreeListEntry {
  readonly id: string;
  readonly kind: GitWorktreeKind;
  readonly branch: string | null;
  readonly headShort: string;
  readonly dirty: boolean;
  readonly active: boolean;
  readonly locked: boolean;
  readonly missing: boolean;
  readonly displayLabel: string;
  readonly locationLabel: string;
  readonly canOpen: boolean;
  readonly canRemove: boolean;
}

export interface GitWorktreeListOk {
  readonly ok: true;
  readonly entries: readonly GitWorktreeListEntry[];
}

export interface GitWorktreeListErr {
  readonly ok: false;
  readonly code: GitWorktreeFailureCode;
  readonly message: string;
}

export type GitWorktreeListResult = GitWorktreeListOk | GitWorktreeListErr;

export interface GitWorktreeCreatePreflightOk {
  readonly ok: true;
  readonly token: string;
  readonly op: "create";
  readonly sourceBranch: string;
  readonly destinationBranch: string;
  readonly headSha: string;
  readonly locationLabel: string;
}

export interface GitWorktreeRemovePreflightOk {
  readonly ok: true;
  readonly token: string;
  readonly op: "remove";
  readonly worktreeId: string;
  readonly branch: string;
  readonly headSha: string;
  readonly locationLabel: string;
}

export interface GitWorktreePreflightErr {
  readonly ok: false;
  readonly code: GitWorktreeFailureCode;
  readonly message: string;
}

export type GitWorktreeCreatePreflightResult =
  | GitWorktreeCreatePreflightOk
  | GitWorktreePreflightErr;
export type GitWorktreeRemovePreflightResult =
  | GitWorktreeRemovePreflightOk
  | GitWorktreePreflightErr;

export interface GitWorktreeExecuteOk {
  readonly ok: true;
  readonly op: GitWorktreeOp;
  readonly summary: string;
  readonly branch?: string;
  readonly worktreeId?: string;
}

export interface GitWorktreeExecuteErr {
  readonly ok: false;
  readonly code: GitWorktreeFailureCode;
  readonly message: string;
}

export type GitWorktreeExecuteResult = GitWorktreeExecuteOk | GitWorktreeExecuteErr;

export interface GitWorktreeOpenOk {
  readonly ok: true;
  readonly project: { readonly path: string; readonly name: string };
}

export type GitWorktreeOpenResult = GitWorktreeOpenOk | GitWorktreeExecuteErr;

export interface ParsedWorktree {
  readonly path: string;
  readonly head: string | null;
  readonly branch: string | null;
  readonly bare: boolean;
  readonly detached: boolean;
  readonly locked: boolean;
  readonly prunable: boolean;
}

export type WorktreeParseFailure = "truncated" | "malformed" | "oversized" | "too_many";

export function gitWorktreeSafeConfigPrefix(): string[] {
  const extra: string[] = [];
  for (const assignment of GIT_WORKTREE_ALIAS_CLEARS) {
    extra.push("-c", assignment);
  }
  return [...gitBranchSafeConfigPrefix(), ...extra];
}

export function isExactHeadSha(value: string): boolean {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

export function isAllowedManagedWorktreeMetadataRel(relativePath: string): boolean {
  if (typeof relativePath !== "string" || relativePath.length === 0) return false;
  const norm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm || norm.includes("..") || norm.includes("\0")) return false;
  return isIgnorableStudioRuntimeUntracked(`.bryantlabs/${norm}`);
}

export function isOpaqueWorktreeDirName(name: string): boolean {
  return (
    typeof name === "string" &&
    new RegExp(`^${WORKTREE_DIR_PREFIX}[0-9a-f]{${WORKTREE_DIR_HEX_LEN}}$`).test(name)
  );
}

export function isSafeManagedWorktreePath(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.length > MAX_WORKTREE_PATH_CHARS) return false;
  if (!value.startsWith("/")) return false;
  if (value.includes("\0") || value.includes("//")) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.includes("\\")) return false;
  const base = value.slice(value.lastIndexOf("/") + 1);
  return isOpaqueWorktreeDirName(base);
}

export function buildGitWorktreeListArgs(): string[] {
  return [...gitWorktreeSafeConfigPrefix(), "worktree", "list", "--porcelain", "-z"];
}

export function buildGitWorktreeAddArgs(
  branch: string,
  managedPath: string,
  headSha: string,
): string[] {
  if (!isSafeLocalBranchName(branch)) throw new Error("invalid_branch");
  if (!isSafeManagedWorktreePath(managedPath)) throw new Error("unsafe_location");
  if (!isExactHeadSha(headSha)) throw new Error("invalid_branch");
  return [
    ...gitWorktreeSafeConfigPrefix(),
    "worktree",
    "add",
    "--no-guess-remote",
    "-b",
    branch,
    "--end-of-options",
    managedPath,
    headSha,
  ];
}

export function buildGitWorktreeRemoveArgs(managedPath: string): string[] {
  if (!isSafeManagedWorktreePath(managedPath)) throw new Error("unsafe_location");
  return [
    ...gitWorktreeSafeConfigPrefix(),
    "worktree",
    "remove",
    "--end-of-options",
    managedPath,
  ];
}

export function buildGitWorktreeRollbackBranchDeleteArgs(branch: string): string[] {
  if (!isSafeLocalBranchName(branch)) throw new Error("invalid_branch");
  return [
    ...gitWorktreeSafeConfigPrefix(),
    "branch",
    "--delete",
    "--end-of-options",
    branch,
  ];
}

const KNOWN_WORKTREE_KEYS = new Set([
  "worktree",
  "HEAD",
  "branch",
  "bare",
  "detached",
  "locked",
  "prunable",
]);

function parseWorktreeField(field: string): { key: string; value: string } | null {
  if (!field) return null;
  if (field === "bare" || field === "detached" || field === "locked" || field === "prunable") {
    return { key: field, value: "" };
  }
  const space = field.indexOf(" ");
  if (space <= 0) return null;
  return { key: field.slice(0, space), value: field.slice(space + 1) };
}

function isSafeListedPath(value: string): boolean {
  if (!value.startsWith("/") || value.length > MAX_WORKTREE_PATH_CHARS) return false;
  if (value.includes("\0") || value.includes("\\") || value.includes("//")) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

export function parseWorktreePorcelainZ(
  stdout: string,
  truncated: boolean,
): { readonly ok: true; readonly worktrees: readonly ParsedWorktree[] } | { readonly ok: false; readonly reason: WorktreeParseFailure } {
  if (truncated) return { ok: false, reason: "truncated" };
  if (typeof stdout !== "string") return { ok: false, reason: "malformed" };
  if (stdout.length > MAX_WORKTREE_OUTPUT_CHARS) return { ok: false, reason: "oversized" };
  if (!stdout) return { ok: false, reason: "malformed" };

  const records = stdout.split("\0\0");
  const worktrees: ParsedWorktree[] = [];
  for (const record of records) {
    if (!record || record === "\0") continue;
    const fields = record.split("\0").filter((part) => part.length > 0);
    if (fields.length === 0) continue;
    let pathValue = "";
    let head: string | null = null;
    let branch: string | null = null;
    let bare = false;
    let detached = false;
    let locked = false;
    let prunable = false;
    const seenKeys = new Set<string>();
    for (const field of fields) {
      const parsed = parseWorktreeField(field);
      if (!parsed || !KNOWN_WORKTREE_KEYS.has(parsed.key)) {
        return { ok: false, reason: "malformed" };
      }
      if (seenKeys.has(parsed.key)) return { ok: false, reason: "malformed" };
      seenKeys.add(parsed.key);
      if (parsed.key === "worktree") {
        if (!isSafeListedPath(parsed.value)) return { ok: false, reason: "malformed" };
        pathValue = parsed.value;
        continue;
      }
      if (parsed.key === "HEAD") {
        const sha = parsed.value.trim().toLowerCase();
        if (!isExactHeadSha(sha)) return { ok: false, reason: "malformed" };
        head = sha;
        continue;
      }
      if (parsed.key === "branch") {
        if (!parsed.value.startsWith("refs/heads/")) return { ok: false, reason: "malformed" };
        const name = parsed.value.slice("refs/heads/".length);
        if (name.length > MAX_WORKTREE_BRANCH_CHARS) return { ok: false, reason: "malformed" };
        if (!isSafeLocalBranchName(name)) return { ok: false, reason: "malformed" };
        branch = name;
        continue;
      }
      if (parsed.key === "bare") bare = true;
      if (parsed.key === "detached") detached = true;
      if (parsed.key === "locked") locked = true;
      if (parsed.key === "prunable") prunable = true;
    }
    if (!pathValue && !bare) return { ok: false, reason: "malformed" };
    if (bare) continue;
    if (!head) return { ok: false, reason: "malformed" };
    if (detached && branch) return { ok: false, reason: "malformed" };
    worktrees.push({
      path: pathValue,
      head,
      branch,
      bare,
      detached,
      locked,
      prunable,
    });
    if (worktrees.length > MAX_WORKTREES) return { ok: false, reason: "too_many" };
  }
  const paths = new Set<string>();
  const branches = new Set<string>();
  for (const item of worktrees) {
    if (paths.has(item.path)) return { ok: false, reason: "malformed" };
    paths.add(item.path);
    if (item.branch) {
      if (branches.has(item.branch)) return { ok: false, reason: "malformed" };
      branches.add(item.branch);
    }
  }
  if (worktrees.length === 0) return { ok: false, reason: "malformed" };
  return { ok: true, worktrees };
}

export function ownershipFingerprintPayload(input: {
  readonly version: number;
  readonly ownershipId: string;
  readonly repoCommonDir: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly headSha: string;
  readonly createdAt: number;
}): string {
  return [
    String(input.version),
    input.ownershipId,
    input.repoCommonDir,
    input.worktreePath,
    input.branch,
    input.headSha,
    String(input.createdAt),
  ].join("\0");
}

export function worktreeLocationLabel(kind: GitWorktreeKind, dirName?: string): string {
  if (kind === "main") return "Repository";
  if (kind === "studio") {
    const suffix = typeof dirName === "string" && dirName.length >= 8 ? dirName.slice(-8) : "managed";
    return `Studio (${suffix})`;
  }
  return "External";
}

export function worktreeDisplayLabel(kind: GitWorktreeKind): string {
  if (kind === "main") return "Main worktree";
  if (kind === "studio") return "Studio worktree";
  return "Other worktree";
}

export function worktreeFailureMessage(code: GitWorktreeFailureCode): string {
  switch (code) {
    case "no_project":
      return "Open a project before managing worktrees.";
    case "outside_root":
      return "This Git repository is outside the opened project.";
    case "not_a_worktree":
      return "The opened folder is not a Git worktree.";
    case "bare_repository":
      return "Cannot manage worktrees in a bare repository.";
    case "detached_head":
      return "Cannot create a worktree from a detached HEAD.";
    case "unborn_head":
      return "Cannot create a worktree because this repository has no commits.";
    case "invalid_branch":
      return "That branch name is not allowed.";
    case "operation_in_progress":
      return "Finish merge, rebase, cherry-pick, revert, or bisect before changing worktrees.";
    case "dirty_worktree":
      return "Commit or discard local changes before creating or removing a worktree.";
    case "branch_exists":
      return "A local branch with that name already exists.";
    case "path_exists":
      return "The generated worktree location already exists.";
    case "unsafe_location":
      return "Studio cannot create a worktree at that location.";
    case "too_many_worktrees":
      return "This repository has too many worktrees to list safely.";
    case "malformed_list":
      return "Git worktree output could not be parsed safely.";
    case "locked_worktree":
      return "That worktree is locked.";
    case "prunable_worktree":
      return "That worktree is not in a removable state.";
    case "missing_worktree":
      return "That worktree directory is missing.";
    case "not_studio_owned":
      return "Studio can only remove worktrees it created.";
    case "is_main_worktree":
      return "The main worktree cannot be removed.";
    case "is_active_worktree":
      return "Switch away from this worktree before removing it.";
    case "identity_changed":
      return "The worktree changed after confirmation. Start again from the Git view.";
    case "unexpected_files":
      return "The managed directory contains unexpected files and was not deleted.";
    case "symlink_escape":
      return "That worktree path is not a regular directory Studio can manage.";
    case "cleanup_required":
      return "The worktree was unregistered, but Studio could not safely delete its directory.";
    case "already_active":
      return "A Git worktree operation is already running.";
    case "cancelled":
      return "The worktree operation was cancelled.";
    case "token_invalid":
    case "token_expired":
      return "Worktree approval expired. Start again from the Git view.";
    case "stale_project":
      return "The open project changed. Start again from the Git view.";
    case "timeout":
      return "The Git worktree operation timed out.";
    default:
      return "The Git worktree operation failed.";
  }
}

export function classifyGitWorktreeFailure(input: {
  readonly timedOut?: boolean;
  readonly stderr?: string;
}): GitWorktreeFailureCode {
  if (input.timedOut) return "timeout";
  const stderr = input.stderr ?? "";
  if (/already exists/i.test(stderr) && /branch/i.test(stderr)) return "branch_exists";
  if (/already exists/i.test(stderr)) return "path_exists";
  if (/not a valid branch/i.test(stderr) || /not a valid ref/i.test(stderr)) return "invalid_branch";
  if (/locked/i.test(stderr)) return "locked_worktree";
  if (/dirty|local changes|uncommitted/i.test(stderr)) return "dirty_worktree";
  if (/bare/i.test(stderr)) return "bare_repository";
  return "generic_failure";
}
