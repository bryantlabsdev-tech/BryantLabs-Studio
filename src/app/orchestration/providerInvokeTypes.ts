import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CurrentRunAnalyticsAccumulator } from "@/core/analytics/recordRun";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type {
  AiCallTracker,
  ProviderFallbackRequest,
} from "@/core/providers/costControls";
import type { ProviderFallbackChoice } from "@/core/providers/reliability";
import type { ProviderStatusSnapshot } from "@/core/providers/providerStatus";
import type { HealthResult, ProviderId } from "@/core/providers/types";
import type { BryantLabsApi } from "@/types";

/** Workspace bridge for staged provider calls, health checks, and AI call budget. */
export interface ProviderInvokeOrchestrationHost {
  readonly api: BryantLabsApi | undefined;
  readonly aiCallTrackerRef: MutableRefObject<AiCallTracker>;
  readonly fallbackResolverRef: MutableRefObject<
    ((choice: ProviderFallbackChoice) => void) | null
  >;
  readonly providerHealthInFlightRef: MutableRefObject<boolean>;
  readonly providerHealthCacheRef: MutableRefObject<
    Partial<Record<ProviderId, HealthResult>>
  >;
  readonly currentRunAnalyticsRef: MutableRefObject<CurrentRunAnalyticsAccumulator>;
  readonly lastRecordedAnalyticsKeyRef: MutableRefObject<string | null>;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly setProviderStatus: Dispatch<
    SetStateAction<ProviderStatusSnapshot | null>
  >;
  readonly setProviderFallbackRequest: Dispatch<
    SetStateAction<ProviderFallbackRequest | null>
  >;
  readonly providerInvokeStopRef?: MutableRefObject<string | null>;
  readonly providerRequestSentRef?: MutableRefObject<boolean>;
}
