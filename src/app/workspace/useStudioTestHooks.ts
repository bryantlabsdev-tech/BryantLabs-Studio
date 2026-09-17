import { useLayoutEffect, useRef } from "react";
import { getLastRoutingIntent, isStudioTestMode } from "@/app/workspace";
import type { StudioReadinessState } from "@/app/workspace/studioTestReadiness";
import type { FollowUpSettlementDiagnostic } from "@/core/agent/followUpSettlementDiagnostics";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { HealthResult, ProviderId, ProviderResponse } from "@/types";

export interface StudioTestHookCallbacks {
  readonly getGreenfieldRunSnapshot: () => GreenfieldRunSnapshot;
  readonly getFollowUpSettlementDiagnostic: () => FollowUpSettlementDiagnostic;
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
    prompt: string | null;
    files: readonly {
      relPath: string;
      status: string;
      error: string | null;
      changed: boolean;
    }[];
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
  readonly simulateMixedCreateEditReadyForReview: () => Promise<
    { ok: true } | { ok: false; reason: string }
  >;
  readonly applyApprovedReadyFiles: () => Promise<{ ok: boolean; applied?: readonly string[] }>;
  readonly undoLastEdit: () => Promise<void>;
  readonly getCanUndo: () => boolean;
  readonly getProviderSmokeState: () => {
    provider: ProviderId | null;
    model: string | null;
    mockMode: boolean;
  };
  readonly checkConfiguredProviderHealth: () => Promise<HealthResult>;
  readonly runProviderSmokeTest: (prompt: string) => Promise<ProviderResponse>;
  readonly getFollowUpReviewFirst: () => boolean;
  readonly resolveFollowUpAutoContinue: (prompt: string) => boolean;
  readonly clearFollowUpReviewFirstPreference: () => void;
  readonly forceNextVerificationFailure: (message: string) => void;
  readonly forceNextUndoPathFailure: (relPath: string) => void;
  readonly getLastConsultationPrompt: () => string;
  readonly getInstructionPackDiagnostic: () => import("@/core/projectRules/instructionPack").InstructionPackDiagnostic | null;
}

export function useStudioTestHooks(callbacks: StudioTestHookCallbacks): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useLayoutEffect(() => {
    if (!isStudioTestMode()) return;

    const hooks = {
      getReadinessState: () => callbacksRef.current.getReadinessState(),
      getGreenfieldRunSnapshot: () => callbacksRef.current.getGreenfieldRunSnapshot(),
      getFollowUpSettlementDiagnostic: () =>
        callbacksRef.current.getFollowUpSettlementDiagnostic(),
      openProjectAt: (folderPath: string) =>
        callbacksRef.current.openProjectAt(folderPath),
      getPatchPipelineState: () => callbacksRef.current.getPatchPipelineState(),
      getRoutingState: () => getLastRoutingIntent(),
      simulatePatchReadyForReview: () =>
        callbacksRef.current.simulatePatchReadyForReview(),
      simulatePreviewReady: (opts?: { url?: string; port?: number; root?: string }) =>
        callbacksRef.current.simulatePreviewReady(opts),
      simulateMixedCreateEditReadyForReview: () =>
        callbacksRef.current.simulateMixedCreateEditReadyForReview(),
      applyApprovedReadyFiles: () => callbacksRef.current.applyApprovedReadyFiles(),
      undoLastEdit: () => callbacksRef.current.undoLastEdit(),
      getCanUndo: () => callbacksRef.current.getCanUndo(),
      getProviderSmokeState: () => callbacksRef.current.getProviderSmokeState(),
      checkConfiguredProviderHealth: () =>
        callbacksRef.current.checkConfiguredProviderHealth(),
      runProviderSmokeTest: (prompt: string) =>
        callbacksRef.current.runProviderSmokeTest(prompt),
      getFollowUpReviewFirst: () => callbacksRef.current.getFollowUpReviewFirst(),
      resolveFollowUpAutoContinue: (prompt: string) =>
        callbacksRef.current.resolveFollowUpAutoContinue(prompt),
      clearFollowUpReviewFirstPreference: () =>
        callbacksRef.current.clearFollowUpReviewFirstPreference(),
      forceNextVerificationFailure: (message: string) =>
        callbacksRef.current.forceNextVerificationFailure(message),
      forceNextUndoPathFailure: (relPath: string) =>
        callbacksRef.current.forceNextUndoPathFailure(relPath),
      getLastConsultationPrompt: () => callbacksRef.current.getLastConsultationPrompt(),
      getInstructionPackDiagnostic: () =>
        callbacksRef.current.getInstructionPackDiagnostic(),
    };

    (window as Window & { __studioTestHooks?: typeof hooks }).__studioTestHooks = hooks;
    return () => {
      delete (window as Window & { __studioTestHooks?: typeof hooks }).__studioTestHooks;
    };
  }, []);
}
