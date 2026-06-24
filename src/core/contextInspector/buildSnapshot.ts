import { redactSecretsDeep } from "@/core/agentWorkspace/redact";
import {
  buildFileSelectionSection,
  buildSymbolSection,
} from "@/core/contextInspector/sections";
import { buildContextWarnings } from "@/core/contextInspector/warnings";
import { buildTokenMetrics } from "@/core/contextInspector/tokens";
import type {
  CaptureContextInput,
  ContextSnapshot,
} from "@/core/contextInspector/types";

function newSnapshotId(): string {
  return `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function captureContextSnapshot(
  input: CaptureContextInput,
): ContextSnapshot {
  const finalPayload = redactSecretsDeep(input.planContext);
  const symbols = buildSymbolSection(input.planContext);
  const fileSelection = buildFileSelectionSection(input.planContext);
  const metrics = buildTokenMetrics({
    originalPrompt: input.originalPrompt,
    requestPreview: input.requestPreview,
    finalPayload,
    provider: input.provider,
    model: input.model,
    estimatedOutputTokens:
      input.operation === "apply_plan" || input.operation === "ai_patch"
        ? 4096
        : 1024,
  });

  const warnings = buildContextWarnings({
    hasScan: input.hasScan,
    memory: input.memory,
    symbols,
    metrics,
    relevantFileCount: symbols.relevantFiles.length,
  });

  return {
    id: newSnapshotId(),
    at: Date.now(),
    projectPath: input.projectPath,
    operation: input.operation,
    provider: input.provider,
    model: input.model,
    prompt: {
      original: input.originalPrompt,
      expanded: input.expandedPrompt,
    },
    repository: input.repository,
    memory: input.memory,
    symbols,
    fileSelection,
    warnings,
    metrics,
    finalPayload,
    requestPreview: input.requestPreview,
    orchestration: input.orchestration,
  };
}
