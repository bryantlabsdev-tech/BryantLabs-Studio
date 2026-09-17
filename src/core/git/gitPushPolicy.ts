/**
 * Shared Git-push policy (no filesystem, no process spawn).
 *
 * Electron main cannot import this file (electron/tsconfig rootDir is electron/).
 * Keep electron/gitPushPolicy.cts in lockstep; shared vectors prove identical
 * sanitize/classify/argv behavior.
 */

export const GIT_PUSH_REMOTE = "origin";
export const MAX_PUSH_COMMIT_SUBJECTS = 20;
export const MAX_PUSH_SUBJECT_CHARS = 120;
export const MAX_PUSH_OUTPUT_CHARS = 8_192;
export const GIT_PUSH_TIMEOUT_MS = 60_000;
export const GIT_PUSH_PREFLIGHT_TTL_MS = 120_000;
export const GIT_PUSH_MAX_TOKENS = 8;
export const GIT_HOOKS_DISABLED_PATH = "/dev/null";

export type GitPushFailureCode =
  | "no_project"
  | "outside_root"
  | "not_a_worktree"
  | "no_origin"
  | "unsafe_remote"
  | "detached_head"
  | "unborn_head"
  | "invalid_branch"
  | "operation_in_progress"
  | "default_branch"
  | "mismatched_upstream"
  | "nothing_to_push"
  | "non_fast_forward"
  | "authentication_failure"
  | "network_failure"
  | "timeout"
  | "branch_or_head_changed"
  | "push_already_active"
  | "cancelled"
  | "token_invalid"
  | "token_expired"
  | "generic_failure";

export interface GitPushCommitSubject {
  readonly subject: string;
}

export interface GitPushPreflightOk {
  readonly ok: true;
  readonly token: string;
  readonly identity: string;
  readonly originDisplay: string;
  readonly branch: string;
  readonly upstream: string | null;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly commitCount: number;
  readonly commitSubjects: readonly GitPushCommitSubject[];
  readonly dirty: boolean;
  readonly dirtyWarning: string | null;
  readonly networkMayBeRequired: boolean;
  readonly setUpstream: boolean;
}

export interface GitPushPreflightErr {
  readonly ok: false;
  readonly code: GitPushFailureCode;
  readonly message: string;
}

export type GitPushPreflightResult = GitPushPreflightOk | GitPushPreflightErr;

export interface GitPushExecuteOk {
  readonly ok: true;
  readonly branch: string;
  readonly setUpstream: boolean;
  readonly summary: string;
}

export interface GitPushExecuteErr {
  readonly ok: false;
  readonly code: GitPushFailureCode;
  readonly message: string;
}

export type GitPushExecuteResult = GitPushExecuteOk | GitPushExecuteErr;

export interface SanitizeGitRemoteOk {
  readonly ok: true;
  readonly display: string;
  readonly networkMayBeRequired: boolean;
  readonly kind: "https" | "ssh" | "local";
}

export type SanitizeGitRemoteResult = SanitizeGitRemoteOk | { readonly ok: false };

/**
 * Inherited by Git subprocesses so `ssh` and OS credential helpers can run.
 * Everything else from the Studio process is dropped, including GIT_SSH_COMMAND,
 * GIT_ASKPASS, GIT_CONFIG_*, GIT_DIR, pager/editor, and trace variables.
 * GIT_CONFIG_NOSYSTEM is not set: system/global credential helpers remain available.
 */
export const GIT_PUSH_ENV_KEEP = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "USERNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOMESHARE",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "PROGRAMDATA",
  "APPDATA",
  "LOCALAPPDATA",
] as const;

