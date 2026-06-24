import { useCallback, type Dispatch, type SetStateAction } from "react";
import { createAgentRunId } from "@/app/workspace/useAgentRunHistoryController";
import { useStudioTestHooks } from "@/app/workspace/useStudioTestHooks";
import {
  computeStudioReadinessState,
  type StudioReadinessState,
} from "@/app/workspace/studioTestReadiness";
import type { AppPreviewState } from "@/app/workspace/usePreviewState";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderStatusSnapshot } from "@/core/providers/providerStatus";
import type { CenterTab } from "@/core/layout/types";
import type { BuildLoopPhase } from "@/core/build";
import type { PlanApplySession } from "@/core/planApply";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { AIPlanStatus } from "@/app/orchestration/types";
import type { BryantLabsApi, ProjectScan } from "@/types";
import {
  appendFollowUpChatMessage,
  createFollowUpChatMessage,
} from "@/core/build/followUpChat";

export interface WorkspaceStudioTestHooksInput {
  readonly api: BryantLabsApi | undefined;
  readonly projectPath: string | undefined;
  readonly scan: ProjectScan | null;
  readonly scanStatus: string;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly greenfieldPanelActive: boolean;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly aiPlanStatus: AIPlanStatus;
  readonly autoFixPhase: string | null;
  readonly providerStatus: ProviderStatusSnapshot | null;
  readonly planApplySession: PlanApplySession | null;
  readonly planApplyError: string | null;
  readonly buildError: string | null;
  readonly buildStatusPhase: BuildLoopPhase;
  readonly centerTab: CenterTab;
  readonly appPreview: AppPreviewState;
  readonly activeAgentRunId: string | null;
  readonly openProjectAt: (folderPath: string) => Promise<void>;
  readonly setFollowUpChat: (chat: FollowUpChatMessage[]) => void;
  readonly beginAgentRun: (runId: string, prompt: string, userMessageId: string) => void;
  readonly setPlanApplySession: Dispatch<SetStateAction<PlanApplySession | null>>;
  readonly releaseBuildRunForReview: () => void;
  readonly patchAppPreview: (state: {
    url: string | null;
    running: boolean;
    root?: string | null;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }) => void;
  readonly requestPreviewTab: () => void;
}

