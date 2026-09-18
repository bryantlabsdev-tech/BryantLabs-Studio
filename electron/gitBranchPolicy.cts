/**
 * Shared Git-branch policy (no filesystem, no process spawn).
 *
 * Electron main cannot import this file (electron/tsconfig rootDir is electron/).
 * Keep electron/gitBranchPolicy.cts in lockstep; shared vectors prove identical
 * argv and name-validation behavior.
 *
 * Create uses `git switch --no-guess --create <name>` with no start-point.
 * `--end-of-options` cannot sit between `--create`/`-c` and the new name because
 * Git consumes the next operand as the branch name (verified on Apple Git 2.50.1).
 * Switch uses `git switch --no-guess --end-of-options <existing-local-branch>`.
 *
 * Dirty-tree ignore list is only untracked Studio hydrate/index cache files.
 * Tracked, staged, deleted, renamed, mcp.json, and unknown `.bryantlabs`
 * paths remain dirty. See STUDIO_RUNTIME_METADATA_PATHS.
 */

import { gitSafeConfigPrefix, isSafeGitBranchName } from "./gitPushPolicy.cjs";

export {
  isSafeGitBranchName,
  gitSafeConfigPrefix,
  redactSensitiveText,
} from "./gitPushPolicy.cjs";

export const MAX_LOCAL_BRANCHES = 256;
export const GIT_BRANCH_TIMEOUT_MS = 15_000;
export const GIT_BRANCH_PREFLIGHT_TTL_MS = 120_000;
export const GIT_BRANCH_MAX_TOKENS = 8;
export const MAX_BRANCH_OUTPUT_CHARS = 8_192;

/**
 * Exact Git-relative paths ignored only as untracked (`?`) porcelain v2 records.
 * Matching is `===` on the canonical Git path: no prefix, suffix, basename,
 * slash-folding, or case-folding.
 *
 * Kept only because the product writes them by opening/hydrating/indexing, and
 * they are derived caches — not instructions, tools, permissions, providers,
 * execution policy, or project configuration:
 *
 * - `.bryantlabs/session-memory.json` — written when a project is bound/opened
 * - `.bryantlabs/semantic-index/v1.json` — `hydrateSemanticIndex` on project switch
 * - `.bryantlabs/scan-manifest/v1.json` — project index activate/scan
 *
 * Not ignored: `.bryantlabs/mcp.json` (user MCP servers), `rules.md`,
 * agent/project memory, follow-up chat, features inventory,
 * run checkpoints, shadow-runs, directories, and any unknown path.
 */
export const STUDIO_RUNTIME_METADATA_PATHS: readonly string[] = [
  ".bryantlabs/session-memory.json",
  ".bryantlabs/semantic-index/v1.json",
  ".bryantlabs/scan-manifest/v1.json",
];

export const GIT_BRANCH_ALIAS_CLEARS: readonly string[] = [
  "alias.switch=",
  "alias.checkout=",
  "alias.branch=",
  "alias.status=",
  "alias.rev-parse=",
  "alias.for-each-ref=",
  "alias.symbolic-ref=",
  "alias.check-ref-format=",
];

export type GitBranchOp = "create" | "switch";

export type GitBranchFailureCode =
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
  | "no_such_branch"
  | "already_on_branch"
  | "branch_or_head_changed"
  | "already_active"
  | "cancelled"
  | "token_invalid"
  | "token_expired"
  | "timeout"
  | "generic_failure";

export interface GitBranchListOk {
  readonly ok: true;
  readonly currentBranch: string;
  readonly headSha: string;
  readonly dirty: boolean;
  readonly branches: readonly string[];
}

export interface GitBranchListErr {
  readonly ok: false;
  readonly code: GitBranchFailureCode;
  readonly message: string;
}

export type GitBranchListResult = GitBranchListOk | GitBranchListErr;

