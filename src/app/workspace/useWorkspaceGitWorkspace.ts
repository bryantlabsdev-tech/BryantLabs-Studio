import { useCallback, useEffect, useRef } from "react";
import type { BryantLabsApi } from "@/types";
import {
  applySessionMemoryBranch,
  type SessionMemorySnapshot,
} from "@/core/sessionMemory";
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
  const inputRef = useRef(input);
  inputRef.current = input;

  const refreshGitStatus = useCallback(async () => {
    const current = inputRef.current;
    if (!current.api?.getGitStatus) {
      current.setGitStatus(null);
      return;
    }
    current.setGitStatusLoading(true);
    current.setGitActionError(null);
    try {
      const snapshot = await current.api.getGitStatus();
      current.setGitStatus(snapshot);
      if (snapshot?.branch) {
        const branch = snapshot.branch;
        current.setSessionMemory((prev) => applySessionMemoryBranch(prev, branch));
      }
    } catch {
      current.setGitActionError("Could not load git status.");
      current.setGitStatus(null);
    } finally {
      current.setGitStatusLoading(false);
    }
  }, []);

  const selectGitPath = useCallback((relPath: string | null) => {
    inputRef.current.setSelectedGitPath(relPath);
  }, []);

  useEffect(() => {
    const current = inputRef.current;
    if (!current.api?.getGitDiffContents || !input.selectedGitPath) {
      current.setGitDiff(null);
      current.setGitDiffError(null);
      current.setGitDiffLoading(false);
      return;
    }
    let cancelled = false;
    current.setGitDiffLoading(true);
    current.setGitDiffError(null);
    void current.api
      .getGitDiffContents(input.selectedGitPath)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          current.setGitDiff(null);
          current.setGitDiffError(result.error);
        } else {
          current.setGitDiff({
            original: result.original,
            modified: result.modified,
          });
          current.setGitDiffError(null);
        }
        current.setGitDiffLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        current.setGitDiffError("Could not load diff.");
        current.setGitDiff(null);
        current.setGitDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input.api, input.selectedGitPath]);

  const gitStage = useCallback(
    async (paths: string[]) => {
      const current = inputRef.current;
      if (!current.api?.gitStage) {
        return { ok: false, reason: "Git is unavailable." };
      }
      current.setGitActionError(null);
      const result = await current.api.gitStage(paths);
      if (!result.ok) {
        current.setGitActionError(result.reason ?? "Stage failed.");
        return result;
      }
      await refreshGitStatus();
      return result;
    },
    [refreshGitStatus],
  );

  const gitUnstage = useCallback(
    async (paths: string[]) => {
      const current = inputRef.current;
      if (!current.api?.gitUnstage) {
        return { ok: false, reason: "Git is unavailable." };
      }
      current.setGitActionError(null);
      const result = await current.api.gitUnstage(paths);
      if (!result.ok) {
        current.setGitActionError(result.reason ?? "Unstage failed.");
        return result;
      }
      await refreshGitStatus();
      return result;
    },
    [refreshGitStatus],
  );

  const gitRestore = useCallback(
    async (paths: string[]) => {
      const current = inputRef.current;
      if (!current.api?.gitRestore) {
        return { ok: false, reason: "Git is unavailable." };
      }
      current.setGitActionError(null);
      const result = await current.api.gitRestore(paths);
      if (!result.ok) {
        current.setGitActionError(result.reason ?? "Restore failed.");
        return result;
      }
      if (current.selectedGitPath && paths.includes(current.selectedGitPath)) {
        current.setSelectedGitPath(null);
        current.setGitDiff(null);
      }
      await refreshGitStatus();
      return result;
    },
    [refreshGitStatus],
  );

  const gitCommit = useCallback(
    async (message: string) => {
      const current = inputRef.current;
      if (!current.api?.gitCommit) {
        return { ok: false, reason: "Git is unavailable." };
      }
      current.setGitActionError(null);
      const result = await current.api.gitCommit(message);
      if (!result.ok) {
        current.setGitActionError(result.reason ?? "Commit failed.");
        return result;
      }
      await refreshGitStatus();
      return result;
    },
    [refreshGitStatus],
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
