import {
  buildEditPhasePlan,
  formatPhaseProgressLine,
  type EditPhasePlan,
} from "@/core/editPhases";
import { estimatePromptComplexity } from "@/core/providers/stageTimeouts";
import { MAX_FILES_PER_EDIT_PHASE } from "@/core/editPhases/types";

export function shouldUseMultiPhaseEdit(input: {
  readonly prompt: string;
  readonly targetCount: number;
}): boolean {
  if (input.targetCount > MAX_FILES_PER_EDIT_PHASE) return true;
  const complexity = estimatePromptComplexity(input.prompt);
  return complexity === "xlarge" && input.targetCount > 1;
}

export function buildApplyPlanEditPhases(input: {
  readonly prompt: string;
  readonly targetPaths: readonly string[];
  readonly fileSizes?: Readonly<Record<string, number>>;
  readonly runId?: string;
}): EditPhasePlan {
  return buildEditPhasePlan({
    prompt: input.prompt,
    targetPaths: input.targetPaths,
    ...(input.fileSizes ? { fileSizes: input.fileSizes } : {}),
    maxFilesPerPhase: MAX_FILES_PER_EDIT_PHASE,
    ...(input.runId ? { planId: `edit-${input.runId}` } : {}),
  });
}

export function formatEditPhasePlanLog(plan: EditPhasePlan): string {
  const lines = plan.phases.map((phase, i) => {
    const deps =
      phase.dependsOn.length > 0 ? ` (after ${phase.dependsOn.join(", ")})` : "";
    return `${i + 1}. ${phase.title}${deps}\n   files: ${phase.files.map((f) => f.relPath).join(", ")}\n   criteria: ${phase.acceptanceCriteria.join("; ")}`;
  });
  return [
    `Multi-phase edit plan · ${plan.phases.length} phase(s)`,
    ...lines,
    formatPhaseProgressLine(plan),
  ].join("\n");
}

/** Chunk targets into phase-sized batches for sequential propose calls. */
export function chunkTargetsForPhases<T extends { relPath: string }>(
  targets: readonly T[],
  plan: EditPhasePlan,
): { phaseId: string; title: string; targets: T[] }[] {
  const byPath = new Map(targets.map((t) => [t.relPath, t]));
  return plan.phases.map((phase) => ({
    phaseId: phase.id,
    title: phase.title,
    targets: phase.files
      .map((f) => byPath.get(f.relPath))
      .filter((t): t is T => t != null),
  }));
}
