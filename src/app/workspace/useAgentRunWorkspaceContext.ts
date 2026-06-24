import { useCallback, useMemo } from "react";
import { updateProjectIntelligenceFromRun } from "@/core/projectIntelligence/updateFromRun";
import type { ProjectIntelligence } from "@/core/projectIntelligence/types";
import { buildDeriveAgentRunStateInput } from "@/app/workspace/agentRunStateInput";
import { useAgentRunHistoryController } from "@/app/workspace/useAgentRunHistoryController";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import {
  appContextMemoryPatch,
  buildCurrentAppContext,
  type CurrentAppContext,
} from "@/core/agent/agentAppContext";
import { auditProjectForEdit } from "@/core/agent/projectEditAudit";
import { deriveProjectFacts } from "@/core/build/projectFacts";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { FeatureInventorySnapshot } from "@/core/intelligence/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { PlanApplySession } from "@/core/planApply";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { ProviderStatusSnapshot } from "@/core/providers/providerStatus";
import type { AutoFixPhase } from "@/core/autoFix/types";
import type { BuildLoopPhase } from "@/core/build";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { ProjectScan } from "@/types";

export interface AgentRunWorkspaceContextInput {
  readonly projectPath: string | undefined;
  readonly projectName: string | null | undefined;
  readonly lastPlanPrompt: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly agentGreenfieldPanelActive: boolean;
  readonly buildStatusPhase: BuildLoopPhase;
  readonly planApplySession: PlanApplySession | null;
  readonly autoFixPhase: AutoFixPhase | null;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
  readonly providerStatus: ProviderStatusSnapshot | null;
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly followUpEscalationNote: string | null | undefined;
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly scan: ProjectScan | null;
  readonly featureInventory: FeatureInventorySnapshot | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly followUpChat: FollowUpChatMessage[];
  readonly projectMemory: ProjectMemory;
  readonly saveProjectMemoryFn: (
    patch: Partial<
      Pick<ProjectMemory, "projectName" | "architecture" | "userPreferences" | "notes">
    >,
  ) => Promise<void>;
  readonly setProjectIntelligence: React.Dispatch<
    React.SetStateAction<ProjectIntelligence>
  >;
}

export function useAgentRunWorkspaceContext(input: AgentRunWorkspaceContextInput) {
  const {
    projectPath,
    projectName,
    lastPlanPrompt,
    greenfieldRun,
    agentGreenfieldPanelActive,
    buildStatusPhase,
    planApplySession,
    autoFixPhase,
    buildRunning,
    pipelineRunning,
    providerStatus,
    buildError,
    planApplyError,
    pipelineError,
    followUpEscalationNote,
    plan,
    aiPlan,
    scan,
    featureInventory,
    sessionMemory,
    followUpChat,
    projectMemory,
    saveProjectMemoryFn,
    setProjectIntelligence,
  } = input;

  const onArtifactFrozen = useCallback(
    (artifact: AgentRunArtifact) => {
      const next = updateProjectIntelligenceFromRun({
        projectPath: projectPath ?? null,
        projectName: projectName ?? null,
        scan,
        artifact,
      });
      setProjectIntelligence(next);
    },
    [projectPath, projectName, scan, setProjectIntelligence],
  );

  const agentRunDeriveInput = useMemo(
    () =>
      buildDeriveAgentRunStateInput({
        greenfieldRun,
        greenfieldPanelActive: agentGreenfieldPanelActive,
        agentIntent: null,
        buildPhase: buildStatusPhase,
        planApplySession,
        autoFixPhase,
        buildRunning,
        pipelineRunning,
        provider: greenfieldRun.provider ?? providerStatus?.provider ?? null,
        model: greenfieldRun.model ?? providerStatus?.model ?? null,
        buildError,
        planApplyError,
        pipelineError,
        escalationNote: followUpEscalationNote,
        plan,
        aiPlan,
        scan,
        promptOverride: lastPlanPrompt,
      }),
    [
      greenfieldRun,
      agentGreenfieldPanelActive,
      buildStatusPhase,
      planApplySession,
      autoFixPhase,
      buildRunning,
      pipelineRunning,
      providerStatus,
      buildError,
      planApplyError,
      pipelineError,
      followUpEscalationNote,
      plan,
      aiPlan,
      scan,
      lastPlanPrompt,
    ],
  );

  const {
    agentRunHistory,
    selectedAgentRunId,
    selectedArtifactDiffPath,
    activeAgentRunId,
    beginAgentRun,
    selectAgentRun,
    focusArtifactDiff,
    resetActiveAgentRun,
  } = useAgentRunHistoryController({
    projectPath,
    deriveInput: agentRunDeriveInput,
    activePrompt: lastPlanPrompt,
    onArtifactFrozen,
  });

  const projectFacts = useMemo(() => {
    if (featureInventory?.features.length) {
      return featureInventory.features.map((f) => ({
        id: f.id,
        label: f.label,
        present: f.present,
      }));
    }
    return deriveProjectFacts(sessionMemory, followUpChat);
  }, [featureInventory, sessionMemory, followUpChat]);

  const currentAppContext = useMemo(
    () =>
      buildCurrentAppContext({
        scan,
        audit: auditProjectForEdit(scan),
        sessionMemory,
        chat: followUpChat,
        projectMemory,
        projectFacts,
        projectName: projectName ?? null,
      }),
    [scan, sessionMemory, followUpChat, projectMemory, projectFacts, projectName],
  );

  const persistAppContextMemory = useCallback(
    (ctx: CurrentAppContext) => {
      void saveProjectMemoryFn(appContextMemoryPatch(ctx));
    },
    [saveProjectMemoryFn],
  );

  return {
    agentRunDeriveInput,
    agentRunHistory,
    selectedAgentRunId,
    selectedArtifactDiffPath,
    activeAgentRunId,
    beginAgentRun,
    selectAgentRun,
    focusArtifactDiff,
    resetActiveAgentRun,
    projectFacts,
    currentAppContext,
    persistAppContextMemory,
  };
}
