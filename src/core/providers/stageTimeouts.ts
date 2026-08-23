import type { AgentStage } from "@/core/providers/orchestration";
import { EDIT_PHASE_TIMING_MS } from "@/core/editPhases/types";

/**
 * Stage-specific provider HTTP timeouts (renderer-side contract).
 * Hard-capped at 3 minutes per generation — large work is multi-phase.
 */
export const STAGE_TIMEOUT_MS = {
  planner: EDIT_PHASE_TIMING_MS.generation,
  coderSmallPatch: EDIT_PHASE_TIMING_MS.generation,
  coderLargePatch: EDIT_PHASE_TIMING_MS.generation,
  /** @deprecated Same as coderLargePatch — split into edit phases instead. */
  coderXLargePatch: EDIT_PHASE_TIMING_MS.generation,
  greenfield: EDIT_PHASE_TIMING_MS.generation,
  /** @deprecated Same as greenfield — use multi-phase greenfield. */
  greenfieldLarge: EDIT_PHASE_TIMING_MS.generation,
  /** @deprecated Same as greenfield — use multi-phase greenfield. */
  greenfieldXLarge: EDIT_PHASE_TIMING_MS.generation,
  repair: EDIT_PHASE_TIMING_MS.repair,
  test: 20_000,
} as const;

export type PatchSize = "small" | "large";

export type PromptComplexity = "standard" | "large" | "xlarge";

/** Heuristic for greenfield / large-edit prompt size from text shape. */
export function estimatePromptComplexity(
  prompt: string | null | undefined,
): PromptComplexity {
  const text = prompt?.trim() ?? "";
  if (!text) return "standard";
  const len = text.length;
  const bullets = (text.match(/^\s*[-*•]/gm) ?? []).length;
  const featureHits = (
    text.match(
      /dashboard|kanban|calendar|persist|theme|import|export|milestone|component/gi,
    ) ?? []
  ).length;
  if (len >= 2200 || bullets >= 12 || featureHits >= 10) return "xlarge";
  if (len >= 900 || bullets >= 6 || featureHits >= 5) return "large";
  return "standard";
}

export function resolveStageTimeoutMs(
  stage: AgentStage,
  opts?: {
    patchSize?: PatchSize;
    fileCount?: number;
    promptLength?: number;
    promptText?: string;
    complexity?: PromptComplexity;
  },
): number {
  switch (stage) {
    case "planner":
      return STAGE_TIMEOUT_MS.planner;
    case "coder": {
      // Complexity affects phase splitting, not wall-clock timeout.
      void opts;
      return STAGE_TIMEOUT_MS.coderLargePatch;
    }
    case "repair":
      return STAGE_TIMEOUT_MS.repair;
    case "greenfield": {
      void opts;
      return STAGE_TIMEOUT_MS.greenfield;
    }
    default:
      return STAGE_TIMEOUT_MS.test;
  }
}
