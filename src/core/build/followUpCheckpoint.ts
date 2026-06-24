import type { BryantLabsApi } from "@/types";

export interface FollowUpCheckpointFile {
  readonly relPath: string;
  readonly absPath: string;
  readonly content: string;
}

export interface FollowUpCheckpoint {
  readonly id: string;
  readonly projectPath: string;
  readonly createdAt: number;
  readonly prompt: string;
  readonly files: readonly FollowUpCheckpointFile[];
}

export function createFollowUpCheckpoint(input: {
  projectPath: string;
  prompt: string;
  files: readonly FollowUpCheckpointFile[];
}): FollowUpCheckpoint {
  return {
    id: `follow-up-chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: input.projectPath,
    createdAt: Date.now(),
    prompt: input.prompt,
    files: input.files,
  };
}

export async function restoreFollowUpCheckpoint(
  api: BryantLabsApi,
  checkpoint: FollowUpCheckpoint,
): Promise<{ ok: boolean; error?: string }> {
  for (const file of checkpoint.files) {
    try {
      const current = await api.readFile(file.absPath);
      if ("error" in current && current.error) {
        return { ok: false, error: `${file.relPath}: ${current.error}` };
      }
      const before = "content" in current ? current.content : "";
      const res = await api.applyEdit(file.absPath, before, file.content);
      if (!res.ok) {
        return { ok: false, error: `${file.relPath}: ${res.reason ?? "Restore failed"}` };
      }
    } catch {
      return { ok: false, error: `${file.relPath}: Restore failed` };
    }
  }
  return { ok: true };
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
        const res = await api.applyEdit(entry.absPath, before, entry.basisContent);
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
