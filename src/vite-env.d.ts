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
}

interface RoutingIntentState {
  intent: "feature_addition" | "small_ui";
  reason: string;
  files_allowed?: readonly string[];
  files_written?: readonly string[];
}

interface StudioTestHooks {
  getReadinessState(): StudioReadinessState;
  openProjectAt(folderPath: string): Promise<void>;
  getPatchPipelineState(): PatchPipelineState;
  getRoutingState(): RoutingIntentState | null;
  simulatePatchReadyForReview(): { ok: true } | { ok: false; reason: string } | void;
  simulatePreviewReady(opts?: {
    url?: string;
    port?: number;
    root?: string;
  }): { ok: true; url: string; centerTab: string } | { ok: false; reason: string };
  getProviderSmokeState(): {
    provider: import("@/core/providers/types").ProviderId | null;
    model: string | null;
    mockMode: boolean;
  };
  checkConfiguredProviderHealth(): Promise<import("@/types").HealthResult>;
  runProviderSmokeTest(prompt: string): Promise<import("@/types").ProviderResponse>;
}

interface StudioReadinessState {
  hooksReady: true;
  desktopApiReady: boolean;
  projectPath: string | null;
  scanStatus: string;
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
}

declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
