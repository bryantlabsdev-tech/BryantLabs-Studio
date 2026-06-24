import { useLayoutEffect, useRef } from "react";
import { getLastRoutingIntent, isStudioTestMode } from "@/app/workspace";
import type { StudioReadinessState } from "@/app/workspace/studioTestReadiness";
import type { HealthResult, ProviderId, ProviderResponse } from "@/types";

export interface StudioTestHookCallbacks {
  readonly getReadinessState: () => StudioReadinessState;
  readonly openProjectAt: (folderPath: string) => Promise<void>;
  readonly getPatchPipelineState: () => {
    planApplyPhase: string | null;
    buildRunning: boolean;
    buildPhase: string;
    planApplyError: string | null;
    buildError: string | null;
    aiPlanStatus: string;
    centerTab: string;
    activeAgentRunId: string | null;
  };
  readonly simulatePatchReadyForReview: () =>
    | { ok: true }
    | { ok: false; reason: string }
    | void;
  readonly simulatePreviewReady: (opts?: {
    url?: string;
    port?: number;
    root?: string;
  }) => { ok: true; url: string; centerTab: string } | { ok: false; reason: string };
  readonly getProviderSmokeState: () => {
    provider: ProviderId | null;
    model: string | null;
    mockMode: boolean;
  };
  readonly checkConfiguredProviderHealth: () => Promise<HealthResult>;
  readonly runProviderSmokeTest: (prompt: string) => Promise<ProviderResponse>;
}

export function useStudioTestHooks(callbacks: StudioTestHookCallbacks): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useLayoutEffect(() => {
    if (!isStudioTestMode()) return;

    const hooks = {
      getReadinessState: () => callbacksRef.current.getReadinessState(),
      openProjectAt: (folderPath: string) =>
        callbacksRef.current.openProjectAt(folderPath),
      getPatchPipelineState: () => callbacksRef.current.getPatchPipelineState(),
      getRoutingState: () => getLastRoutingIntent(),
      simulatePatchReadyForReview: () =>
        callbacksRef.current.simulatePatchReadyForReview(),
      simulatePreviewReady: (opts?: { url?: string; port?: number; root?: string }) =>
        callbacksRef.current.simulatePreviewReady(opts),
      getProviderSmokeState: () => callbacksRef.current.getProviderSmokeState(),
      checkConfiguredProviderHealth: () =>
        callbacksRef.current.checkConfiguredProviderHealth(),
      runProviderSmokeTest: (prompt: string) =>
        callbacksRef.current.runProviderSmokeTest(prompt),
    };

    (window as Window & { __studioTestHooks?: typeof hooks }).__studioTestHooks = hooks;
    return () => {
      delete (window as Window & { __studioTestHooks?: typeof hooks }).__studioTestHooks;
    };
  }, []);
}