export interface GitBranchPreflightOk {
  readonly ok: true;
  readonly token: string;
  readonly op: GitBranchOp;
  readonly currentBranch: string;
  readonly headSha: string;
  readonly destination: string;
}

export interface GitBranchPreflightErr {
  readonly ok: false;
  readonly code: GitBranchFailureCode;
  readonly message: string;
}

export type GitBranchPreflightResult = GitBranchPreflightOk | GitBranchPreflightErr;

export interface GitBranchExecuteOk {
  readonly ok: true;
  readonly op: GitBranchOp;
  readonly branch: string;
  readonly summary: string;
}

export interface GitBranchExecuteErr {
  readonly ok: false;
  readonly code: GitBranchFailureCode;
  readonly message: string;
}

export type GitBranchExecuteResult = GitBranchExecuteOk | GitBranchExecuteErr;

export function isSafeLocalBranchName(name: string): boolean {
  if (!isSafeGitBranchName(name)) return false;
  if (name.startsWith("origin/") || name.startsWith("refs/")) return false;
  return true;
}

export function gitBranchSafeConfigPrefix(): string[] {
  const extra: string[] = [];
  for (const assignment of GIT_BRANCH_ALIAS_CLEARS) {
    extra.push("-c", assignment);
  }
  return [...gitSafeConfigPrefix(false), ...extra];
}

export function buildGitBranchCreateArgs(branch: string): string[] {
  if (!isSafeLocalBranchName(branch)) {
    throw new Error("invalid_branch");
  }
  return [...gitBranchSafeConfigPrefix(), "switch", "--no-guess", "--create", branch];
}

export function buildGitBranchSwitchArgs(branch: string): string[] {
  if (!isSafeLocalBranchName(branch)) {
    throw new Error("invalid_branch");
  }
  return [
    ...gitBranchSafeConfigPrefix(),
    "switch",
    "--no-guess",
    "--end-of-options",
    branch,
  ];
}

export function isIgnorableStudioRuntimeUntracked(gitRelativePath: string): boolean {
  if (typeof gitRelativePath !== "string" || gitRelativePath.length === 0) return false;
  if (gitRelativePath.includes("\0") || gitRelativePath.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(gitRelativePath)) return false;
  for (const allowed of STUDIO_RUNTIME_METADATA_PATHS) {
    if (gitRelativePath === allowed) return true;
  }
  return false;
}

function ordinaryRecordPath(record: string): string | null {
  // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
  const match = record.match(/^1 ([^\s]{2}) ([^\s]+) [0-7]{6} [0-7]{6} [0-7]{6} [0-9a-f]{40} [0-9a-f]{40} (.*)$/i);
  if (!match) return null;
  const sub = match[2] ?? "";
  if (sub.startsWith("S") || sub.startsWith("C")) return null;
  const path = match[3] ?? "";
  if (!path) return null;
  return path;
}

function renameRecordPath(record: string): string | null {
  // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>
  const match = record.match(
    /^2 ([^\s]{2}) ([^\s]+) [0-7]{6} [0-7]{6} [0-7]{6} [0-9a-f]{40} [0-9a-f]{40} [A-Z]\d+ (.*)$/i,
  );
  if (!match) return null;
  return match[3] ?? null;
}

/**
 * Parse `git status --porcelain=v2 -z --untracked-files=all`.
 * Any parse failure, truncation, submodule, conflict, rename, staged change,
 * or non-ignorable untracked path makes the tree dirty.
 */
export function porcelainV2IndicatesDirty(stdout: string, truncated: boolean): boolean {
  return ignorableRuntimeUntrackedPaths(stdout, truncated) === null;
}

