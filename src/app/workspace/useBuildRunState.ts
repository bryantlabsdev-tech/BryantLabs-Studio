import { useCallback, useRef, useState } from "react";
import { logRunFailureFromSnapshot, resetRunFailureLogDedupe } from "@/core/agent/runFailureDiagnostics";
import {
  emptyGreenfieldRun,
  appendGreenfieldRunEntry,
  applyGreenfieldRunUpdate,
  greenfieldRunSnapshotsEqual,
  type GreenfieldRunSnapshot,
} from "@/core/greenfield/runState";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

export interface BuildRunWorkspaceState {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly setGreenfieldRun: React.Dispatch<React.SetStateAction<GreenfieldRunSnapshot>>;
  readonly greenfieldRunControlRef: React.MutableRefObject<{
    cancel: () => void;
    runRepair?: () => Promise<void>;
  } | null>;
  readonly updateGreenfieldRun: (
    patch:
      | Partial<GreenfieldRunSnapshot>
      | ((prev: GreenfieldRunSnapshot) => Partial<GreenfieldRunSnapshot>),
  ) => void;
  readonly resetGreenfieldRun: () => void;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    details?: string,
  ) => void;
}

/** Greenfield run snapshot and control refs. */
export function useBuildRunWorkspaceState(): BuildRunWorkspaceState {
  const [greenfieldRun, setGreenfieldRunState] = useState(emptyGreenfieldRun());
  const greenfieldRunControlRef = useRef<{
    cancel: () => void;
    runRepair?: () => Promise<void>;
  } | null>(null);

  const setGreenfieldRun = useCallback<React.Dispatch<React.SetStateAction<GreenfieldRunSnapshot>>>(
    (action) => {
      setGreenfieldRunState((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        return greenfieldRunSnapshotsEqual(prev, next) ? prev : next;
      });
    },
    [],
  );

  const updateGreenfieldRun = useCallback(
    (
      patch:
        | Partial<GreenfieldRunSnapshot>
        | ((prev: GreenfieldRunSnapshot) => Partial<GreenfieldRunSnapshot>),
    ) => {
      setGreenfieldRunState((prev) => {
        const next = applyGreenfieldRunUpdate(prev, patch);
        if (next === prev) return prev;
        if (next.runResult === "failed" && prev.runResult !== "failed") {
          logRunFailureFromSnapshot(next);
        }
        return next;
      });
    },
    [],
  );

  const resetGreenfieldRun = useCallback(() => {
    resetRunFailureLogDedupe();
    setGreenfieldRunState(emptyGreenfieldRun());
  }, []);

  const appendGreenfieldRunLog = useCallback(
    (
      stage: GreenfieldRunLogEntry["stage"],
      status: GreenfieldRunLogEntry["status"],
      message: string,
      details?: string,
    ) => {
      setGreenfieldRunState((prev) =>
        appendGreenfieldRunEntry(prev, stage, status, message, details),
      );
    },
    [],
  );

  return {
    greenfieldRun,
    setGreenfieldRun,
    greenfieldRunControlRef,
    updateGreenfieldRun,
    resetGreenfieldRun,
    appendGreenfieldRunLog,
  };
}
