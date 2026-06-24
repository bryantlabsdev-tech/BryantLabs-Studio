import { useCallback, useState } from "react";
import {
  buildRunCheckpoint,
  clearRunCheckpoint,
  clearRunCheckpointAsync,
  saveRunCheckpoint,
  type PersistedRunCheckpoint,
} from "@/core/runPersistence";
import type { RunCheckpointInput } from "@/core/runPersistence/types";

export interface CheckpointWorkspaceState {
  readonly pendingRunCheckpoint: PersistedRunCheckpoint | null;
  readonly setPendingRunCheckpoint: React.Dispatch<
    React.SetStateAction<PersistedRunCheckpoint | null>
  >;
  readonly buildRunCheckpointInput: () => RunCheckpointInput | null;
  readonly settleRunCheckpoint: () => void;
  readonly syncRunCheckpoint: () => void;
}

/** Run checkpoint persistence state and sync helpers. */
export function useCheckpointWorkspaceState(
  projectPath: string | null | undefined,
  getCheckpointInput: () => RunCheckpointInput | null,
): CheckpointWorkspaceState {
  const [pendingRunCheckpoint, setPendingRunCheckpoint] =
    useState<PersistedRunCheckpoint | null>(null);

  const buildRunCheckpointInput = useCallback((): RunCheckpointInput | null => {
    if (!projectPath) return null;
    return getCheckpointInput();
  }, [projectPath, getCheckpointInput]);

  const settleRunCheckpoint = useCallback(() => {
    if (!projectPath || pendingRunCheckpoint) return;
    const input = buildRunCheckpointInput();
    if (!input) return;
    const cp = buildRunCheckpoint(input);
    if (!cp) {
      clearRunCheckpoint(projectPath);
      void clearRunCheckpointAsync(projectPath);
    }
  }, [projectPath, pendingRunCheckpoint, buildRunCheckpointInput]);

  const syncRunCheckpoint = useCallback(() => {
    if (!projectPath) return;
    const input = buildRunCheckpointInput();
    if (!input) return;
    const cp = buildRunCheckpoint(input);
    if (cp) {
      saveRunCheckpoint(cp);
      return;
    }
    if (!pendingRunCheckpoint) {
      clearRunCheckpoint(projectPath);
      void clearRunCheckpointAsync(projectPath);
    }
  }, [projectPath, buildRunCheckpointInput, pendingRunCheckpoint]);

  return {
    pendingRunCheckpoint,
    setPendingRunCheckpoint,
    buildRunCheckpointInput,
    settleRunCheckpoint,
    syncRunCheckpoint,
  };
}
