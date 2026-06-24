import { isPipelineMode, resolveStageRouting } from "@/core/providers/orchestration";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { StudioActionType } from "@/core/studioRun/types";
import {
  createLatestAction,
  type GreenfieldRunLogEntry,
} from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { resolveFailureRunResult } from "@/core/agent/runOutcome";

/** Studio actions that use the configured AI provider before running. */
export const PROVIDER_HEALTH_ACTIONS: ReadonlySet<StudioActionType> = new Set([
  "ai_plan",
  "apply_plan",
  "ai_patch_propose",
  "ai_patch_apply",
  "multi_file_execution",
  "autonomous_builder",
  "studio_agent",
  "multi_agent_pipeline",
]);

export function providersForHealthCheck(settings: ProviderSettings): ProviderId[] {
  if (!isPipelineMode(settings)) return [settings.provider];
  const ids = new Set<ProviderId>();
  for (const stage of ["planner", "coder", "repair"] as const) {
    const routing = resolveStageRouting(settings, stage);
    if (routing) ids.add(routing.provider);
  }
  return [...ids];
}

/** Studio actions whose success should not terminalize an in-flight follow-up run. */
const INTERIM_SUCCESS_ACTIONS: ReadonlySet<StudioActionType> = new Set([
  "ai_plan",
]);

function isTerminalStudioSuccess(
  actionType: StudioActionType,
  ok: boolean,
  message: string,
): boolean {
  if (!ok) return false;
  if (INTERIM_SUCCESS_ACTIONS.has(actionType)) return false;
  if (actionType === "apply_plan" && /ready for review/i.test(message)) return false;
  return true;
}

export function applyFinishStudioRunPatch(
  prev: GreenfieldRunSnapshot,
  actionType: StudioActionType,
  ok: boolean,
  message: string,
  stage: GreenfieldRunLogEntry["stage"],
  opts?: {
    details?: string;
    patch?: Partial<GreenfieldRunSnapshot>;
  },
): GreenfieldRunSnapshot {
  const status = ok ? "success" : "failed";
  const patch = opts?.patch ?? {};
  const endedAt = Date.now();
  const durationMs = prev.runStartedAt ? Math.max(0, endedAt - prev.runStartedAt) : 0;
  const terminalSuccess = isTerminalStudioSuccess(actionType, ok, message);
  const mergedWorkflow =
    patch.workflow !== undefined
      ? { ...(prev.workflow ?? {}), ...patch.workflow }
      : prev.workflow;
  const workflow =
    ok && mergedWorkflow
      ? {
          ...mergedWorkflow,
          errors: patch.workflow?.errors ?? [],
        }
      : mergedWorkflow;

  return {
    ...prev,
    ...patch,
    actionType,
    runResult: ok
      ? terminalSuccess
        ? "success"
        : prev.runResult === "idle"
          ? "running"
          : prev.runResult
      : resolveFailureRunResult(message, opts?.details),
    endedAt: terminalSuccess ? endedAt : prev.endedAt,
    durationMs: terminalSuccess ? durationMs : prev.durationMs,
    ...(terminalSuccess && ok ? { lastSuccessfulRunAt: Date.now(), failureReport: null } : {}),
    latestAction: createLatestAction(status, message, {
      stage,
      ...(opts?.details ? { detail: opts.details } : {}),
    }),
    ...(workflow !== undefined ? { workflow } : {}),
  };
}
