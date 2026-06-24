import type { AgentStage } from "@/core/providers/orchestration";

/** Stage-specific provider HTTP timeouts (renderer-side contract). */
export const STAGE_TIMEOUT_MS = {
  planner: 30_000,
  coderSmallPatch: 60_000,
  coderLargePatch: 120_000,
  greenfield: 120_000,
  repair: 60_000,
  test: 20_000,
} as const;

export type PatchSize = "small" | "large";

export function resolveStageTimeoutMs(
  stage: AgentStage,
  opts?: { patchSize?: PatchSize; fileCount?: number },
): number {
  switch (stage) {
    case "planner":
      return STAGE_TIMEOUT_MS.planner;
    case "coder": {
      const large =
        opts?.patchSize === "large" ||
        (opts?.fileCount != null && opts.fileCount > 2);
      return large
        ? STAGE_TIMEOUT_MS.coderLargePatch
        : STAGE_TIMEOUT_MS.coderSmallPatch;
    }
    case "repair":
      return STAGE_TIMEOUT_MS.repair;
    case "greenfield":
      return STAGE_TIMEOUT_MS.greenfield;
    default:
      return STAGE_TIMEOUT_MS.test;
  }
}