/** Returns ignorable untracked paths when the tree is otherwise clean; null if dirty/malformed. */
export function ignorableRuntimeUntrackedPaths(stdout: string, truncated: boolean): string[] | null {
  if (truncated) return null;
  if (!stdout) return [];
  const ignorable: string[] = [];
  const records = stdout.split("\0");
  for (let i = 0; i < records.length; i += 1) {
    const raw = records[i] ?? "";
    if (!raw) continue;
    if (raw.startsWith("#")) continue;
    if (raw.startsWith("! ")) continue;
    if (raw.startsWith("? ")) {
      const path = raw.slice(2);
      if (!isIgnorableStudioRuntimeUntracked(path)) return null;
      ignorable.push(path);
      continue;
    }
    if (raw.startsWith("u ")) return null;
    if (raw.startsWith("1 ")) {
      const path = ordinaryRecordPath(raw);
      if (!path) return null;
      return null;
    }
    if (raw.startsWith("2 ")) {
      if (!renameRecordPath(raw)) return null;
      i += 1;
      return null;
    }
    return null;
  }
  return ignorable;
}

export function parseNulRefNames(stdout: string, truncated: boolean): readonly string[] | null {
  if (truncated) return null;
  const names: string[] = [];
  for (const part of stdout.split("\0")) {
    const token = part.replace(/^\n+|\n+$/g, "").trim();
    if (!token) continue;
    if (!token.startsWith("refs/heads/")) return null;
    const name = token.slice("refs/heads/".length);
    if (!isSafeLocalBranchName(name)) return null;
    names.push(name);
    if (names.length > MAX_LOCAL_BRANCHES) return names.slice(0, MAX_LOCAL_BRANCHES);
  }
  return names;
}

export function hasCaseInsensitiveBranchCollision(
  destination: string,
  branches: readonly string[],
): boolean {
  const folded = destination.toLowerCase();
  return branches.some((name) => name !== destination && name.toLowerCase() === folded);
}

export function branchFailureMessage(code: GitBranchFailureCode): string {
  switch (code) {
    case "no_project":
      return "Open a project before changing branches.";
    case "outside_root":
      return "This Git repository is outside the opened project.";
    case "not_a_worktree":
      return "The opened folder is not a Git worktree.";
    case "bare_repository":
      return "Cannot create or switch branches in a bare repository.";
    case "detached_head":
      return "Cannot create or switch branches from a detached HEAD.";
    case "unborn_head":
      return "Cannot create or switch branches because this repository has no commits.";
    case "invalid_branch":
      return "That branch name is not allowed.";
    case "operation_in_progress":
      return "Finish merge, rebase, cherry-pick, revert, or bisect before changing branches.";
    case "dirty_worktree":
      return "Commit or discard local changes before creating or switching branches.";
    case "branch_exists":
      return "A local branch with that name already exists.";
    case "no_such_branch":
      return "That local branch does not exist.";
    case "already_on_branch":
      return "Already on that branch.";
    case "branch_or_head_changed":
      return "The branch or HEAD changed. Start again from the Git view.";
    case "already_active":
      return "A branch change is already in progress.";
    case "cancelled":
      return "Branch change cancelled.";
    case "token_invalid":
    case "token_expired":
      return "Branch approval expired. Start again from the Git view.";
    case "timeout":
      return "The branch change timed out.";
    default:
      return "Branch change failed.";
  }
}

export function classifyGitBranchFailure(input: {
  readonly timedOut?: boolean;
  readonly stderr: string;
  readonly stdout?: string;
}): GitBranchFailureCode {
  if (input.timedOut) return "timeout";
  const blob = `${input.stdout ?? ""}\n${input.stderr}`.toLowerCase();
  if (!blob.trim()) return "generic_failure";
  if (/already exists|a branch named/.test(blob)) return "branch_exists";
  if (/did not match any|unknown revision|invalid reference|pathspec .* did not match/.test(blob)) {
    return "no_such_branch";
  }
  if (/your local changes|would be overwritten|uncommitted changes|dirty/.test(blob)) {
    return "dirty_worktree";
  }
  if (/detached/.test(blob)) return "detached_head";
  return "generic_failure";
}
