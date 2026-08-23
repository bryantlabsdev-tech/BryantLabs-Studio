import { loadEditPhaseCheckpointLocal } from "@/core/editPhases/persistence";
import { formatPhaseProgressLine } from "@/core/editPhases/runMultiPhaseEdit";
import type { EditPhasePlan } from "@/core/editPhases/types";

export function readEditPhasePlanForProject(
  projectPath: string | null | undefined,
): EditPhasePlan | null {
  if (!projectPath) return null;
  return loadEditPhaseCheckpointLocal(projectPath)?.plan ?? null;
}

export function editPhasePlanSummary(plan: EditPhasePlan | null): string | null {
  if (!plan) return null;
  return formatPhaseProgressLine(plan);
}
