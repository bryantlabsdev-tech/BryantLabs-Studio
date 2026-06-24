import { useCallback, useRef, useState } from "react";
import { logRunFailureFromSnapshot, resetRunFailureLogDedupe } from "@/core/agent/runFailureDiagnostics";
import { emptyGreenfieldRun, appendGreenfieldRunEntry, type GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

export interface BuildRunWorkspaceState {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly setGreenfieldRun: React.Dispatch<React.SetStateAction<GreenfieldRunSnapshot>>;
  readonly greenfieldRunControlRef: React.MutableRefObject<{
    cancel: () => void;
    runRepair?: () => Promise<void>;
  } | null>;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
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
  const [greenfieldRun, setGreenfieldRun] = useState(emptyGreenfieldRun());
  const greenfieldRunControlRef = useRef<{
    cancel: () => void;
    runRepair?: () => Promise<void>;
  } | null>(null);

  const updateGreenfieldRun = useCallback((patch: Partial<GreenfieldRunSnapshot>) => {
    setGreenfieldRun((prev) => {
      const next = { ...prev, ...patch };
      if (next.runResult === "failed" && prev.runResult !== "failed") {
        logRunFailureFromSnapshot(next);
      }
      return next;
    });
  }, []);

  const resetGreenfieldRun = useCallback(() => {
    resetRunFailureLogDedupe();
    setGreenfieldRun(emptyGreenfieldRun());
  }, []);

  const appendGreenfieldRunLog = useCallback(
    (
      stage: GreenfieldRunLogEntry["stage"],
      status: GreenfieldRunLogEntry["status"],
      message: string,
      details?: string,
    ) => {
      setGreenfieldRun((prev) =>
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
