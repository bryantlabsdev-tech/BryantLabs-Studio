import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import { MonacoDiffView } from "@/components/editor/MonacoDiffView";
import type { GitFileEntry } from "@/core/git/types";

function statusLabel(entry: GitFileEntry): string {
  if (entry.untracked) return "Untracked";
  if (entry.staged && entry.unstaged) return "Staged + modified";
  if (entry.staged) return "Staged";
  if (entry.unstaged) return "Modified";
  return "Changed";
}

function GitFileRow({
  entry,
  selected,
  onSelect,
  onStage,
  onUnstage,
  onRestore,
}: {
  entry: GitFileEntry;
  selected: boolean;
  onSelect: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onRestore: (path: string) => void;
}) {
  return (
    <li
      className={`git-view__file${selected ? " git-view__file--on" : ""}`}
    >
      <button
        type="button"
        className="git-view__file-main"
        onClick={() => onSelect(entry.path)}
      >
        <span className="git-view__file-path">{entry.path}</span>
        <span className="git-view__file-badge">{statusLabel(entry)}</span>
      </button>
      <div className="git-view__file-actions">
        {entry.untracked || entry.unstaged ? (
          <button
            type="button"
            className="git-view__mini-btn"
            onClick={() => onStage(entry.path)}
          >
            Stage
          </button>
        ) : null}
        {entry.staged ? (
          <button
            type="button"
            className="git-view__mini-btn"
            onClick={() => onUnstage(entry.path)}
          >
            Unstage
          </button>
        ) : null}
        {entry.untracked || entry.unstaged || entry.staged ? (
          <button
            type="button"
            className="git-view__mini-btn git-view__mini-btn--danger"
            onClick={() => onRestore(entry.path)}
            title="Discard all local changes for this file"
          >
            Restore
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** Git panel — status, stage/unstage, diff review, and commit. */
export function GitView() {
  const {
    project,
    gitStatus,
    gitStatusLoading,
    gitActionError,
    selectedGitPath,
    gitDiff,
    gitDiffLoading,
    gitDiffError,
    refreshGitStatus,
    gitStage,
    gitUnstage,
    gitRestore,
    gitCommit,
    selectGitPath,
    openPath,
  } = useWorkspace();

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);

  const stagedFiles = useMemo(
    () => gitStatus?.files.filter((f) => f.staged) ?? [],
    [gitStatus?.files],
  );
  const unstagedFiles = useMemo(
    () =>
      gitStatus?.files.filter((f) => f.unstaged && !f.untracked) ?? [],
    [gitStatus?.files],
  );
  const untrackedFiles = useMemo(
    () => gitStatus?.files.filter((f) => f.untracked) ?? [],
    [gitStatus?.files],
  );

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    const result = await gitCommit(commitMessage);
    setCommitting(false);
    if (result.ok) {
      setCommitMessage("");
    }
  }, [commitMessage, gitCommit]);

  useEffect(() => {
    if (!gitStatus?.files.length) return;
    if (
      selectedGitPath &&
      gitStatus.files.some((f) => f.path === selectedGitPath)
    ) {
      return;
    }
    selectGitPath(gitStatus.files[0]?.path ?? null);
  }, [gitStatus, selectedGitPath, selectGitPath]);

  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to view git status and commit changes."
      />
    );
  }

  if (!gitStatus?.isRepo) {
    return (
      <EmptyState
        title="Not a git repository"
        description="This folder is not inside a git work tree. Initialize git in the project to use version control here."
      />
    );
  }

  return (
    <div className="git-view">
      <header className="git-view__header">
        <div className="git-view__meta">
          <span className="git-view__branch">
            {gitStatus.branch ?? "detached"}
          </span>
          <span className="git-view__dirty">
            {gitStatus.dirtyCount === 0
              ? "Clean working tree"
              : `${gitStatus.dirtyCount} change${gitStatus.dirtyCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <button
          type="button"
          className="git-view__refresh"
          onClick={() => void refreshGitStatus()}
          disabled={gitStatusLoading}
        >
          {gitStatusLoading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {gitActionError ? (
        <p className="git-view__error" role="alert">
          {gitActionError}
        </p>
      ) : null}

      <div className="git-view__layout">
        <aside className="git-view__sidebar">
          <section className="git-view__section">
            <div className="git-view__section-head">
              <h3 className="git-view__section-title">Staged</h3>
              {stagedFiles.length > 0 ? (
                <button
                  type="button"
                  className="git-view__section-action"
                  onClick={() =>
                    void gitUnstage(stagedFiles.map((f) => f.path))
                  }
                >
                  Unstage all
                </button>
              ) : null}
            </div>
            {stagedFiles.length === 0 ? (
              <p className="git-view__empty">No staged changes</p>
            ) : (
              <ul className="git-view__files">
                {stagedFiles.map((entry) => (
                  <GitFileRow
                    key={`staged:${entry.path}`}
                    entry={entry}
                    selected={selectedGitPath === entry.path}
                    onSelect={selectGitPath}
                    onStage={(p) => void gitStage([p])}
                    onUnstage={(p) => void gitUnstage([p])}
                    onRestore={(p) => void gitRestore([p])}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="git-view__section">
            <div className="git-view__section-head">
              <h3 className="git-view__section-title">Changes</h3>
              {unstagedFiles.length > 0 ? (
                <button
                  type="button"
                  className="git-view__section-action"
                  onClick={() =>
                    void gitStage(unstagedFiles.map((f) => f.path))
                  }
                >
                  Stage all
                </button>
              ) : null}
            </div>
            {unstagedFiles.length === 0 ? (
              <p className="git-view__empty">No unstaged changes</p>
            ) : (
              <ul className="git-view__files">
                {unstagedFiles.map((entry) => (
                  <GitFileRow
                    key={`unstaged:${entry.path}`}
                    entry={entry}
                    selected={selectedGitPath === entry.path}
                    onSelect={selectGitPath}
                    onStage={(p) => void gitStage([p])}
                    onUnstage={(p) => void gitUnstage([p])}
                    onRestore={(p) => void gitRestore([p])}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="git-view__section">
            <div className="git-view__section-head">
              <h3 className="git-view__section-title">Untracked</h3>
              {untrackedFiles.length > 0 ? (
                <button
                  type="button"
                  className="git-view__section-action"
                  onClick={() =>
                    void gitStage(untrackedFiles.map((f) => f.path))
                  }
                >
                  Stage all
                </button>
              ) : null}
            </div>
            {untrackedFiles.length === 0 ? (
              <p className="git-view__empty">No untracked files</p>
            ) : (
              <ul className="git-view__files">
                {untrackedFiles.map((entry) => (
                  <GitFileRow
                    key={`untracked:${entry.path}`}
                    entry={entry}
                    selected={selectedGitPath === entry.path}
                    onSelect={selectGitPath}
                    onStage={(p) => void gitStage([p])}
                    onUnstage={(p) => void gitUnstage([p])}
                    onRestore={(p) => void gitRestore([p])}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="git-view__commit">
            <label className="git-view__commit-label" htmlFor="git-commit-msg">
              Commit message
            </label>
            <textarea
              id="git-commit-msg"
              className="git-view__commit-input"
              rows={3}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe your changes…"
            />
            <button
              type="button"
              className="git-view__commit-btn"
              disabled={committing || stagedFiles.length === 0 || !commitMessage.trim()}
              onClick={() => void handleCommit()}
            >
              {committing ? "Committing…" : `Commit (${stagedFiles.length} staged)`}
            </button>
          </section>
        </aside>

        <div className="git-view__diff">
          {selectedGitPath ? (
            <>
              <div className="git-view__diff-head">
                <span className="git-view__diff-path">{selectedGitPath}</span>
                <button
                  type="button"
                  className="git-view__mini-btn"
                  onClick={() => openPath(selectedGitPath)}
                >
                  Open file
                </button>
              </div>
              {gitDiffLoading ? (
                <p className="git-view__empty">Loading diff…</p>
              ) : gitDiffError ? (
                <p className="git-view__error">{gitDiffError}</p>
              ) : gitDiff ? (
                <MonacoDiffView
                  relPath={selectedGitPath}
                  original={gitDiff.original}
                  modified={gitDiff.modified}
                  language={null}
                />
              ) : (
                <p className="git-view__empty">Select a file to preview changes.</p>
              )}
            </>
          ) : (
            <p className="git-view__empty">Select a file to preview changes.</p>
          )}
        </div>
      </div>
    </div>
  );
}