export const GIT_PUSH_ENV_DROP = [
  "GIT_SSH_COMMAND",
  "GIT_SSH",
  "GIT_PROXY_COMMAND",
  "GIT_ASKPASS",
  "SSH_ASKPASS",
  "GIT_CONFIG_COUNT",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_QUARANTINE_PATH",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PAGER",
  "GIT_EDITOR",
  "EDITOR",
  "VISUAL",
  "PAGER",
  "GIT_TRACE",
  "GIT_TRACE2",
  "GIT_TRACE2_EVENT",
  "GIT_TRACE2_PERF",
  "GIT_TRACE_PACKET",
  "GIT_TRACE_PERFORMANCE",
  "GIT_TRACE_SETUP",
  "GIT_TRACE_PACKFILE",
  "GIT_EXEC_PATH",
  "GIT_TEMPLATE_DIR",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  "GIT_OPTIONAL_LOCKS",
  "GIT_PROTOCOL",
  "GIT_HTTP_USER_AGENT",
  "GIT_CURL_VERBOSE",
  "GIT_SSL_NO_VERIFY",
  "GIT_ALLOW_PROTOCOL",
  "GIT_FLUSH",
  "GIT_REF_PARANOIA",
  "GIT_ATTR_SOURCE",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_PARAMETERS",
  "GIT_PREFIX",
] as const;

const TOKEN_RE = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{8,}\b/g;
const PAT_RE = /\bgithub_pat_[A-Za-z0-9_]{8,}\b/g;
const GLPAT_RE = /\bglpat-[A-Za-z0-9_\-]{8,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]+/gi;
const USERINFO_URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^/\s]*:[^/\s]*@/gi;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const REMOTE_HELPER_RE = /^[A-Za-z0-9][A-Za-z0-9+.-]*::/;

export function gitSafeConfigPrefix(allowLocalRemotes: boolean): string[] {
  return [
    "-c",
    `core.hooksPath=${GIT_HOOKS_DISABLED_PATH}`,
    "-c",
    "alias.push=",
    "-c",
    "core.sshCommand=",
    "-c",
    "core.gitProxy=",
    "-c",
    "core.pager=cat",
    "-c",
    "core.editor=true",
    "-c",
    "protocol.ext.allow=never",
    "-c",
    allowLocalRemotes ? "protocol.file.allow=always" : "protocol.file.allow=never",
  ];
}

export function gitPushRefspec(branch: string): string {
  return `refs/heads/${branch}:refs/heads/${branch}`;
}

export function isSafeGitBranchName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0 || name.length > 200) return false;
  if (name === "HEAD" || name === "@") return false;
  if (name.startsWith("-") || name.startsWith(".") || name.startsWith("/")) return false;
  if (name.endsWith(".") || name.endsWith("/") || name.endsWith(".lock")) return false;
  if (name.includes("..") || name.includes("//") || name.includes("@{")) return false;
  if (name.includes("\\") || name.includes("\0") || name.includes(" ")) return false;
  if (CONTROL_RE.test(name)) return false;
  if (/[~^:?*[]/.test(name)) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) return false;
  return name.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function isProtectedDefaultBranch(
  branch: string,
  detectedDefault: string | null,
): boolean {
  if (branch === "main" || branch === "master") return true;
  return Boolean(detectedDefault && branch === detectedDefault);
}

export function buildGitPushArgs(input: {
  readonly branch: string;
  readonly setUpstream: boolean;
  readonly allowLocalRemotes?: boolean;
}): string[] {
  if (!isSafeGitBranchName(input.branch)) {
    throw new Error("invalid_branch");
  }
  const refspec = gitPushRefspec(input.branch);
  const push = input.setUpstream
    ? ["push", "--no-verify", "--set-upstream"]
    : ["push", "--no-verify"];
  return [
    ...gitSafeConfigPrefix(Boolean(input.allowLocalRemotes)),
    ...push,
    "--end-of-options",
    GIT_PUSH_REMOTE,
    refspec,
  ];
}

function isSafeHost(host: string): boolean {
  if (!host || host.length > 253 || host.startsWith("-") || host.includes("..")) return false;
  return /^[A-Za-z0-9.-]+$/.test(host);
}

function isSafeRepoPath(repoPath: string): boolean {
  if (!repoPath || repoPath.startsWith("-") || repoPath.includes("..")) return false;
  if (CONTROL_RE.test(repoPath) || repoPath.includes("\\") || repoPath.includes("//")) return false;
  return /^[A-Za-z0-9._/~+-]+$/.test(repoPath);
}

