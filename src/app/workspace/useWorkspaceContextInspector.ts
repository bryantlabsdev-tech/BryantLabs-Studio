import { useCallback, useState } from "react";
import {
  commitContextSnapshot,
  prepareContextSnapshot,
  appendContextHistory,
  loadContextHistory,
  type ContextSnapshot,
  type ContextOperation,
} from "@/core/contextInspector";
import {
  buildContextOrchestrationSection,
  MAX_REPAIR_ATTEMPTS_DEFAULT,
  normalizeProviderSettings,
  operationToStage,
} from "@/core/providers/orchestration";
import {
  healthToReliabilityStatus,
  reliabilityStatusLabel,
} from "@/core/providers/reliability";
import { effectivePlanPrompt } from "@/core/sessionMemory";
import type { PlanContext } from "@/core/planner/aiTypes";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { ProjectScan } from "@/types";
import type { Plan } from "@/core/planner";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { CurrentRunAnalyticsAccumulator } from "@/core/analytics/recordRun";
import type { HealthResult } from "@/core/providers/types";

export interface WorkspaceContextInspectorState {
  readonly contextSnapshot: ContextSnapshot | null;
  readonly setContextSnapshot: React.Dispatch<React.SetStateAction<ContextSnapshot | null>>;
  readonly contextInspectorDraft: ContextSnapshot | null;
  readonly setContextInspectorDraft: React.Dispatch<
    React.SetStateAction<ContextSnapshot | null>
  >;
  readonly contextHistory: ContextSnapshot[];
  readonly setContextHistory: React.Dispatch<React.SetStateAction<ContextSnapshot[]>>;
  readonly selectedContextId: string | null;
  readonly setSelectedContextId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly showContextRequestPreview: boolean;
  readonly setShowContextRequestPreview: React.Dispatch<React.SetStateAction<boolean>>;
  readonly commitContextCapture: (opts: {
    operation: ContextOperation;
    provider: ProviderId;
    model: string;
    originalPrompt: string;
    planContext: PlanContext;
    expandedPrompt?: string;
    requestPreviewOverride?: string;
    settings?: ProviderSettings;
    estimatedAiCalls?: number | null;
  }) => void;
  readonly refreshContextInspectorDraft: () => void;
  readonly selectContextSnapshot: (id: string | null) => void;
}

export function useWorkspaceContextInspector(input: {
  readonly effectiveScan: ProjectScan | null;
  readonly projectPath: string | undefined;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemoryRef: React.MutableRefObject<ProjectMemory>;
  readonly providerHealthCacheRef: React.MutableRefObject<
    Partial<Record<ProviderId, HealthResult>>
  >;
  readonly currentRunAnalyticsRef: React.MutableRefObject<CurrentRunAnalyticsAccumulator>;
  readonly lastContextSnapshotIdRef: React.MutableRefObject<string | null>;
  readonly lastPlanPrompt: string | null;
  readonly plan: Plan | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
}): WorkspaceContextInspectorState {
  const [contextSnapshot, setContextSnapshot] = useState<ContextSnapshot | null>(null);
  const [contextInspectorDraft, setContextInspectorDraft] =
    useState<ContextSnapshot | null>(null);
  const [contextHistory, setContextHistory] = useState<ContextSnapshot[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [showContextRequestPreview, setShowContextRequestPreview] = useState(false);

  const commitContextCapture = useCallback(
    (opts: {
      operation: ContextOperation;
      provider: ProviderId;
      model: string;
      originalPrompt: string;
      planContext: PlanContext;
      expandedPrompt?: string;
      requestPreviewOverride?: string;
      settings?: ProviderSettings;
      estimatedAiCalls?: number | null;
    }) => {
      if (!input.effectiveScan) return;
      const expanded =
        opts.expandedPrompt ??
        effectivePlanPrompt(opts.originalPrompt, input.sessionMemory);
      const settings = normalizeProviderSettings(
        opts.settings ?? {
          provider: opts.provider,
          geminiModel: "",
          ollamaModel: "",
          ollamaBaseUrl: "",
          anthropicModel: "",
          groqModel: "",
          openrouterModel: "",
          hasGeminiKey: false,
          hasAnthropicKey: false,
          hasGroqKey: false,
          hasOpenRouterKey: false,
          autoFixMode: "ask",
          agentMode: "single",
          plannerProvider: opts.provider,
          plannerModel: "",
          coderProvider: opts.provider,
          coderModel: "",
          repairProvider: opts.provider,
          repairModel: "",
          maxAiCalls: 3,
          maxRepairAttempts: MAX_REPAIR_ATTEMPTS_DEFAULT,
          stopOnProviderLimit: true,
          askBeforeFallback: true,
          fileWriteMode: "workspace",
        },
      );
      const healthAtStart: Partial<Record<ProviderId, string>> = {};
      for (const [id, health] of Object.entries(input.providerHealthCacheRef.current)) {
        const providerId = id as ProviderId;
        healthAtStart[providerId] = reliabilityStatusLabel(
          healthToReliabilityStatus(health ?? null, settings, providerId),
        );
      }
      const snap = commitContextSnapshot({
        operation: opts.operation,
        provider: opts.provider,
        model: opts.model,
        originalPrompt: opts.originalPrompt,
        expandedPrompt: expanded,
        planContext: opts.planContext,
        scan: input.effectiveScan,
        projectPath: input.projectPath ?? null,
        projectMemory: input.projectMemoryRef.current,
        orchestration: buildContextOrchestrationSection(settings, {
          stage: operationToStage(opts.operation),
          estimatedAiCalls: opts.estimatedAiCalls ?? null,
          providerHealthAtStart: healthAtStart,
        }),
        ...(opts.requestPreviewOverride
          ? { requestPreviewOverride: opts.requestPreviewOverride }
          : {}),
      });
      setContextSnapshot(snap);
      setContextHistory(appendContextHistory(snap));
      setSelectedContextId(snap.id);
      input.currentRunAnalyticsRef.current = {
        ...input.currentRunAnalyticsRef.current,
        contextSnapshotId: snap.id,
      };
      input.lastContextSnapshotIdRef.current = snap.id;
    },
    [input],
  );

  const refreshContextInspectorDraft = useCallback(() => {
    if (!input.effectiveScan) {
      setContextInspectorDraft(null);
      return;
    }
    const prompt = (input.lastPlanPrompt ?? input.plan?.prompt ?? "").trim();
    if (!prompt) {
      setContextInspectorDraft(null);
      return;
    }
    const provider = (input.greenfieldRun.provider ?? "ollama") as ProviderId;
    const model = input.greenfieldRun.model ?? "unknown";
    setContextInspectorDraft(
      prepareContextSnapshot({
        operation: "ai_plan",
        provider,
        model,
        originalPrompt: prompt,
        scan: input.effectiveScan,
        projectPath: input.projectPath ?? null,
        sessionMemory: input.sessionMemory,
        projectMemory: input.projectMemoryRef.current,
      }),
    );
  }, [input]);

  const selectContextSnapshot = useCallback((id: string | null) => {
    setSelectedContextId(id);
  }, []);

  return {
    contextSnapshot,
    setContextSnapshot,
    contextInspectorDraft,
    setContextInspectorDraft,
    contextHistory,
    setContextHistory,
    selectedContextId,
    setSelectedContextId,
    showContextRequestPreview,
    setShowContextRequestPreview,
    commitContextCapture,
    refreshContextInspectorDraft,
    selectContextSnapshot,
  };
}

export { loadContextHistory };
