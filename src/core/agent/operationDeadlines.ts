import { closeStaleGreenfieldRunningEntries } from "@/core/agent/greenfieldAgentCleanup";
import { isGreenfieldRunActive } from "@/core/agent/agentRunMutex";
import { EDIT_PHASE_TIMING_MS } from "@/core/editPhases/types";
import { createLatestAction, type RunLogStage } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

/**
 * Hard ceilings so Studio never sits on a spinner with no progress.
 * Per-call generation matches HTTP budgets (≤3 min). Multi-phase apply/plan
 * walls stay under 15 minutes so long hangs are not hidden.
 */
export const OPERATION_DEADLINE_MS = {
  appLaunch: 30_000,
  projectScan: 60_000,
  providerFirstByte: EDIT_PHASE_TIMING_MS.firstByte,
  /** Single provider generation / provider_call (HTTP ≤180s + small watchdog slack). */
  aiGeneration: EDIT_PHASE_TIMING_MS.generation + 15_000,
  /**
   * Multi-phase apply_plan / greenfield orchestration wall across several
   * bounded calls — must stay under 15 minutes.
   */
  multiPhaseOrchestration: 12 * 60_000,
  patchApply: EDIT_PHASE_TIMING_MS.parseAndApply,
  npmInstall: 180_000,
  typecheckBuild: EDIT_PHASE_TIMING_MS.verification,
  previewStart: 60_000,
} as const;

export interface ExpiredOperationDeadline {
  readonly stage: string;
  readonly deadlineMs: number;
  readonly elapsedMs: number;
  readonly reason: string;
}

