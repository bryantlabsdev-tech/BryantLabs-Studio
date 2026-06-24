import {
  getAgentRunBlockReason,
  isGreenfieldRunActive,
} from "@/core/agent/agentRunMutex";
import type { AIPlanStatus } from "@/app/orchestration/types";
import type { AppPreviewState } from "@/app/workspace/usePreviewState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { RunFinalStatus } from "@/core/greenfield/runLog";
import type { CenterTab } from "@/core/layout/types";
import type { ProviderStatusSnapshot } from "@/core/providers/providerStatus";
import type { PlanApplySession } from "@/core/planApply";
import type { ProjectScan } from "@/types";

export interface StudioGreenfieldReadiness {
  readonly active: boolean;
  readonly runResult: RunFinalStatus;
  readonly genStatus: string;
  readonly writeStatus: string;
  readonly setupStatus: string;
  readonly lastFailureReason: string | null;
}

export interface StudioPreviewReadiness {
  readonly url: string | null;
  readonly port: number | null;
  readonly running: boolean;
  readonly visible: boolean;
}

export interface StudioReadinessState {
  readonly hooksReady: true;
  readonly desktopApiReady: boolean;
  readonly projectPath: string | null;
  readonly scanStatus: string;
  readonly composerReady: boolean;
  readonly composerBlockReason: string | null;
  readonly centerTab: CenterTab;
  readonly previewPanel: StudioPreviewReadiness;
  readonly greenfieldRun: StudioGreenfieldReadiness;
}

export interface StudioReadinessInput {
  readonly apiReady: boolean;
  readonly projectPath: string | undefined;
  readonly scan: ProjectScan | null;
  readonly scanStatus: string;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly greenfieldPanelActive: boolean;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplySession: PlanApplySession | null;
  readonly autoFixPhase: string | null;
  readonly centerTab: CenterTab;
  readonly appPreview: AppPreviewState;
  readonly providerStatus: ProviderStatusSnapshot | null;
}

function resolveGreenfieldFailureReason(run: GreenfieldRunSnapshot): string | null {
  return (
    run.failureReport?.rootCauseLine ??
    run.writeError ??
    run.finalMessage ??
    null
  );
}

/** Deterministic readiness snapshot for Playwright E2E hooks. */
export function computeStudioReadinessState(
  input: StudioReadinessInput,
): StudioReadinessState {
  const composerBlockReason = getAgentRunBlockReason({
    greenfieldRun: input.greenfieldRun,
    greenfieldPanelActive: input.greenfieldPanelActive,
    buildRunning: input.buildRunning,
    pipelineRunning: input.pipelineRunning,
    aiPlanStatus: input.aiPlanStatus,
    planApplyPhase: input.planApplySession?.phase ?? null,
    autoFixPhase: input.autoFixPhase,
  });

  const hasProject = Boolean(input.projectPath);
  const agentBusy =
    Boolean(composerBlockReason) ||
    input.buildRunning ||
    input.pipelineRunning ||
    isGreenfieldRunActive(input.greenfieldRun, input.greenfieldPanelActive);
  const composerDisabled = agentBusy || (hasProject && input.scanStatus === "scanning");
  const composerReady = !composerDisabled && !composerBlockReason;

  const previewUrl = input.appPreview.url;
  const previewPort = input.appPreview.port;
  const previewVisible =
    input.centerTab === "preview" &&
    Boolean(previewUrl) &&
    (previewPort !== null || Boolean(previewUrl));

  return {
    hooksReady: true,
    desktopApiReady: input.apiReady,
    projectPath: input.projectPath ?? null,
    scanStatus: input.scanStatus,
    composerReady,
    composerBlockReason,
    centerTab: input.centerTab,
    previewPanel: {
      url: previewUrl,
      port: previewPort,
      running: input.appPreview.running,
      visible: previewVisible,
    },
    greenfieldRun: {
      active: isGreenfieldRunActive(input.greenfieldRun, input.greenfieldPanelActive),
      runResult: input.greenfieldRun.runResult,
      genStatus: input.greenfieldRun.genStatus,
      writeStatus: input.greenfieldRun.writeStatus,
      setupStatus: input.greenfieldRun.setupStatus,
      lastFailureReason: resolveGreenfieldFailureReason(input.greenfieldRun),
    },
  };
}
