import { useLayoutEffect, useRef } from "react";
import { getLastRoutingIntent, isStudioTestMode } from "@/app/workspace";
import type { StudioReadinessState } from "@/app/workspace/studioTestReadiness";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { HealthResult, ProviderId, ProviderResponse } from "@/types";
import type { ProviderTransportEvent } from "@/core/diagnostics/providerTransport";

export interface StudioTestHookCallbacks {
  readonly getGreenfieldRunSnapshot: () => GreenfieldRunSnapshot;
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
  readonly simulateLiveActivityStream: (opts?: {
    complete?: boolean;
  }) => { ok: true; runId: string } | { ok: false; reason: string };
  readonly getProviderSmokeState: () => {
    provider: ProviderId | null;
    model: string | null;
    mockMode: boolean;
  };
  readonly checkConfiguredProviderHealth: () => Promise<HealthResult>;
  readonly runProviderSmokeTest: (prompt: string) => Promise<ProviderResponse>;
  readonly getTransportDiagnostics: () => {
    events: readonly ProviderTransportEvent[];
    summary: {
      total: number;
      problems: number;
      firstAttemptProblems: number;
      lastProblem: ProviderTransportEvent | null;
    };
  };
  readonly clearTransportDiagnostics: () => void;
}

export function useStudioTestHooks(callbacks: StudioTestHookCallbacks): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useLayoutEffect(() => {
    if (!isStudioTestMode()) return;

    const hooks = {
      getReadinessState: () => callbacksRef.current.getReadinessState(),
      getGreenfieldRunSnapshot: () => callbacksRef.current.getGreenfieldRunSnapshot(),
      openProjectAt: (folderPath: string) =>
        callbacksRef.current.openProjectAt(folderPath),
      getPatchPipelineState: () => callbacksRef.current.getPatchPipelineState(),
      getRoutingState: () => getLastRoutingIntent(),
      simulatePatchReadyForReview: () =>
        callbacksRef.current.simulatePatchReadyForReview(),
      simulatePreviewReady: (opts?: { url?: string; port?: number; root?: string }) =>
        callbacksRef.current.simulatePreviewReady(opts),
      simulateLiveActivityStream: (opts?: { complete?: boolean }) =>
        callbacksRef.current.simulateLiveActivityStream(opts),
      getProviderSmokeState: () => callbacksRef.current.getProviderSmokeState(),
      checkConfiguredProviderHealth: () =>
        callbacksRef.current.checkConfiguredProviderHealth(),
      runProviderSmokeTest: (prompt: string) =>
        callbacksRef.current.runProviderSmokeTest(prompt),
      getTransportDiagnostics: () =>
        callbacksRef.current.getTransportDiagnostics(),
      clearTransportDiagnostics: () =>
        callbacksRef.current.clearTransportDiagnostics(),
    };

    (window as Window & { __studioTestHooks?: typeof hooks }).__studioTestHooks = hooks;
    return () => {
      delete (window as Window & { __studioTestHooks?: typeof hooks }).__studioTestHooks;
    };
  }, []);
}
