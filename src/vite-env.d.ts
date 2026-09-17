/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRYANTLABS_E2E?: string;
  readonly VITE_BRYANTLABS_ONBOARDING_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface PatchPipelineState {
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
}

interface RoutingIntentState {
  intent: "feature_addition" | "small_ui";
  reason: string;
  files_allowed?: readonly string[];
  files_written?: readonly string[];
}

interface StudioTestHooks {
  getReadinessState(): StudioReadinessState;
  getGreenfieldRunSnapshot(): import("@/core/greenfield/runState").GreenfieldRunSnapshot;
  getFollowUpSettlementDiagnostic(): import("@/core/agent/followUpSettlementDiagnostics").FollowUpSettlementDiagnostic;
  openProjectAt(folderPath: string): Promise<void>;
  getPatchPipelineState(): PatchPipelineState;
  getRoutingState(): RoutingIntentState | null;
  simulatePatchReadyForReview(): { ok: true } | { ok: false; reason: string } | void;
  simulatePreviewReady(opts?: {
    url?: string;
    port?: number;
    root?: string;
  }): { ok: true; url: string; centerTab: string } | { ok: false; reason: string };
  simulateMixedCreateEditReadyForReview(): Promise<
    { ok: true } | { ok: false; reason: string }
  >;
  applyApprovedReadyFiles(): Promise<{ ok: boolean; applied?: readonly string[] }>;
  undoLastEdit(): Promise<void>;
  getCanUndo(): boolean;
  getProviderSmokeState(): {
    provider: import("@/core/providers/types").ProviderId | null;
    model: string | null;
    mockMode: boolean;
  };
  checkConfiguredProviderHealth(): Promise<import("@/types").HealthResult>;
  runProviderSmokeTest(prompt: string): Promise<import("@/types").ProviderResponse>;
  getFollowUpReviewFirst(): boolean;
  resolveFollowUpAutoContinue(prompt: string): boolean;
  clearFollowUpReviewFirstPreference(): void;
  forceNextVerificationFailure(message: string): void;
  forceNextUndoPathFailure(relPath: string): void;
  getLastConsultationPrompt(): string;
  getInstructionPackDiagnostic(): import("@/core/projectRules/instructionPack").InstructionPackDiagnostic | null;
}

interface StudioReadinessState {
  hooksReady: true;
  desktopApiReady: boolean;
  projectPath: string | null;
  scanStatus: string;
  indexedSourceFileCount: number;
  effectiveIndexedSourceFileCount: number;
  composerReady: boolean;
  composerBlockReason: string | null;
  centerTab: string;
  previewPanel: {
    url: string | null;
    port: number | null;
    running: boolean;
    visible: boolean;
  };
  greenfieldRun: {
    active: boolean;
    runResult: "idle" | "running" | "success" | "failed" | "cancelled" | "aborted" | "interrupted";
    genStatus: string;
    writeStatus: string;
    setupStatus: string;
    lastFailureReason: string | null;
  };
}

interface Window {
  __studioTestHooks?: StudioTestHooks;
  __studioMaxUpdateDepthErrors?: string[];
}

declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
