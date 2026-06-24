import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import type { ProviderId } from "@/core/providers/types";
import { suggestStrongerModelStep, type StrongerModelStep } from "./modelEscalation";
import type { ProviderSettings } from "@/core/providers/types";

export interface FollowUpEscalationState {
  readonly active: boolean;
  readonly fromProvider: string;
  readonly fromModel: string;
  readonly toProvider: string;
  readonly toModel: string;
  readonly reason: string;
  readonly note: string;
  readonly at: number;
}

export function buildEscalationNote(
  fromProvider: ProviderId,
  fromModel: string,
  step: StrongerModelStep,
  reason: string,
): FollowUpEscalationState {
  const fromLabel = PROVIDER_DISPLAY_LABELS[fromProvider];
  const toLabel = PROVIDER_DISPLAY_LABELS[step.provider];
  return {
    active: true,
    fromProvider: fromLabel,
    fromModel,
    toProvider: toLabel,
    toModel: step.model,
    reason,
    note: `${fromLabel} ${reason}. Retrying with ${toLabel} (${step.model})…`,
    at: Date.now(),
  };
}

export function nextAutoEscalationStep(
  provider: ProviderId,
  model: string,
  settings: ProviderSettings,
): StrongerModelStep | null {
  return suggestStrongerModelStep(provider, model, settings);
}

export function escalationReasonFromError(error: string): string {
  if (/timed out|timeout/i.test(error)) return "timed out";
  if (/rate limit|429|high demand|resource exhausted/i.test(error)) return "is under high demand";
  if (/zero valid patch/i.test(error)) return "returned no usable changes";
  return "encountered an error";
}