export function sanitizeGitRemoteUrl(
  raw: string,
  options?: { readonly allowLocalRemotes?: boolean },
): SanitizeGitRemoteResult {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return { ok: false };
  if (CONTROL_RE.test(raw) || raw.includes("\0")) return { ok: false };
  const trimmed = raw.trim();
  if (trimmed !== raw.trim() || trimmed.startsWith("-")) return { ok: false };
  if (REMOTE_HELPER_RE.test(trimmed) || /^ext::/i.test(trimmed)) return { ok: false };
  if (trimmed.includes("://") && /[\s<>"|]/.test(trimmed)) return { ok: false };

  const allowLocal = Boolean(options?.allowLocalRemotes);

  if (/^https:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { ok: false };
    }
    if (parsed.protocol !== "https:") return { ok: false };
    if (parsed.username || parsed.password) return { ok: false };
    if (parsed.hash || parsed.search) return { ok: false };
    const host = parsed.hostname.trim();
    if (!isSafeHost(host)) return { ok: false };
    const pathName = parsed.pathname.replace(/\/+$/, "");
    if (!pathName || pathName.includes("..")) return { ok: false };
    return {
      ok: true,
      display: `${host}${pathName}`,
      networkMayBeRequired: true,
      kind: "https",
    };
  }

  if (/^ssh:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { ok: false };
    }
    if (parsed.protocol !== "ssh:") return { ok: false };
    if (parsed.password) return { ok: false };
    if (parsed.username && !/^[A-Za-z0-9._-]+$/.test(parsed.username)) return { ok: false };
    if (parsed.hash || parsed.search) return { ok: false };
    const host = parsed.hostname.trim();
    if (!isSafeHost(host)) return { ok: false };
    const pathName = parsed.pathname.replace(/\/+$/, "") || "";
    if (!pathName || pathName.includes("..")) return { ok: false };
    const userPrefix = parsed.username ? `${parsed.username}@` : "";
    return {
      ok: true,
      display: `${userPrefix}${host}${pathName}`,
      networkMayBeRequired: true,
      kind: "ssh",
    };
  }

  const scp = trimmed.match(/^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+):(.+)$/);
  if (scp) {
    const user = scp[1] ?? "";
    const host = scp[2] ?? "";
    const repo = scp[3] ?? "";
    if (!isSafeHost(host) || !isSafeRepoPath(repo)) return { ok: false };
    const displayRepo = repo.replace(/\.git$/, "");
    return {
      ok: true,
      display: `${user}@${host}/${displayRepo}`.replace(/^git@/, ""),
      networkMayBeRequired: true,
      kind: "ssh",
    };
  }

  if (allowLocal) {
    if (trimmed.startsWith("file://")) {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        return { ok: false };
      }
      if (parsed.username || parsed.password) return { ok: false };
      const base = parsed.pathname.split("/").filter(Boolean).pop() ?? "repo";
      return { ok: true, display: `local:${base}`, networkMayBeRequired: false, kind: "local" };
    }
    if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
      if (trimmed.includes("@") || trimmed.includes("://")) return { ok: false };
      const base = trimmed.split(/[/\\]/).filter(Boolean).pop() ?? "repo";
      return { ok: true, display: `local:${base}`, networkMayBeRequired: false, kind: "local" };
    }
  }

  return { ok: false };
}

export function redactSensitiveText(text: string): string {
  if (!text) return "";
  let out = text.replace(USERINFO_URL_RE, "[redacted-url]");
  out = out.replace(TOKEN_RE, "[redacted-token]");
  out = out.replace(PAT_RE, "[redacted-token]");
  out = out.replace(GLPAT_RE, "[redacted-token]");
  out = out.replace(BEARER_RE, "Bearer [redacted]");
  out = out.replace(/https?:\/\/[^\s]+/gi, (url) => {
    const sanitized = sanitizeGitRemoteUrl(url);
    return sanitized.ok ? sanitized.display : "[redacted-url]";
  });
  out = out.replace(/ssh:\/\/[^\s]+/gi, "[redacted-url]");
  if (out.length > MAX_PUSH_OUTPUT_CHARS) {
    return `${out.slice(0, MAX_PUSH_OUTPUT_CHARS)}\n[truncated]`;
  }
  return out;
}

