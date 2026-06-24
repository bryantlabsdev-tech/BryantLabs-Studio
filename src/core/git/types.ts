/** Per-file entry from `git status --porcelain`. */
export interface GitFileEntry {
  readonly path: string;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
  readonly staged: boolean;
  readonly unstaged: boolean;
  readonly untracked: boolean;
}

export interface GitStatusSnapshot {
  readonly isRepo: boolean;
  readonly branch: string | null;
  readonly files: readonly GitFileEntry[];
  readonly dirtyCount: number;
}

export interface GitDiffContents {
  readonly original: string;
  readonly modified: string;
}

export interface GitActionResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface GitCommitResult extends GitActionResult {
  readonly stdout?: string;
}
