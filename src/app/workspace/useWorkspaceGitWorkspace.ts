import { useCallback, useEffect, useRef } from "react";
import type { BryantLabsApi } from "@/types";
import {
  applySessionMemoryBranch,
  type SessionMemorySnapshot,
} from "@/core/sessionMemory";
import type { GitStatusSnapshot } from "@/core/git/types";

export function useWorkspaceGitWorkspace(input: {
  readonly api: BryantLabsApi | undefined;
  readonly projectPath: string | null;
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

  const gitPushPreflight = useCallback(async () => {
    const current = inputRef.current;
    if (!current.api?.gitPushPreflight) {
      return {
        ok: false as const,
        code: "no_project" as const,
        message: "Git push is unavailable.",
      };
    }
    const startedPath = current.projectPath;
    current.setGitActionError(null);
    const result = await current.api.gitPushPreflight();
    if (inputRef.current.projectPath !== startedPath) {
      return result;
    }
    if (!result.ok) {
      current.setGitActionError(result.message);
    }
    return result;
  }, []);

  const gitPushExecute = useCallback(
    async (token: string) => {
      const current = inputRef.current;
      if (!current.api?.gitPushExecute) {
        return {
          ok: false as const,
          code: "no_project" as const,
          message: "Git push is unavailable.",
        };
      }
      const startedPath = current.projectPath;
      current.setGitActionError(null);
      const result = await current.api.gitPushExecute(token);
      if (inputRef.current.projectPath !== startedPath) {
        return result;
      }
      if (!result.ok) {
        current.setGitActionError(result.message);
        return result;
      }
      await refreshGitStatus();
      return result;
    },
    [refreshGitStatus],
  );

  const gitPushCancel = useCallback(async (token: string) => {
    const current = inputRef.current;
    if (!current.api?.gitPushCancel) return { ok: true as const };
    return current.api.gitPushCancel(token);
  }, []);

  const gitListLocalBranches = useCallback(async () => {
    const current = inputRef.current;
    if (!current.api?.gitListLocalBranches) {
      return {
        ok: false as const,
        code: "no_project" as const,
        message: "Git branches are unavailable.",
      };
    }
    return current.api.gitListLocalBranches();
  }, []);

  const gitBranchPreflight = useCallback(
    async (payload: { readonly op: "create" | "switch"; readonly destination: string }) => {
      const current = inputRef.current;
      if (!current.api?.gitBranchPreflight) {
        return {
          ok: false as const,
          code: "no_project" as const,
          message: "Git branches are unavailable.",
        };
      }
      const startedPath = current.projectPath;
      current.setGitActionError(null);
      try {
        const result = await current.api.gitBranchPreflight(payload);
        if (inputRef.current.projectPath !== startedPath) {
          return result;
        }
        if (!result.ok) {
          current.setGitActionError(result.message);
        }
        return result;
      } catch {
        if (inputRef.current.projectPath !== startedPath) {
          return {
            ok: false as const,
            code: "generic_failure" as const,
            message: "Branch change failed.",
          };
        }
        current.setGitActionError("Branch change failed.");
        return {
          ok: false as const,
          code: "generic_failure" as const,
          message: "Branch change failed.",
        };
      }
    },
    [],
  );

  const gitBranchExecute = useCallback(
    async (token: string) => {
      const current = inputRef.current;
      if (!current.api?.gitBranchExecute) {
        return {
          ok: false as const,
          code: "no_project" as const,
          message: "Git branches are unavailable.",
        };
      }
      const startedPath = current.projectPath;
      current.setGitActionError(null);
      try {
        const result = await current.api.gitBranchExecute(token);
        if (inputRef.current.projectPath !== startedPath) {
          return result;
        }
        if (!result.ok) {
          current.setGitActionError(result.message);
          return result;
        }
        await refreshGitStatus();
        return result;
      } catch {
        if (inputRef.current.projectPath !== startedPath) {
          return {
            ok: false as const,
            code: "generic_failure" as const,
            message: "Branch change failed.",
          };
        }
        current.setGitActionError("Branch change failed.");
        return {
          ok: false as const,
          code: "generic_failure" as const,
          message: "Branch change failed.",
        };
      }
    },
    [refreshGitStatus],
  );

  const gitBranchCancel = useCallback(async (token: string) => {
    const current = inputRef.current;
    if (!current.api?.gitBranchCancel) return { ok: true as const };
    return current.api.gitBranchCancel(token);
  }, []);

  const gitListWorktrees = useCallback(async () => {
    const current = inputRef.current;
    if (!current.api?.gitListWorktrees) {
      return {
        ok: false as const,
        code: "no_project" as const,
        message: "Git worktrees are unavailable.",
      };
    }
    return current.api.gitListWorktrees();
  }, []);

  const gitWorktreeCreatePreflight = useCallback(async (payload: { readonly destinationBranch: string }) => {
    const current = inputRef.current;
    if (!current.api?.gitWorktreeCreatePreflight) {
      return {
        ok: false as const,
        code: "no_project" as const,
        message: "Git worktrees are unavailable.",
      };
    }
    const startedPath = current.projectPath;
    current.setGitActionError(null);
    try {
      const result = await current.api.gitWorktreeCreatePreflight(payload);
      if (inputRef.current.projectPath !== startedPath) return result;
      if (!result.ok) current.setGitActionError(result.message);
      return result;
    } catch {
      if (inputRef.current.projectPath !== startedPath) {
        return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
      }
      current.setGitActionError("Worktree change failed.");
      return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
    }
  }, []);

  const gitWorktreeCreateExecute = useCallback(
    async (token: string) => {
      const current = inputRef.current;
      if (!current.api?.gitWorktreeCreateExecute) {
        return { ok: false as const, code: "no_project" as const, message: "Git worktrees are unavailable." };
      }
      const startedPath = current.projectPath;
      current.setGitActionError(null);
      try {
        const result = await current.api.gitWorktreeCreateExecute(token);
        if (inputRef.current.projectPath !== startedPath) return result;
        if (!result.ok) {
          current.setGitActionError(result.message);
          return result;
        }
        await refreshGitStatus();
        return result;
      } catch {
        if (inputRef.current.projectPath !== startedPath) {
          return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
        }
        current.setGitActionError("Worktree change failed.");
        return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
      }
    },
    [refreshGitStatus],
  );

  const gitWorktreeRemovePreflight = useCallback(async (payload: { readonly id: string }) => {
    const current = inputRef.current;
    if (!current.api?.gitWorktreeRemovePreflight) {
      return { ok: false as const, code: "no_project" as const, message: "Git worktrees are unavailable." };
    }
    const startedPath = current.projectPath;
    current.setGitActionError(null);
    try {
      const result = await current.api.gitWorktreeRemovePreflight(payload);
      if (inputRef.current.projectPath !== startedPath) return result;
      if (!result.ok) current.setGitActionError(result.message);
      return result;
    } catch {
      if (inputRef.current.projectPath !== startedPath) {
        return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
      }
      current.setGitActionError("Worktree change failed.");
      return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
    }
  }, []);

  const gitWorktreeRemoveExecute = useCallback(
    async (token: string) => {
      const current = inputRef.current;
      if (!current.api?.gitWorktreeRemoveExecute) {
        return { ok: false as const, code: "no_project" as const, message: "Git worktrees are unavailable." };
      }
      const startedPath = current.projectPath;
      current.setGitActionError(null);
      try {
        const result = await current.api.gitWorktreeRemoveExecute(token);
        if (inputRef.current.projectPath !== startedPath) return result;
        if (!result.ok) {
          current.setGitActionError(result.message);
          return result;
        }
        await refreshGitStatus();
        return result;
      } catch {
        if (inputRef.current.projectPath !== startedPath) {
          return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
        }
        current.setGitActionError("Worktree change failed.");
        return { ok: false as const, code: "generic_failure" as const, message: "Worktree change failed." };
      }
    },
    [refreshGitStatus],
  );

  const gitWorktreeCancel = useCallback(async (token: string) => {
    const current = inputRef.current;
    if (!current.api?.gitWorktreeCancel) return { ok: true as const };
    return current.api.gitWorktreeCancel(token);
  }, []);

  return {
    refreshGitStatus,
    selectGitPath,
    gitStage,
    gitUnstage,
    gitRestore,
    gitCommit,
    gitPushPreflight,
    gitPushExecute,
    gitPushCancel,
    gitListLocalBranches,
    gitBranchPreflight,
    gitBranchExecute,
    gitBranchCancel,
    gitListWorktrees,
    gitWorktreeCreatePreflight,
    gitWorktreeCreateExecute,
    gitWorktreeRemovePreflight,
    gitWorktreeRemoveExecute,
    gitWorktreeCancel,
  };
}
