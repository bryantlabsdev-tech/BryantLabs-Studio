import { applyDeterministicRepairs } from "@/core/greenfield/deterministicProjectRepairs";
import {
  DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES,
} from "@/core/greenfield/projectRepairTypes";
import { createApiProjectRepairIo } from "@/core/greenfield/projectRepairIo";
import {
  buildTypeScriptCheckDetailsFromCommand,
} from "@/core/greenfield/tscDiagnostics";
import { mergeSetupAfterTypecheck } from "@/core/greenfield/repair";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import type { RunLogStage } from "@/core/greenfield/runLog";
import type { BryantLabsApi } from "@/types";

export { DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES as GREENFIELD_DETERMINISTIC_REPAIR_MAX_PASSES };

export interface DeterministicRepairLogHost {
  readonly appendGreenfieldRunLog: (
    stage: RunLogStage,
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => void;
}

async function refreshSetupTypecheck(
  api: BryantLabsApi,
  folderPath: string,
  previous: GreenfieldSetupResult,
): Promise<GreenfieldSetupResult> {
  const res = await api.greenfieldTypecheck(folderPath);
  if ("error" in res) {
    return { ...previous, ok: false, error: res.error };
  }
  const details = res.typecheckDetails ?? buildTypeScriptCheckDetailsFromCommand(res.typecheck);
  return mergeSetupAfterTypecheck(previous, res.typecheck, details);
}

/** Run the same deterministic repair loop as stress replay, via BryantLabsApi. */
export async function applyDeterministicRepairsForGreenfieldSetup(
  api: BryantLabsApi,
  folderPath: string,
  setup: GreenfieldSetupResult,
  host: DeterministicRepairLogHost,
  opts?: { readonly maxPasses?: number },
): Promise<{
  readonly setup: GreenfieldSetupResult;
  readonly fixed: boolean;
  readonly deterministicPasses: number;
}> {
  const io = createApiProjectRepairIo(api, folderPath);
  const result = await applyDeterministicRepairs(
    io,
    opts?.maxPasses ?? DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES,
  );

  for (const attempt of result.attempts) {
    if (attempt.outcome !== "applied") continue;
    host.appendGreenfieldRunLog(
      "greenfield_repair",
      "success",
      `Deterministic repair (${attempt.detail})`,
      attempt.targetPath,
    );
  }

  let nextSetup = setup;
  if (result.attempts.length > 0 || !setup.typecheck?.ok) {
    nextSetup = await refreshSetupTypecheck(api, folderPath, setup);
  }

  return {
    setup: nextSetup,
    fixed: result.attempts.length > 0,
    deterministicPasses: result.deterministicPasses,
  };
}