function entryTimeMs(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function lastRunningEntry(run: GreenfieldRunSnapshot) {
  for (let i = run.entries.length - 1; i >= 0; i--) {
    const entry = run.entries[i];
    if (entry?.status === "running") return entry;
  }
  return null;
}

/** Patches were written or verification is in flight — do not fail the whole run. */
export function runHasSuccessfulWritesOrActiveVerification(
  run: GreenfieldRunSnapshot,
): boolean {
  const verifying = run.entries.some(
    (e) =>
      (e.stage === "verification" ||
        e.stage === "typescript" ||
        e.stage === "build" ||
        e.stage === "preview" ||
        e.stage === "write") &&
      e.status === "running",
  );
  if (verifying) return true;

  const latestCall = [...run.entries]
    .reverse()
    .find(
      (e) =>
        e.stage === "provider_call" ||
        (e.stage === "apply_plan" && e.status === "running"),
    );
  const anchor =
    entryTimeMs(latestCall?.timestamp) ?? run.runStartedAt ?? 0;
  return run.entries.some(
    (e) =>
      (e.stage === "write" || e.stage === "apply_plan") &&
      e.status === "success" &&
      /wrote|updated|applied/i.test(e.message) &&
      (entryTimeMs(e.timestamp) ?? 0) >= anchor - 1_000,
  );
}

function deadlineForStage(stage: string): number | null {
  switch (stage) {
    case "generation":
    case "provider":
    case "prompt":
    case "ai_plan":
    case "studio_agent":
    case "ai_patch_propose":
    case "provider_call":
      return OPERATION_DEADLINE_MS.aiGeneration;
    case "apply_plan":
      // Multi-phase propose loop may span several bounded provider calls.
      return OPERATION_DEADLINE_MS.multiPhaseOrchestration;
    case "provider_response":
      return OPERATION_DEADLINE_MS.providerFirstByte;
    case "write":
    case "ai_patch_apply":
    case "safe_edit":
      return OPERATION_DEADLINE_MS.patchApply;
    case "npm_install":
      return OPERATION_DEADLINE_MS.npmInstall;
    case "typescript":
    case "build":
    case "verification":
      return OPERATION_DEADLINE_MS.typecheckBuild;
    case "preview":
    case "runtime_smoke":
      return OPERATION_DEADLINE_MS.previewStart;
    case "provider_health":
      return OPERATION_DEADLINE_MS.providerFirstByte;
    default:
      return OPERATION_DEADLINE_MS.aiGeneration;
  }
}

function isRunBusy(run: GreenfieldRunSnapshot): boolean {
  if (run.runResult === "running") return true;
  if (run.genStatus === "running") return true;
  if (run.writeStatus === "writing") return true;
  if (run.setupStatus === "running" || run.setupStatus === "repairing") return true;
  if (isGreenfieldRunActive(run, false)) return true;
  return run.entries.some((entry) => entry.status === "running");
}

/**
 * Returns a specific expired deadline for the current running stage, or null.
 * Stale first-byte watchdogs must not fail a later attempt or an Apply Plan
 * that already wrote patches / is verifying.
 */
export function resolveExpiredOperationDeadline(
  run: GreenfieldRunSnapshot,
  now = Date.now(),
): ExpiredOperationDeadline | null {
  if (!isRunBusy(run)) return null;
  if (runHasSuccessfulWritesOrActiveVerification(run)) return null;

  const running = lastRunningEntry(run);
  const latestProviderCall = [...run.entries]
    .reverse()
    .find((e) => e.stage === "provider_call");
  const providerCallStartMs =
    latestProviderCall?.status === "running"
      ? entryTimeMs(latestProviderCall.timestamp)
      : null;
  const generationStarted = run.entries.find(
    (e) => e.stage === "generation" && e.status === "running",
  );
  const generationStartMs =
    entryTimeMs(generationStarted?.timestamp) ?? providerCallStartMs;
  const gotProviderResponse = run.entries.some(
    (e) =>
      (e.stage === "provider_response" ||
        e.stage === "parser" ||
        e.stage === "write" ||
        e.stage === "apply_plan") &&
      e.status === "success",
  );

  if (
    run.actionType === "greenfield" &&
    run.genStatus === "running" &&
    generationStartMs != null &&
    !gotProviderResponse &&
    running?.stage === "generation" &&
    !run.entries.some((e) => e.stage === "provider_call")
  ) {
    const elapsed = now - generationStartMs;
    if (elapsed >= OPERATION_DEADLINE_MS.providerFirstByte) {
      return {
        stage: "provider_first_byte",
        deadlineMs: OPERATION_DEADLINE_MS.providerFirstByte,
        elapsedMs: elapsed,
        reason: `Provider did not begin responding within ${OPERATION_DEADLINE_MS.providerFirstByte / 1000}s.`,
      };
    }
  }

  if (!running) return null;
  const started = entryTimeMs(running.timestamp);
  if (started == null) return null;
  const deadlineMs = deadlineForStage(running.stage);
  if (deadlineMs == null) return null;
  const elapsedMs = now - started;
  if (elapsedMs < deadlineMs) return null;

  return {
    stage: running.stage,
    deadlineMs,
    elapsedMs,
    reason: `${running.stage} exceeded ${Math.round(deadlineMs / 1000)}s with no completion.`,
  };
}

/** Deadline notifications must never RST in-flight provider HTTP — user cancel only. */
export function shouldAbortProviderOnDeadline(): boolean {
  return false;
}

export function failRunOnDeadlinePatch(
  run: GreenfieldRunSnapshot,
  expired: ExpiredOperationDeadline,
): Partial<GreenfieldRunSnapshot> | null {
  // Never mark the overall run failed if valid patches were written / verify runs.
  if (runHasSuccessfulWritesOrActiveVerification(run)) {
    return null;
  }
  const message = expired.reason;
  return {
    genStatus: run.genStatus === "running" ? "error" : run.genStatus,
    writeStatus: run.writeStatus === "writing" ? "error" : run.writeStatus,
    setupStatus:
      run.setupStatus === "running" || run.setupStatus === "repairing"
        ? "error"
        : run.setupStatus,
    runResult: "failed",
    endedAt: Date.now(),
    durationMs: run.runStartedAt ? Math.max(0, Date.now() - run.runStartedAt) : expired.elapsedMs,
    entries: closeStaleGreenfieldRunningEntries(run.entries, "failed"),
    latestAction: createLatestAction("failed", message, {
      stage:
        expired.stage === "provider_first_byte" || expired.stage === "provider_call"
          ? "provider"
          : (expired.stage as RunLogStage),
    }),
    finalMessage: message,
  };
}
