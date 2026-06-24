import { useCallback, useEffect } from "react";
import type { BryantLabsApi } from "@/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { GitStatusSnapshot } from "@/core/git/types";

export function useWorkspaceGitWorkspace(input: {
  readonly api: BryantLabsApi | undefined;
  readonly selectedGitPath: string | null;
  readonly setGitStatus: React.Dispatch<React.SetStateAction<GitStatusSnapshot | null>>;
  readonly setGitStatusLoading: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setGitActionError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setSelectedGitPath: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setGitDiff: React.Dispatch<
    React.SetStateAction<{ original: string; modified: string } | null>
  >;
  readonly setGitDiffLoading: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setGitDiffError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setSessionMemory: React.Dispatch<React.SetStateAction<SessionMemorySnapshot>>;
}) {
  const refreshGitStatus = useCallback(async () => {
    if (!input.api?.getGitStatus) {
      input.setGitStatus(null);
      return;
    }
    input.setGitStatusLoading(true);
    input.setGitActionError(null);
    try {
      const snapshot = await input.api.getGitStatus();
      input.setGitStatus(snapshot);
      if (snapshot?.branch) {
        input.setSessionMemory((prev) =>
          prev.projectPath ? { ...prev, branch: snapshot.branch } : prev,
        );
      }
    } catch {
      input.setGitActionError("Could not load git status.");
      input.setGitStatus(null);
    } finally {
      input.setGitStatusLoading(false);
    }
  }, [input]);

  const selectGitPath = useCallback((relPath: string | null) => {
    input.setSelectedGitPath(relPath);
  }, [input]);

  useEffect(() => {
    if (!input.api?.getGitDiffContents || !input.selectedGitPath) {
      input.setGitDiff(null);
      input.setGitDiffError(null);
      input.setGitDiffLoading(false);
      return;
    }
    let cancelled = false;
    input.setGitDiffLoading(true);
    input.setGitDiffError(null);
    void input.api
      .getGitDiffContents(input.selectedGitPath)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          input.setGitDiff(null);
          input.setGitDiffError(result.error);
        } else {
          input.setGitDiff({
            original: result.original,
            modified: result.modified,
          });
          input.setGitDiffError(null);
        }
        input.setGitDiffLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        input.setGitDiffError("Could not load diff.");
        input.setGitDiff(null);
        input.setGitDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input.api, input.selectedGitPath, input]);

  const gitStage = useCallback(
    async (paths: string[]) => {
      if (!input.api?.gitStage) {
        return { ok: false, reason: "Git is unavailable." };
      }
      input.setGitActionError(null);
      const result = await input.api.gitStage(paths);
      if (!result.ok) {
        input.setGitActionError(result.reason ?? "Stage failed.");
        return result;
      }
      await refreshGitStatus();
      return result;
    },
    [input, refreshGitStatus],
  );

  const gitUnstage = useCallback(
    async (paths: string[]) => {
      if (!input.api?.gitUnstage) {
        return { ok: false, reason: "Git is unavailable." };
      }
      input.setGitActionError(null);
      const result = await input.api.gitUnstage(paths);
      if (!result.ok) {
        input.setGitActionError(result.reason ?? "Unstage failed.");
        return result;
      }
      await refreshGitStatus();
      return result;
    },
    [input, refreshGitStatus],
  );

  const gitRestore = useCallback(
    async (paths: string[]) => {
      if (!input.api?.gitRestore) {
        return { ok: false, reason: "Git is unavailable." };
      }
      input.setGitActionError(null);
      const result = await input.api.gitRestore(paths);
      if (!result.ok) {
        input.setGitActionError(result.reason ?? "Restore failed.");
        return result;
      }
      if (input.selectedGitPath && paths.includes(input.selectedGitPath)) {
        input.setSelectedGitPath(null);
        input.setGitDiff(null);
      }
      await refreshGitStatus();
      return result;
    },
    [input, refreshGitStatus],
  );

  const gitCommit = useCallback(
    async (message: string) => {
      if (!input.api?.gitCommit) {
        return { ok: false, reason: "Git is unavailable." };
      }
      input.setGitActionError(null);
      const result = await input.api.gitCommit(message);
      if (!result.ok) {
        input.setGitActionError(result.reason ?? "Commit failed.");
        return result;
      }
      await refreshGitStatus();
      return result;
    },
    [input, refreshGitStatus],
  );

  return {
    refreshGitStatus,
    selectGitPath,
    gitStage,
    gitUnstage,
    gitRestore,
    gitCommit,
  };
}
