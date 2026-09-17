import type { BryantLabsApi } from "@/types";
import {
  assembleInstructionPackFromTrusted,
  emptyInstructionPack,
  isTrustedInstructionLoad,
  recordLastInstructionPack,
  type InstructionPack,
  type InstructionPackDiagnostic,
  type InstructionSkip,
  type InstructionSkipReason,
} from "@/core/projectRules/instructionPack";

export {
  MAX_PROJECT_RULES_CHARS,
  PROJECT_RULES_REL_PATHS,
  getLastInstructionPackDiagnostic,
} from "@/core/projectRules/instructionPack";
export type { InstructionPack, InstructionPackDiagnostic, InstructionSkip, InstructionSkipReason };

export function clearProjectRulesCache(): void {
  recordLastInstructionPack(null);
}

export async function loadProjectInstructionPack(
  api: Pick<BryantLabsApi, "loadProjectInstructionPack">,
  _projectRoot?: string,
): Promise<InstructionPack> {
  if (typeof api.loadProjectInstructionPack !== "function") {
    const empty = emptyInstructionPack();
    recordLastInstructionPack(empty);
    return empty;
  }
  let loaded: unknown;
  try {
    loaded = await api.loadProjectInstructionPack();
  } catch {
    const empty = emptyInstructionPack();
    recordLastInstructionPack(empty);
    return empty;
  }
  if (!isTrustedInstructionLoad(loaded)) {
    const empty = emptyInstructionPack();
    recordLastInstructionPack(empty);
    return empty;
  }
  const pack = assembleInstructionPackFromTrusted(loaded);
  recordLastInstructionPack(pack);
  return pack;
}

export async function readProjectRulesText(
  api: Pick<BryantLabsApi, "loadProjectInstructionPack">,
  projectRoot?: string,
): Promise<string> {
  const pack = await loadProjectInstructionPack(api, projectRoot);
  return pack.text;
}
