import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import {
  MAX_AI_CALLS_DEFAULT,
  MAX_REPAIR_ATTEMPTS_DEFAULT,
  type AgentStage,
} from "@/core/providers/orchestration";
import {
  buildFallbackRequestV2,
  classifyReliabilityFromError,
  isRecoverableReliabilityStatus,
  isProviderInCooldown,
  pickAutoFallbackProvider,
  redactProviderSecrets,
  type ProviderFailure,
  type ProviderFallbackChoice,
  type ProviderFallbackOption,
  type ProviderFallbackRequestV2,
  type ProviderReliabilityStatus,
} from "@/core/providers/reliability";

export type RecoverableProviderFailure = ProviderReliabilityStatus;

export interface AiCallLogEntry {
  readonly stage: AgentStage;
  readonly provider: ProviderId;
  readonly model: string;
  readonly estimatedTokens: number;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly error?: string;
  readonly failureStatus?: ProviderReliabilityStatus;
}

export type ProviderFallbackRequest = ProviderFallbackRequestV2;

export interface AiCallBudget {
  readonly maxCalls: number;
  readonly usedCalls: number;
  readonly remainingCalls: number;
  readonly repairReserve: number;
}

export type AiCallGatePurpose = "primary" | "retry" | "repair";

export class AiCallTracker {
  private used = 0;
  private repairReserve = 0;
  private multiPhaseGreenfield = false;
  private maxCallsOverride: number | null = null;

  reset(): void {
    this.used = 0;
    this.repairReserve = 0;
    this.multiPhaseGreenfield = false;
    this.maxCallsOverride = null;
  }

  setMaxCallsOverride(maxCalls: number | null): void {
    this.maxCallsOverride =
      maxCalls != null && Number.isFinite(maxCalls) ? Math.max(1, Math.floor(maxCalls)) : null;
  }

  getMaxCallsOverride(): number | null {
    return this.maxCallsOverride;
  }

  configureReservations(opts: {
    readonly repairReserve?: number;
    readonly multiPhaseGreenfield?: boolean;
  }): void {
    if (opts.repairReserve != null) {
      this.repairReserve = Math.max(0, opts.repairReserve);
    }
    if (opts.multiPhaseGreenfield != null) {
      this.multiPhaseGreenfield = opts.multiPhaseGreenfield;
    }
  }

  isMultiPhaseGreenfield(): boolean {
    return this.multiPhaseGreenfield;
  }

  budget(settings: ProviderSettings): AiCallBudget {
    const configured = settings.maxAiCalls ?? MAX_AI_CALLS_DEFAULT;
    const maxCalls = this.maxCallsOverride ?? configured;
    return {
      maxCalls,
      usedCalls: this.used,
      remainingCalls: Math.max(0, maxCalls - this.used),
      repairReserve: this.repairReserve,
    };
  }

  canMakeCall(
    settings: ProviderSettings,
    opts?: {
      readonly purpose?: AiCallGatePurpose;
      /** When set, greenfield generation cannot consume the setup-repair reserve. */
      readonly stage?: AgentStage;
    },
  ): { ok: true } | { ok: false; reason: string } {
    const { maxCalls, usedCalls, remainingCalls, repairReserve } = this.budget(settings);
    if (usedCalls >= maxCalls) {
      return {
        ok: false,
        reason: `Max AI calls reached (${maxCalls} per run). Stop or raise the limit in Providers.`,
      };
    }
    const purpose = opts?.purpose ?? "primary";
    if (purpose === "retry" && remainingCalls <= repairReserve) {
      return {
        ok: false,
        reason: `Max AI calls reached (${maxCalls} per run). Retries blocked to reserve ${repairReserve} call(s) for repair.`,
      };
    }
    if (purpose === "retry" && this.multiPhaseGreenfield && remainingCalls <= 1) {
      return {
        ok: false,
        reason: `Max AI calls reached (${maxCalls} per run). Retries blocked to reserve 1 call for App integration.`,
      };
    }
    if (
      !this.multiPhaseGreenfield &&
      repairReserve > 0 &&
      opts?.stage === "greenfield" &&
      remainingCalls <= repairReserve &&
      (purpose === "primary" || purpose === "retry")
    ) {
      return {
        ok: false,
        reason: `Max AI calls reached (${maxCalls} per run). Generation stopped to reserve ${repairReserve} call(s) for setup repair.`,
      };
    }
    if (purpose === "repair" && remainingCalls <= 0) {
      return {
        ok: false,
        reason: `Max AI calls reached (${maxCalls} per run). Stop or raise the limit in Providers.`,
      };
    }
    return { ok: true };
  }

  /** Record one provider call only when budget allows — never exceed maxCalls. */
  tryRecordCall(
    settings: ProviderSettings,
    opts?: {
      readonly purpose?: AiCallGatePurpose;
      readonly stage?: AgentStage;
    },
  ): { ok: true } | { ok: false; reason: string } {
    const gate = this.canMakeCall(settings, opts);
    if (!gate.ok) return gate;
    this.used += 1;
    return { ok: true };
  }

  recordCall(): void {
    this.used += 1;
  }
}

export function classifyProviderError(
  error: string | undefined | null,
): ProviderReliabilityStatus | null {
  return classifyReliabilityFromError(error);
}

export { classifyReliabilityFromError } from "@/core/providers/reliability";

export function isRecoverableProviderFailure(
  error: string | undefined | null,
): boolean {
  const status = classifyProviderError(error);
  return status != null && isRecoverableReliabilityStatus(status);
}

export function failureHeadline(failure: ProviderFailure): string {
  return failure.userMessage.split(".")[0] ?? failure.errorCode;
}

export function buildFallbackRequest(opts: {
  settings: ProviderSettings;
  stage: AgentStage;
  failedProvider: ProviderId;
  failedModel: string;
  error: string;
  httpStatus?: number | null;
}): ProviderFallbackRequest | null {
  return buildFallbackRequestV2(opts);
}

export function formatAiCallLogDetails(entry: AiCallLogEntry): string {
  const parts = [
    `stage=${entry.stage}`,
    `provider=${entry.provider}`,
    `model=${entry.model}`,
    `tokens≈${entry.estimatedTokens}`,
    `${entry.durationMs}ms`,
    entry.ok ? "success" : "failure",
  ];
  if (entry.failureStatus) parts.push(`status=${entry.failureStatus}`);
  if (entry.error) parts.push(redactProviderSecrets(entry.error));
  return parts.join(" · ");
}

export function effectiveMaxRepairAttempts(settings: ProviderSettings): number {
  const n = settings.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS_DEFAULT;
  return Math.max(0, Math.min(n, MAX_AI_CALLS_DEFAULT * 10));
}

export {
  isProviderInCooldown,
  pickAutoFallbackProvider,
  type ProviderFailure,
  type ProviderFallbackChoice,
  type ProviderFallbackOption,
  type ProviderReliabilityStatus,
};
