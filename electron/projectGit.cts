import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

interface GitFileEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

interface GitStatusSnapshot {
  isRepo: boolean;
  branch: string | null;
  files: GitFileEntry[];
  dirtyCount: number;
}

interface GitDiffContents {
  original: string;
  modified: string;
}

interface GitCommitResult {
  ok: boolean;
  reason?: string;
  stdout?: string;
}

function parseGitPorcelainLine(line: string): GitFileEntry | null {
  const trimmed = line.trimEnd();
  if (trimmed.length < 4 || trimmed.startsWith("?")) return null;
  const indexStatus = trimmed[0] ?? " ";
  const worktreeStatus = trimmed[1] ?? " ";
  let filePath = trimmed.slice(3).trim();
  const renameSep = filePath.indexOf(" -> ");
  if (renameSep !== -1) {
    filePath = filePath.slice(renameSep + 4).trim();
  }
  if (!filePath) return null;
  const untracked = indexStatus === "?" && worktreeStatus === "?";
  const staged =
    !untracked && indexStatus !== " " && indexStatus !== "?";
  const unstaged =
    !untracked && worktreeStatus !== " " && worktreeStatus !== "?";
  return {
    path: filePath,
    indexStatus,
    worktreeStatus,
    staged,
    unstaged,
    untracked,
  };
}

function parseGitPorcelain(stdout: string): GitFileEntry[] {
  const files: GitFileEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("??") || line.startsWith("? ")) {
      const filePath = line.startsWith("??")
        ? line.slice(3).trim()
        : line.slice(2).trim();
      if (!filePath) continue;
      files.push({
        path: filePath,
        indexStatus: "?",
        worktreeStatus: "?",
        staged: false,
        unstaged: false,
        untracked: true,
      });
      continue;
    }
    const entry = parseGitPorcelainLine(line);
    if (entry) files.push(entry);
  }
  return files;
}

function gitDirtyCount(files: readonly GitFileEntry[]): number {
  return files.filter((f) => f.untracked || f.unstaged || f.staged).length;
}

const exec = promisify(execFile);

const GIT_TIMEOUT_MS = 15_000;

async function runGit(
  root: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await exec("git", args, {
    cwd: root,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8",
  });
  return {
    stdout: stdout ?? "",
    stderr: stderr ?? "",
  };
}

export async function isGitRepository(root: string): Promise<boolean> {
  try {
    await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

/** Read-only: current git branch name, or null if unavailable. */
export async function getGitBranch(root: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = stdout.trim();
    return branch.length > 0 && branch !== "HEAD" ? branch : null;
  } catch {
    return null;
  }
}

export async function getGitStatus(root: string): Promise<GitStatusSnapshot> {
  const isRepo = await isGitRepository(root);
  if (!isRepo) {
    return { isRepo: false, branch: null, files: [], dirtyCount: 0 };
  }
  const branch = await getGitBranch(root);
  try {
    const { stdout } = await runGit(root, [
      "status",
      "--porcelain=v1",
      "-u",
      "--no-renames",
    ]);
    const files = parseGitPorcelain(stdout);
    return {
      isRepo: true,
      branch,
      files,
      dirtyCount: gitDirtyCount(files),
    };
  } catch {
    return { isRepo: true, branch, files: [], dirtyCount: 0 };
  }
}

function resolveRepoPath(root: string, relPath: string): string | null {
  if (typeof relPath !== "string" || relPath.length === 0) return null;
  if (relPath.includes("\0")) return null;
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) return null;
  const abs = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  if (abs !== resolvedRoot && !abs.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return normalized;
}

export async function getGitDiffContents(
  root: string,
  relPath: string,
): Promise<GitDiffContents & { error?: string }> {
  const safe = resolveRepoPath(root, relPath);
  if (!safe) {
    return { original: "", modified: "", error: "Invalid file path." };
  }
  const abs = path.join(root, safe);
  let modified = "";
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      return { original: "", modified: "", error: "Not a file." };
    }
    const buf = await fs.readFile(abs);
    if (buf.includes(0)) {
      return { original: "", modified: "", error: "Binary file." };
    }
    modified = buf.toString("utf8");
  } catch {
    return { original: "", modified: "", error: "Could not read file." };
  }

  let original = "";
  try {
    const { stdout } = await runGit(root, ["show", `HEAD:${safe}`]);
    original = stdout;
  } catch {
    original = "";
  }
  return { original, modified };
}

export async function stageGitPaths(
  root: string,
  paths: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const safe = paths
    .map((p) => resolveRepoPath(root, p))
    .filter((p): p is string => p !== null);
  if (safe.length === 0) {
    return { ok: false, reason: "No valid paths to stage." };
  }
  try {
    await runGit(root, ["add", "--", ...safe]);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "git add failed.";
    return { ok: false, reason: message };
  }
}

/** Discard local changes — tracked files revert to HEAD; untracked paths are removed. */
export async function restoreGitPaths(
  root: string,
  paths: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const safe = paths
    .map((p) => resolveRepoPath(root, p))
    .filter((p): p is string => p !== null);
  if (safe.length === 0) {
    return { ok: false, reason: "No valid paths to restore." };
  }
  const status = await getGitStatus(root);
  if (!status.isRepo) {
    return { ok: false, reason: "Not a git repository." };
  }
  const safeSet = new Set(safe);
  const untracked = status.files
    .filter((f) => f.untracked && safeSet.has(f.path))
    .map((f) => f.path);
  const tracked = safe.filter((p) => !untracked.includes(p));
  try {
    if (tracked.length > 0) {
      await runGit(root, [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        "--",
        ...tracked,
      ]);
    }
    if (untracked.length > 0) {
      await runGit(root, ["clean", "-fd", "--", ...untracked]);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "git restore failed.";
    return { ok: false, reason: message };
  }
}

export async function unstageGitPaths(
  root: string,
  paths: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const safe = paths
    .map((p) => resolveRepoPath(root, p))
    .filter((p): p is string => p !== null);
  if (safe.length === 0) {
    return { ok: false, reason: "No valid paths to unstage." };
  }
  try {
    await runGit(root, ["restore", "--staged", "--", ...safe]);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "git unstage failed.";
    return { ok: false, reason: message };
  }
}

export async function commitGit(
  root: string,
  message: string,
): Promise<GitCommitResult> {
  const trimmed = message.trim();
  if (trimmed.length < 1) {
    return { ok: false, reason: "Commit message is required." };
  }
  if (trimmed.length > 5000) {
    return { ok: false, reason: "Commit message is too long." };
  }
  try {
    const { stdout } = await runGit(root, ["commit", "-m", trimmed]);
    return { ok: true, stdout: stdout.trim() };
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "git commit failed.";
    return { ok: false, reason: messageText };
  }
}