export function useWorkspaceStudioTestHooks(input: WorkspaceStudioTestHooksInput): void {
  const {
    api,
    projectPath,
    scan,
    scanStatus,
    greenfieldRun,
    greenfieldPanelActive,
    buildRunning,
    pipelineRunning,
    aiPlanStatus,
    autoFixPhase,
    providerStatus,
    planApplySession,
    planApplyError,
    buildError,
    buildStatusPhase,
    centerTab,
    appPreview,
    activeAgentRunId,
    openProjectAt,
    setFollowUpChat,
    beginAgentRun,
    setPlanApplySession,
    releaseBuildRunForReview,
    patchAppPreview,
    requestPreviewTab,
  } = input;

  const getReadinessState = useCallback((): StudioReadinessState => {
    return computeStudioReadinessState({
      apiReady: api?.isDesktop === true,
      projectPath,
      scan,
      scanStatus,
      greenfieldRun,
      greenfieldPanelActive,
      buildRunning,
      pipelineRunning,
      aiPlanStatus,
      planApplySession,
      autoFixPhase,
      centerTab,
      appPreview,
      providerStatus,
    });
  }, [
    api,
    projectPath,
    scan,
    scanStatus,
    greenfieldRun,
    greenfieldPanelActive,
    buildRunning,
    pipelineRunning,
    aiPlanStatus,
    planApplySession,
    autoFixPhase,
    centerTab,
    appPreview,
    providerStatus,
  ]);

  const getPatchPipelineState = useCallback(
    () => ({
      planApplyPhase: planApplySession?.phase ?? null,
      buildRunning,
      buildPhase: buildStatusPhase,
      planApplyError: planApplyError ?? null,
      buildError: buildError ?? null,
      aiPlanStatus,
      centerTab,
      activeAgentRunId,
    }),
    [
      planApplySession?.phase,
      buildRunning,
      buildStatusPhase,
      planApplyError,
      buildError,
      aiPlanStatus,
      centerTab,
      activeAgentRunId,
    ],
  );

  const simulatePatchReadyForReview = useCallback(() => {
    const resolvedPath = projectPath ?? greenfieldRun.projectPath;
    if (!resolvedPath) return { ok: false as const, reason: "no_project" };
    const runId = createAgentRunId();
    const userMessage = createFollowUpChatMessage("user", "Add a timer", { runId });
    if (projectPath) {
      setFollowUpChat(appendFollowUpChatMessage(projectPath, userMessage));
      beginAgentRun(runId, "Add a timer", userMessage.id);
    }
    const basis = "export default function App() { return null; }\n";
    const proposal = `${basis}// timer\n`;
    setPlanApplySession({
      applyRunId: runId,
      prompt: "Add a timer",
      planSummary: "Add a timer",
      planSource: "deterministic",
      applyTargetCount: 1,
      applySkippedCount: 0,
      files: [
        {
          relPath: "src/App.tsx",
          absPath: `${resolvedPath}/src/App.tsx`,
          selectionReason: "e2e",
          planReason: "e2e",
          status: "ready",
          decision: "pending",
          basisContent: basis,
          proposal: {
            newContent: proposal,
            summary: "Add timer",
            reasoning: "e2e fixture",
            risks: [],
          },
          diffStats: { added: 1, removed: 0, changed: true },
        },
      ],
      phase: "waiting_for_review",
      selectedRelPath: "src/App.tsx",
      applyError: null,
      verification: null,
      totals: {
        filesChanged: 1,
        linesAdded: 1,
        linesRemoved: 0,
        filesApproved: 0,
        filesApplied: 0,
      },
    });
    releaseBuildRunForReview();
    console.log("[patch:generated] files=src/App.tsx");
    console.log("[patch:ready_for_apply] files=src/App.tsx");
    console.log("[patch:review_mode] enabled=true");
    return { ok: true as const };
  }, [
    projectPath,
    greenfieldRun.projectPath,
    setFollowUpChat,
    beginAgentRun,
    setPlanApplySession,
    releaseBuildRunForReview,
  ]);

  const simulatePreviewReady = useCallback(
    (opts?: { url?: string; port?: number; root?: string }) => {
      const url = opts?.url ?? "http://127.0.0.1:4173/";
      const port = opts?.port ?? 4173;
      patchAppPreview({
        url,
        running: true,
        root: opts?.root ?? projectPath ?? null,
        lastSuccessfulPreviewAt: Date.now(),
        port,
      });
      requestPreviewTab();
      return { ok: true as const, url, centerTab: "preview" as const };
    },
    [patchAppPreview, projectPath, requestPreviewTab],
  );

  const getProviderSmokeState = useCallback(() => {
    const provider = providerStatus?.provider ?? null;
    return {
      provider,
      model: providerStatus?.model ?? null,
      mockMode: providerStatus?.model === "mock-deterministic",
    };
  }, [providerStatus]);

  const checkConfiguredProviderHealth = useCallback(async () => {
    if (!api) {
      return {
        ok: false,
        provider: providerStatus?.provider ?? "groq",
        model: providerStatus?.model ?? "",
        checks: [{ label: "Desktop API", ok: false, detail: "Unavailable" }],
        error: "Desktop API unavailable",
      };
    }
    const settings = normalizeProviderSettings(await api.getProviderSettings());
    return api.checkProviderHealth(settings.provider);
  }, [api, providerStatus?.provider, providerStatus?.model]);

  const runProviderSmokeTest = useCallback(
    async (prompt: string) => {
      if (!api) {
        return {
          ok: false,
          provider: providerStatus?.provider ?? "groq",
          model: providerStatus?.model ?? "",
          text: "",
          raw: null,
          latencyMs: 0,
          error: "Desktop API unavailable",
        };
      }
      const settings = normalizeProviderSettings(await api.getProviderSettings());
      return api.testProvider(settings.provider, prompt);
    },
    [api, providerStatus?.provider, providerStatus?.model],
  );

  useStudioTestHooks({
    getReadinessState,
    openProjectAt,
    getPatchPipelineState,
    simulatePatchReadyForReview,
    simulatePreviewReady,
    getProviderSmokeState,
    checkConfiguredProviderHealth,
    runProviderSmokeTest,
  });
}
