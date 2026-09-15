import { consumeForcedUndoPathFailure } from "@/core/agent/runRecoveryTestSeams";
import type { BryantLabsApi } from "@/types";

export interface FollowUpCheckpointFile {
  readonly relPath: string;
  readonly absPath: string;
  readonly content: string;
  /** Absent on older checkpoints — treat as modify, never infer from empty content. */
  readonly action?: "create" | "modify";
}

export interface FollowUpCheckpoint {
  readonly id: string;
  readonly projectPath: string;
  readonly createdAt: number;
  readonly prompt: string;
  /** Apply Plan run that produced this undo batch, when known. */
  readonly applyRunId?: string;
  readonly files: readonly FollowUpCheckpointFile[];
}

export function createFollowUpCheckpoint(input: {
  projectPath: string;
  prompt: string;
  files: readonly FollowUpCheckpointFile[];
  applyRunId?: string;
}): FollowUpCheckpoint {
  return {
    id: `follow-up-chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: input.projectPath,
    createdAt: Date.now(),
    prompt: input.prompt,
    ...(input.applyRunId ? { applyRunId: input.applyRunId } : {}),
    files: input.files,
  };
}

export function buildUndoBatchFromApprovedFiles(
  files: readonly {
    readonly relPath: string;
    readonly absPath: string;
    readonly action?: "create" | "modify";
    readonly basisContent?: string;
  }[],
  appliedRelPaths: readonly string[],
): readonly {
  readonly path: string;
  readonly previousContent: string;
  readonly created: boolean;
}[] {
  const applied = new Set(appliedRelPaths);
  const batch: {
    path: string;
    previousContent: string;
    created: boolean;
  }[] = [];
  for (const file of files) {
    if (!applied.has(file.relPath)) continue;
    const created = file.action === "create";
    batch.push({
      path: file.absPath,
      previousContent: created ? "" : (file.basisContent ?? ""),
      created,
    });
  }
  return batch;
}

export interface RestoreFollowUpFailure {
  readonly relPath: string;
  readonly error: string;
}

export interface RestoreFollowUpCheckpointResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly restored: readonly string[];
  readonly failed: readonly RestoreFollowUpFailure[];
}

export async function restoreFollowUpCheckpoint(
  api: BryantLabsApi,
  checkpoint: FollowUpCheckpoint,
): Promise<RestoreFollowUpCheckpointResult> {
  const restored: string[] = [];
  const failed: RestoreFollowUpFailure[] = [];
  const forcedFail = consumeForcedUndoPathFailure();

  for (const file of checkpoint.files) {
    if (forcedFail && file.relPath === forcedFail) {
      failed.push({
        relPath: file.relPath,
        error: "Forced undo restore failure",
      });
      continue;
    }
    try {
      if (file.action === "create") {
        const del = await api.deleteProjectFile(file.absPath);
        if (!del.ok) {
          failed.push({
            relPath: file.relPath,
            error: del.reason ?? "Delete failed",
          });
          continue;
        }
        restored.push(file.relPath);
        continue;
      }
      const current = await api.readFile(file.absPath);
      if (!current.readable) {
        failed.push({
          relPath: file.relPath,
          error: current.reason ?? "Read failed",
        });
        continue;
      }
      const before = "content" in current ? current.content : "";
      const res = await api.applyEdit(file.absPath, before, file.content, false);
      if (!res.ok) {
        failed.push({
          relPath: file.relPath,
          error: res.reason ?? "Restore failed",
        });
        continue;
      }
      restored.push(file.relPath);
    } catch {
      failed.push({ relPath: file.relPath, error: "Restore failed" });
    }
  }

  if (failed.length > 0) {
    const error = failed.map((item) => `${item.relPath}: ${item.error}`).join("; ");
    return { ok: false, error, restored, failed };
  }
  return { ok: true, restored, failed };
}

export interface PartialApplyRollbackEntry {
  readonly relPath: string;
  readonly absPath: string;
  readonly action: "create" | "modify";
  readonly basisContent: string;
}

/**
 * Roll back files written during a failed multi-file apply.
 * Restores modified files to pre-apply content and deletes newly created files.
 */
export async function rollbackPartialApply(
  api: BryantLabsApi,
  appliedPaths: readonly string[],
  entries: readonly PartialApplyRollbackEntry[],
): Promise<{ ok: boolean; error?: string; rolledBack: readonly string[] }> {
  const rolledBack: string[] = [];
  for (const relPath of appliedPaths) {
    const entry = entries.find((e) => e.relPath === relPath);
    if (!entry) continue;
    try {
      if (entry.action === "create") {
        const del = await api.deleteProjectFile(entry.absPath);
        if (!del.ok) {
          return {
            ok: false,
            error: `${relPath}: ${del.reason ?? "Delete failed during rollback"}`,
            rolledBack,
          };
        }
      } else {
        const current = await api.readFile(entry.absPath);
        if ("error" in current && current.error) {
          return { ok: false, error: `${relPath}: ${current.error}`, rolledBack };
        }
        const before = "content" in current ? current.content : "";
        const res = await api.applyEdit(entry.absPath, before, entry.basisContent, false);
        if (!res.ok) {
          return {
            ok: false,
            error: `${relPath}: ${res.reason ?? "Restore failed during rollback"}`,
            rolledBack,
          };
        }
      }
      rolledBack.push(relPath);
    } catch {
      return { ok: false, error: `${relPath}: Rollback failed`, rolledBack };
    }
  }
  return { ok: true, rolledBack };
}
