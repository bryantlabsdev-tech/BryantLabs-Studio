import {
  closeStaleGreenfieldRunningEntries,
} from "@/core/agent/greenfieldAgentCleanup";
import { isGreenfieldRunActive } from "@/core/agent/agentRunMutex";
import { GREENFIELD_STUCK_THRESHOLDS } from "@/core/agent/greenfieldRunProgress";
import { createLatestAction } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

export { GREENFIELD_STUCK_THRESHOLDS };

function lastProgressTimestamp(run: GreenfieldRunSnapshot): number | null {
  for (let i = run.entries.length - 1; i >= 0; i--) {
    const ts = Date.parse(run.entries[i]?.timestamp ?? "");
    if (!Number.isNaN(ts)) return ts;
  }
  return run.runStartedAt;
}

/** True when snapshot claims active but progress is implausibly old. */
export function isStaleGreenfieldRun(
  run: GreenfieldRunSnapshot,
  now = Date.now(),
): boolean {
  if (!isGreenfieldRunActive(run, false) && run.runResult !== "running") {
    return false;
  }

  const anchor = lastProgressTimestamp(run);
  if (!anchor) {
    return run.runResult === "running" || run.genStatus === "running";
  }

  const idleMs = now - anchor;
  const totalMs = run.runStartedAt ? now - run.runStartedAt : idleMs;

  return (
    idleMs >= GREENFIELD_STUCK_THRESHOLDS.STALE_MS ||
    totalMs >= GREENFIELD_STUCK_THRESHOLDS.STALE_MS
  );
}

/** Patch that clears a stuck/orphaned greenfield mutex. */
export function clearStaleGreenfieldRunPatch(
  run: GreenfieldRunSnapshot,
): Partial<GreenfieldRunSnapshot> {
  return {
    genStatus: run.genStatus === "running" ? "error" : run.genStatus,
    writeStatus: run.writeStatus === "writing" ? "error" : run.writeStatus,
    setupStatus:
      run.setupStatus === "running" || run.setupStatus === "repairing"
        ? "error"
        : run.setupStatus,
    runResult: "interrupted",
    failureReport: null,
    greenfieldRepair: null,
    entries: closeStaleGreenfieldRunningEntries(run.entries, "failed"),
    latestAction: createLatestAction("failed", "Stale greenfield run cleared — you can try again.", {
      stage: "generation",
    }),
    finalMessage: "Stale greenfield run cleared — you can try again.",
  };
}

/** Patch applied when the user cancels an in-flight greenfield run. */
export function cancelGreenfieldRunPatch(
  run: GreenfieldRunSnapshot,
): Partial<GreenfieldRunSnapshot> {
  return {
    actionType: "studio_agent",
    genStatus: run.genStatus === "running" ? "error" : run.genStatus,
    writeStatus: run.writeStatus === "writing" ? "error" : run.writeStatus,
    setupStatus:
      run.setupStatus === "running" || run.setupStatus === "repairing"
        ? "error"
        : run.setupStatus,
    runResult: "cancelled",
    endedAt: Date.now(),
    durationMs: run.runStartedAt ? Math.max(0, Date.now() - run.runStartedAt) : 0,
    failureReport: null,
    entries: closeStaleGreenfieldRunningEntries(run.entries, "failed"),
    latestAction: createLatestAction("failed", "Run cancelled by user", {
      stage: "generation",
    }),
    finalMessage: "Run cancelled. You can try again.",
  };
}

export function reconcileStaleGreenfieldRun(
  run: GreenfieldRunSnapshot,
  now = Date.now(),
): Partial<GreenfieldRunSnapshot> | null {
  if (!isStaleGreenfieldRun(run, now)) return null;
  return clearStaleGreenfieldRunPatch(run);
}
