import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

/** Close orphaned "running" log rows left open when a later success row was appended. */
export function closeStaleGreenfieldRunningEntries(
  entries: readonly GreenfieldRunLogEntry[],
  closeAs: "success" | "failed" = "success",
): GreenfieldRunLogEntry[] {
  return entries.map((entry) =>
    entry.status === "running" ? { ...entry, status: closeAs } : entry,
  );
}

/**
 * Normalize greenfield run snapshot after embedded Agent create/repair success.
 * Clears busy flags so follow-up runs are not blocked by stale greenfield state.
 */
export function finalizeGreenfieldAgentRun(
  run: GreenfieldRunSnapshot,
): Partial<GreenfieldRunSnapshot> {
  const terminalSuccess = run.runResult === "success";

  return {
    actionType:
      run.actionType === "greenfield" ? "greenfield" : "studio_agent",
    genStatus: run.genStatus === "running" ? "done" : run.genStatus,
    writeStatus: run.writeStatus === "writing" ? "done" : run.writeStatus,
    setupStatus:
      run.setupStatus === "running" || run.setupStatus === "repairing"
        ? "done"
        : run.setupStatus,
    runResult: run.runResult === "running" ? "success" : run.runResult,
    failureReport: null,
    greenfieldRepair:
      run.greenfieldRepair?.attempts?.length
        ? run.greenfieldRepair
        : null,
    entries: closeStaleGreenfieldRunningEntries(
      run.entries,
      terminalSuccess || run.runResult === "success" ? "success" : "failed",
    ),
  };
}

/** Snapshot helper for tests — successful run with stale running log rows. */
export function greenfieldSuccessWithStaleRunningEntries(): GreenfieldRunSnapshot {
  return {
    ...emptyGreenfieldRun(),
    genStatus: "done",
    writeStatus: "done",
    setupStatus: "done",
    runResult: "success",
    lastSuccessfulRunAt: Date.now(),
    finalMessage: "Success",
    entries: [
      {
        id: "gen-running",
        stage: "generation" as const,
        status: "running" as const,
        message: "Generation started",
        timestamp: new Date().toISOString(),
      },
      {
        id: "preview-running",
        stage: "preview" as const,
        status: "running" as const,
        message: "Preview started",
        timestamp: new Date().toISOString(),
      },
      {
        id: "preview-success",
        stage: "preview" as const,
        status: "success" as const,
        message: "Preview started",
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
