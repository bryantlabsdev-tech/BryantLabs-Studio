import { useCallback, useRef, useState } from "react";
import type { HealthResult, ProviderId } from "@/core/providers/types";
import type { ProviderStatusSnapshot } from "@/core/providers/providerStatus";
import {
  AiCallTracker,
  type ProviderFallbackChoice,
  type ProviderFallbackRequest,
} from "@/core/providers/costControls";
import { emptyRunAnalyticsAccumulator } from "@/core/analytics/recordRun";
import type { CurrentRunAnalyticsAccumulator, StudioAnalyticsRecord } from "@/core/analytics";

export interface ProviderWorkspaceState {
  readonly providerStatus: ProviderStatusSnapshot | null;
  readonly setProviderStatus: React.Dispatch<
    React.SetStateAction<ProviderStatusSnapshot | null>
  >;
  readonly providerHealthInFlightRef: React.MutableRefObject<boolean>;
  readonly providerHealthCacheRef: React.MutableRefObject<
    Partial<Record<ProviderId, HealthResult>>
  >;
  readonly aiCallTrackerRef: React.MutableRefObject<AiCallTracker>;
  readonly fallbackResolverRef: React.MutableRefObject<
    ((choice: ProviderFallbackChoice) => void) | null
  >;
  readonly pendingFallbackRequest: ProviderFallbackRequest | null;
  readonly setPendingFallbackRequest: React.Dispatch<
    React.SetStateAction<ProviderFallbackRequest | null>
  >;
  readonly analyticsHistory: readonly StudioAnalyticsRecord[];
  readonly setAnalyticsHistory: React.Dispatch<
    React.SetStateAction<readonly StudioAnalyticsRecord[]>
  >;
  readonly selectedAnalyticsId: string | null;
  readonly setSelectedAnalyticsId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly currentRunAnalyticsRef: React.MutableRefObject<CurrentRunAnalyticsAccumulator>;
  readonly lastRecordedAnalyticsKeyRef: React.MutableRefObject<string | null>;
  readonly resetAiCallTracker: () => void;
}

/** Provider health, fallback, and analytics tracking state. */
export function useProviderWorkspaceState(): ProviderWorkspaceState {
  const [providerStatus, setProviderStatus] = useState<ProviderStatusSnapshot | null>(null);
  const providerHealthInFlightRef = useRef(false);
  const providerHealthCacheRef = useRef<Partial<Record<ProviderId, HealthResult>>>({});
  const aiCallTrackerRef = useRef(new AiCallTracker());
  const fallbackResolverRef = useRef<
    ((choice: ProviderFallbackChoice) => void) | null
  >(null);
  const [pendingFallbackRequest, setPendingFallbackRequest] =
    useState<ProviderFallbackRequest | null>(null);
  const [analyticsHistory, setAnalyticsHistory] = useState<
    readonly StudioAnalyticsRecord[]
  >([]);
  const [selectedAnalyticsId, setSelectedAnalyticsId] = useState<string | null>(null);
  const currentRunAnalyticsRef = useRef<CurrentRunAnalyticsAccumulator>(
    emptyRunAnalyticsAccumulator(),
  );
  const lastRecordedAnalyticsKeyRef = useRef<string | null>(null);

  const resetAiCallTracker = useCallback(() => {
    aiCallTrackerRef.current.reset();
  }, []);

  return {
    providerStatus,
    setProviderStatus,
    providerHealthInFlightRef,
    providerHealthCacheRef,
    aiCallTrackerRef,
    fallbackResolverRef,
    pendingFallbackRequest,
    setPendingFallbackRequest,
    analyticsHistory,
    setAnalyticsHistory,
    selectedAnalyticsId,
    setSelectedAnalyticsId,
    currentRunAnalyticsRef,
    lastRecordedAnalyticsKeyRef,
    resetAiCallTracker,
  };
}
