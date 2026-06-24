import type { GitFileEntry } from "@/core/git/types";

/** Parse one line of `git status --porcelain=v1` output. */
export function parseGitPorcelainLine(line: string): GitFileEntry | null {
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

export function parseGitPorcelain(stdout: string): GitFileEntry[] {
  const files: GitFileEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("??") || line.startsWith("? ")) {
      const path = line.startsWith("??")
        ? line.slice(3).trim()
        : line.slice(2).trim();
      if (!path) continue;
      files.push({
        path,
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

export function gitDirtyCount(files: readonly GitFileEntry[]): number {
  return files.filter((f) => f.untracked || f.unstaged || f.staged).length;
}
