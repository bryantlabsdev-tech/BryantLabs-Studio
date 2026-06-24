import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import {
  applyQuickRepairsForFileAsync,
  groupQuickRepairTargets,
  setupHasQuickRepairableErrors,
} from "@/core/greenfield/quickRepair";
import {
  buildTypeScriptCheckDetailsFromCommand,
  resolveTypecheckDetails,
  type TypeScriptCheckDetails,
} from "@/core/greenfield/tscDiagnostics";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import type { BryantLabsApi, VerificationResult } from "@/types";

export type QuickRepairLogStage = GreenfieldRunLogEntry["stage"];

export interface QuickRepairLogHost {
  readonly appendGreenfieldRunLog: (
    stage: QuickRepairLogStage,
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => void;
}

export async function readProjectFileForRepair(
  api: BryantLabsApi,
  projectRoot: string,
  relPath: string,
): Promise<string | null> {
  const abs = `${projectRoot.replace(/\/$/, "")}/${relPath}`;
  try {
    const res = await api.readFile(abs);
    return res.readable && res.content !== undefined ? res.content : null;
  } catch {
    return null;
  }
}

async function applyQuickRepairRound(
  api: BryantLabsApi,
  folderPath: string,
  details: TypeScriptCheckDetails,
  host: QuickRepairLogHost,
  logStage: QuickRepairLogStage,
): Promise<boolean> {
  if (!setupHasQuickRepairableErrors(details.diagnostics)) return false;

  const targets = groupQuickRepairTargets(details.diagnostics);
  let changed = false;

  for (const [relPath, fileDiags] of targets) {
    const content = await readProjectFileForRepair(api, folderPath, relPath);
    if (content == null) continue;
    const repaired = await applyQuickRepairsForFileAsync(
      relPath,
      content,
      fileDiags,
      (path) => readProjectFileForRepair(api, folderPath, path),
    );
    if (!repaired) continue;
    const abs = `${folderPath.replace(/\/$/, "")}/${relPath}`;
    const edit = await api.applyEdit(abs, content, repaired.content);
    if (!edit.ok) continue;
    changed = true;
    host.appendGreenfieldRunLog(
      logStage,
      "success",
      `Quick repair (${repaired.fixes.join(", ")})`,
      relPath,
    );

    if (repaired.extraFiles) {
      for (const [extraRel, extraContent] of Object.entries(repaired.extraFiles)) {
        const extraAbs = `${folderPath.replace(/\/$/, "")}/${extraRel}`;
        const existing = await readProjectFileForRepair(api, folderPath, extraRel);
        const extraEdit = await api.applyEdit(extraAbs, existing ?? "", extraContent);
        if (extraEdit.ok) {
          changed = true;
          host.appendGreenfieldRunLog(
            logStage,
            "success",
            "Quick repair (export/import fix)",
            extraRel,
          );
        }
      }
    }
  }

  return changed;
}

/** Up to `maxPasses` fix rounds, re-running `refreshDetails` after each round with changes. */
export async function applyQuickRepairPassesFromDetails(
  api: BryantLabsApi,
  folderPath: string,
  initialDetails: TypeScriptCheckDetails,
  host: QuickRepairLogHost,
  opts: {
    readonly logStage: QuickRepairLogStage;
    readonly maxPasses?: number;
    readonly refreshDetails: () => Promise<TypeScriptCheckDetails>;
  },
): Promise<{ details: TypeScriptCheckDetails; fixed: boolean }> {
  const maxPasses = opts.maxPasses ?? 8;
  let details = initialDetails;
  let anyFixed = false;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (!setupHasQuickRepairableErrors(details.diagnostics)) break;
    const changed = await applyQuickRepairRound(
      api,
      folderPath,
      details,
      host,
      opts.logStage,
    );
    if (!changed) break;
    anyFixed = true;
    details = await opts.refreshDetails();
  }

  return { details, fixed: anyFixed };
}

export async function applyQuickRepairsForSetup(
  api: BryantLabsApi,
  folderPath: string,
  initialSetup: GreenfieldSetupResult,
  host: QuickRepairLogHost,
  rerunTypecheck: (previous: GreenfieldSetupResult) => Promise<GreenfieldSetupResult>,
  logStage: QuickRepairLogStage = "greenfield_repair",
): Promise<{ setup: GreenfieldSetupResult; fixed: boolean }> {
  let setup = initialSetup;
  const initialDetails = resolveTypecheckDetails(setup);
  if (!initialDetails) {
    return { setup, fixed: false };
  }

  const result = await applyQuickRepairPassesFromDetails(
    api,
    folderPath,
    initialDetails,
    host,
    {
      logStage,
      refreshDetails: async () => {
        setup = await rerunTypecheck(setup);
        return (
          resolveTypecheckDetails(setup) ??
          buildTypeScriptCheckDetailsFromCommand(
            setup.typecheck ?? {
              command: "npx tsc --noEmit",
              ok: false,
              exitCode: 2,
              stdout: "",
              stderr: "",
              durationMs: 0,
              errorCount: 1,
              warningCount: 0,
              timedOut: false,
              truncated: false,
            },
          )
        );
      },
    },
  );

  return { setup, fixed: result.fixed };
}

/** Deterministic TS fixes before AI repair — used by greenfield and follow-up apply. */
export async function runQuickRepairAndReverify(
  api: BryantLabsApi,
  folderPath: string,
  verification: VerificationResult,
  host: QuickRepairLogHost,
): Promise<{ verification: VerificationResult; fixed: boolean }> {
  let current = verification;
  let anyFixed = false;

  for (let outer = 0; outer < 8; outer++) {
    if (current.typecheck.ok) break;
    const details = buildTypeScriptCheckDetailsFromCommand(current.typecheck);
    if (!setupHasQuickRepairableErrors(details.diagnostics)) break;

    const pass = await applyQuickRepairPassesFromDetails(
      api,
      folderPath,
      details,
      host,
      {
        logStage: "apply_plan",
        refreshDetails: async () => {
          const res = await api.verify();
          if ("error" in res) {
            return buildTypeScriptCheckDetailsFromCommand(current.typecheck);
          }
          current = res;
          return buildTypeScriptCheckDetailsFromCommand(res.typecheck);
        },
      },
    );

    if (!pass.fixed) break;
    anyFixed = true;

    const res = await api.verify();
    if ("error" in res) break;
    current = res;
  }

  return { verification: current, fixed: anyFixed };
}
