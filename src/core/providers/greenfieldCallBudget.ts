import type { AiCallLogEntry, AiCallTracker } from "@/core/providers/costControls";
import type { AgentStage } from "@/core/providers/orchestration";
import { MAX_AI_CALLS_DEFAULT } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";
import { requiredMultiPhaseMaxAiCalls } from "@/core/greenfield/multiPhasePlan";

export type AiCallGatePurpose = "primary" | "retry" | "repair";

export interface GreenfieldCallReservation {
  readonly repairReserve: number;
}

export function greenfieldRepairReserve(maxCalls: number): number {
  if (maxCalls <= 1) return 0;
  if (maxCalls >= 4) return 2;
  return 1;
}

export function configureGreenfieldCallReservations(
  tracker: AiCallTracker,
  settings: ProviderSettings,
): GreenfieldCallReservation {
  const maxCalls = settings.maxAiCalls ?? MAX_AI_CALLS_DEFAULT;
  const repairReserve = greenfieldRepairReserve(maxCalls);
  tracker.configureReservations({ repairReserve, multiPhaseGreenfield: false });
  return { repairReserve };
}

/** Multi-phase greenfield uses shared + page batches + app; bumps budget when pageCount is set. */
export function configureMultiPhaseGreenfieldCallReservations(
  tracker: AiCallTracker,
  settings: ProviderSettings,
  pageCount?: number,
): GreenfieldCallReservation {
  const configured = settings.maxAiCalls ?? MAX_AI_CALLS_DEFAULT;
  const repairReserve = Math.max(2, greenfieldRepairReserve(configured));
  if (pageCount != null && pageCount > 0) {
    const required = requiredMultiPhaseMaxAiCalls(pageCount) + 2;
    const existing = tracker.getMaxCallsOverride();
    tracker.setMaxCallsOverride(Math.max(existing ?? configured, configured, required));
  }
  tracker.configureReservations({ repairReserve, multiPhaseGreenfield: true });
  return { repairReserve };
}

export function stageLabelForAiCall(stage: AgentStage | string): string {
  switch (stage) {
    case "planner":
      return "Planner";
    case "greenfield":
      return "Generation";
    case "repair":
      return "Repair";
    case "coder":
      return "Coder";
    case "verifier":
      return "Validation";
    default:
      return stage.replace(/_/g, " ");
  }
}

export interface AiCallUsageEntry {
  readonly index: number;
  readonly maxCalls: number;
  readonly stage: string;
  readonly label: string;
  readonly ok: boolean;
  readonly provider: string;
  readonly model: string;
  readonly summary: string;
}

export function buildAiCallUsageBreakdown(
  calls: readonly AiCallLogEntry[],
  maxCalls: number,
): readonly AiCallUsageEntry[] {
  return calls.map((call, idx) => {
    const index = idx + 1;
    const label = stageLabelForAiCall(call.stage);
    return {
      index,
      maxCalls,
      stage: call.stage,
      label,
      ok: call.ok,
      provider: call.provider,
      model: call.model,
      summary: `${index}/${maxCalls} ${label}`,
    };
  });
}

export function formatAiCallUsageLines(
  entries: readonly AiCallUsageEntry[],
): readonly string[] {
  return entries.map((entry) => {
    const status = entry.ok ? "ok" : "failed";
    return `${entry.summary} · ${entry.provider} · ${status}`;
  });
}

export function repairSkippedDueToBudgetReason(maxCalls: number): string {
  return `Repair pass skipped — AI call budget exhausted (${maxCalls} per run). Using fallback skeleton instead.`;
}

export function retryBlockedDueToBudgetReason(
  maxCalls: number,
  repairReserve: number,
): string {
  return `Provider retry blocked to reserve ${repairReserve} call(s) for greenfield repair (${maxCalls} per run).`;
}