export function classifyGitPushFailure(input: {
  readonly timedOut?: boolean;
  readonly stderr: string;
  readonly stdout?: string;
}): GitPushFailureCode {
  if (input.timedOut) return "timeout";
  const blob = `${input.stdout ?? ""}\n${input.stderr}`.toLowerCase();
  if (!blob.trim()) return "generic_failure";
  if (
    /non-fast-forward|failed to push some refs|\[rejected\].*\(fetch first\)|\[rejected\].*non-fast-forward/.test(
      blob,
    )
  ) {
    return "non_fast_forward";
  }
  if (
    /authentication failed|could not read username|permission denied \(publickey\)|401\b|403\b|invalid.*credentials|terminal prompts disabled/.test(
      blob,
    )
  ) {
    return "authentication_failure";
  }
  if (
    /could not resolve host|unable to access|network is unreachable|connection timed out|failed to connect|the remote end hung up/.test(
      blob,
    )
  ) {
    return "network_failure";
  }
  if (/everything up-to-date/.test(blob)) return "nothing_to_push";
  return "generic_failure";
}

export function failureMessage(code: GitPushFailureCode): string {
  switch (code) {
    case "no_project":
      return "Open a project before pushing.";
    case "outside_root":
      return "This Git repository is outside the opened project.";
    case "not_a_worktree":
      return "The opened folder is not a Git worktree.";
    case "no_origin":
      return "No origin remote is configured.";
    case "unsafe_remote":
      return "The origin URL is not allowed for Studio push.";
    case "detached_head":
      return "Cannot push from a detached HEAD.";
    case "unborn_head":
      return "Cannot push because this branch has no commits.";
    case "invalid_branch":
      return "The current branch name is not allowed.";
    case "operation_in_progress":
      return "Finish merge, rebase, cherry-pick, or bisect before pushing.";
    case "default_branch":
      return "Direct pushes from main, master, or the repository default branch are not allowed.";
    case "mismatched_upstream":
      return "Upstream must be origin/<current-branch>.";
    case "nothing_to_push":
      return "There are no commits to push on this branch.";
    case "non_fast_forward":
      return "The remote branch moved. Force-push is not available.";
    case "authentication_failure":
      return "Git authentication failed. Use your normal Git credentials and try again.";
    case "network_failure":
      return "The remote could not be reached.";
    case "timeout":
      return "The push timed out.";
    case "branch_or_head_changed":
      return "The branch or HEAD changed. Start a new push from the Git view.";
    case "push_already_active":
      return "A push is already in progress.";
    case "cancelled":
      return "Push cancelled.";
    case "token_invalid":
    case "token_expired":
      return "Push approval expired. Start a new push from the Git view.";
    default:
      return "Push failed.";
  }
}

export function boundCommitSubjects(subjects: readonly string[]): GitPushCommitSubject[] {
  return subjects.slice(0, MAX_PUSH_COMMIT_SUBJECTS).map((subject) => ({
    subject:
      subject.length > MAX_PUSH_SUBJECT_CHARS
        ? `${subject.slice(0, MAX_PUSH_SUBJECT_CHARS - 1)}…`
        : subject,
  }));
}

export function envKeyLooksUnsafe(key: string): boolean {
  if (GIT_PUSH_ENV_DROP.includes(key as (typeof GIT_PUSH_ENV_DROP)[number])) return true;
  if (key.startsWith("GIT_CONFIG_KEY_") || key.startsWith("GIT_CONFIG_VALUE_")) return true;
  if (key.startsWith("GIT_TRACE")) return true;
  return false;
}
