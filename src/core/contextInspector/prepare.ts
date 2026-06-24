import { redactSecrets } from "@/core/agentWorkspace/redact";
import {
  buildAgentApplyPlanContext,
  buildAgentPlanContext,
} from "@/core/context/buildAgentContext";
import { captureContextSnapshot } from "@/core/contextInspector/buildSnapshot";
import { buildProviderRequestPreview } from "@/core/contextInspector/planPreview";
import {
  buildMemorySection,
  buildRepositorySection,
} from "@/core/contextInspector/sections";
import type {
  ContextOperation,
  ContextOrchestrationSection,
  ContextSnapshot,
} from "@/core/contextInspector/types";
import {
  buildContextOrchestrationSection,
  normalizeProviderSettings,
  operationToStage,
} from "@/core/providers/orchestration";
import { effectivePlanPrompt } from "@/core/sessionMemory";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { PlanContext } from "@/core/planner/aiTypes";
import type { ProviderId } from "@/core/providers/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { ProjectScan } from "@/types";

export interface PrepareContextSnapshotInput {
  readonly operation: ContextOperation;
  readonly provider: ProviderId;
  readonly model: string;
  readonly originalPrompt: string;
  readonly scan: ProjectScan;
  readonly projectPath: string | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemory: ProjectMemory;
  readonly applyPlanSlim?: boolean;
  readonly requestPreviewOverride?: string;
  readonly orchestration?: ContextOrchestrationSection;
}

export function prepareContextSnapshot(
  input: PrepareContextSnapshotInput,
): ContextSnapshot {
  const expanded = effectivePlanPrompt(
    input.originalPrompt,
    input.sessionMemory,
  );

  let planContext: PlanContext;
  if (
    input.operation === "ai_plan" ||
    input.operation === "agent"
  ) {
    planContext = buildAgentPlanContext(
      input.scan,
      input.originalPrompt,
      input.sessionMemory,
      input.projectMemory,
      input.projectPath,
    ).context;
  } else {
    planContext = buildAgentApplyPlanContext(input.scan, {
      userPrompt: input.originalPrompt,
      projectMemory: input.projectMemory,
      sessionMemory: input.sessionMemory,
      projectPath: input.projectPath,
      slim: input.applyPlanSlim ?? input.operation === "apply_plan",
    });
  }

  return commitContextSnapshot({
    operation: input.operation,
    provider: input.provider,
    model: input.model,
    originalPrompt: input.originalPrompt,
    expandedPrompt: expanded,
    planContext,
    scan: input.scan,
    projectPath: input.projectPath,
    projectMemory: input.projectMemory,
    orchestration:
      input.orchestration ??
      buildContextOrchestrationSection(
        normalizeProviderSettings({
          provider: input.provider,
          geminiModel: input.model,
          ollamaModel: input.model,
          ollamaBaseUrl: "",
          anthropicModel: input.model,
          groqModel: input.model,
          openrouterModel: input.model,
          hasGeminiKey: false,
          hasAnthropicKey: false,
          hasGroqKey: false,
          hasOpenRouterKey: false,
          autoFixMode: "ask",
          agentMode: "single",
          plannerProvider: input.provider,
          plannerModel: "",
          coderProvider: input.provider,
          coderModel: "",
          repairProvider: input.provider,
          repairModel: "",
          maxAiCalls: 3,
          maxRepairAttempts: 1,
          stopOnProviderLimit: true,
          askBeforeFallback: true,
          fileWriteMode: "workspace",
        }),
        { stage: operationToStage(input.operation) },
      ),
    ...(input.requestPreviewOverride
      ? { requestPreviewOverride: input.requestPreviewOverride }
      : {}),
  });
}

/** Record a snapshot from an already-built PlanContext (avoids rebuilding). */
export function commitContextSnapshot(input: {
  readonly operation: ContextOperation;
  readonly provider: ProviderId;
  readonly model: string;
  readonly originalPrompt: string;
  readonly expandedPrompt: string;
  readonly planContext: PlanContext;
  readonly scan: ProjectScan;
  readonly projectPath: string | null;
  readonly projectMemory: ProjectMemory;
  readonly requestPreviewOverride?: string;
  readonly orchestration: ContextOrchestrationSection;
}): ContextSnapshot {
  const repository = buildRepositorySection(input.scan, input.planContext);
  const memory = buildMemorySection(input.projectMemory, input.planContext);
  const previewBase =
    input.requestPreviewOverride ??
    buildProviderRequestPreview(
      input.provider,
      input.operation,
      input.expandedPrompt,
      input.planContext,
      "",
    );

  return captureContextSnapshot({
    operation: input.operation,
    provider: input.provider,
    model: input.model,
    originalPrompt: input.originalPrompt,
    expandedPrompt: input.expandedPrompt,
    planContext: input.planContext,
    projectPath: input.projectPath,
    repository,
    memory,
    requestPreview: redactSecrets(previewBase),
    hasScan: true,
    orchestration: input.orchestration,
  });
}
