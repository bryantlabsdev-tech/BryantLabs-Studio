import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/app/workspaceContext";
import { EmptyState } from "@/components/EmptyState";
import { MonacoDiffView } from "@/components/editor/MonacoDiffView";
import type { GitFileEntry } from "@/core/git/types";
import type { GitPushPreflightOk } from "@/core/git/gitPushPolicy";

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
    gitPushPreflight,
    gitPushExecute,
    gitPushCancel,
    selectGitPath,
    openPath,
  } = useWorkspace();

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushPreflight, setPushPreflight] = useState<GitPushPreflightOk | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const projectPath = project?.path ?? null;
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const tokenRef = useRef<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const aliveRef = useRef(true);

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

  const closePushDialog = useCallback(() => {
    const id = tokenRef.current;
    tokenRef.current = null;
    setPushPreflight(null);
    if (id) void gitPushCancel(id);
  }, [gitPushCancel]);

  const handlePushClick = useCallback(async () => {
    if (pushing || pushPreflight) return;
    setPushNotice(null);
    const pathAtStart = projectPathRef.current;
    const result = await gitPushPreflight();
    if (!aliveRef.current || pathAtStart !== projectPathRef.current) {
      if (result.ok) void gitPushCancel(result.token);
      return;
    }
    if (!result.ok) return;
    tokenRef.current = result.token;
    setPushPreflight(result);
  }, [gitPushCancel, gitPushPreflight, pushing, pushPreflight]);

  const handlePushConfirm = useCallback(async () => {
    if (!pushPreflight || pushing) return;
    const pathAtStart = projectPathRef.current;
    const token = pushPreflight.token;
    setPushing(true);
    const result = await gitPushExecute(token);
    tokenRef.current = null;
    if (!aliveRef.current || pathAtStart !== projectPathRef.current) {
      return;
    }
    setPushing(false);
    setPushPreflight(null);
    if (result.ok) {
      setPushNotice(`Pushed ${result.branch} to origin.`);
    }
  }, [gitPushExecute, pushPreflight, pushing]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      const id = tokenRef.current;
      tokenRef.current = null;
      if (id) void gitPushCancel(id);
    };
  }, [gitPushCancel]);

  useEffect(() => {
    setPushPreflight(null);
    setPushing(false);
    setPushNotice(null);
    const id = tokenRef.current;
    tokenRef.current = null;
    if (id) void gitPushCancel(id);
  }, [projectPath, gitPushCancel]);

  useEffect(() => {
    if (!pushPreflight) return;
    cancelButtonRef.current?.focus();
  }, [pushPreflight]);

  useEffect(() => {
    if (!pushPreflight) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pushing) return;
      event.preventDefault();
      closePushDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePushDialog, pushPreflight, pushing]);

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
        <div className="git-view__header-actions">
          <button
            type="button"
            className="git-view__refresh"
            onClick={() => void refreshGitStatus()}
            disabled={gitStatusLoading || pushing}
          >
            {gitStatusLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="git-view__push"
            data-testid="git-push-btn"
            aria-label="Push current branch to origin"
            aria-haspopup="dialog"
            onClick={() => void handlePushClick()}
            disabled={gitStatusLoading || pushing || pushPreflight !== null}
          >
            Push
          </button>
        </div>
      </header>

      {gitActionError ? (
        <p className="git-view__error" role="alert">
          {gitActionError}
        </p>
      ) : null}

      {pushNotice ? (
        <p className="git-view__notice" role="status">
          {pushNotice}
        </p>
      ) : null}

      {pushPreflight ? (
        <div
          className="git-push-dialog__backdrop"
          role="presentation"
          onClick={() => {
            if (!pushing) closePushDialog();
          }}
        >
          <div
            className="git-push-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="git-push-title"
            aria-describedby="git-push-lead git-push-irreversible"
            data-testid="git-push-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="git-push-title" className="git-push-dialog__title">
              Push this branch to origin?
            </h3>
            <p id="git-push-lead" className="git-push-dialog__lead">
              This updates the remote repository at{" "}
              <strong>{pushPreflight.originDisplay}</strong> by pushing{" "}
              <strong>{pushPreflight.branch}</strong> to{" "}
              <strong>origin/{pushPreflight.branch}</strong>.
            </p>
            <p id="git-push-irreversible" className="git-push-dialog__lead">
              This change on the remote cannot be undone from Studio. Force-push is
              not available. Confirming sends only this branch.
            </p>
            <dl className="git-push-dialog__facts">
              <div>
                <dt>Repository</dt>
                <dd>{pushPreflight.identity}</dd>
              </div>
              <div>
                <dt>Remote</dt>
                <dd>origin ({pushPreflight.originDisplay})</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{pushPreflight.branch}</dd>
              </div>
              <div>
                <dt>Upstream</dt>
                <dd>
                  {pushPreflight.upstream
                    ? pushPreflight.upstream
                    : "none — first push will set origin/" + pushPreflight.branch}
                </dd>
              </div>
              <div>
                <dt>Ahead / behind</dt>
                <dd>
                  {pushPreflight.ahead ?? "—"} ahead, {pushPreflight.behind ?? "—"} behind
                </dd>
              </div>
              <div>
                <dt>Commits</dt>
                <dd>{pushPreflight.commitCount}</dd>
              </div>
            </dl>
            {pushPreflight.commitSubjects.length > 0 ? (
              <ul className="git-push-dialog__commits">
                {pushPreflight.commitSubjects.map((item, index) => (
                  <li key={`${index}:${item.subject}`}>{item.subject}</li>
                ))}
              </ul>
            ) : null}
            {pushPreflight.dirtyWarning ? (
              <p className="git-push-dialog__warning" data-testid="git-push-dirty-warning">
                {pushPreflight.dirtyWarning}
              </p>
            ) : null}
            <p className="git-push-dialog__auth">
              {pushPreflight.networkMayBeRequired
                ? "This remote may require network access and your normal Git credentials."
                : "This remote is local; no network authentication is required."}
            </p>
            <div className="git-push-dialog__actions">
              <button
                type="button"
                ref={cancelButtonRef}
                className="git-view__refresh"
                data-testid="git-push-cancel"
                aria-label="Cancel push"
                disabled={pushing}
                onClick={() => closePushDialog()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="git-view__push git-view__push--confirm"
                data-testid="git-push-confirm"
                aria-label="Confirm push to origin"
                aria-busy={pushing}
                disabled={pushing}
                onClick={() => void handlePushConfirm()}
              >
                {pushing ? "Pushing…" : "Confirm push"}
              </button>
            </div>
          </div>
        </div>
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
