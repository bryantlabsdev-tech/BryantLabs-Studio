import type { BryantLabsApi } from "@/types";
import type { PhaseTransactionResult } from "@/core/editPhases/types";
import { EDIT_PHASE_TIMING_MS } from "@/core/editPhases/types";

export interface StagedPhaseFile {
  readonly relPath: string;
  readonly absPath: string;
  /** Empty string means create new file. */
  readonly beforeContent: string;
  readonly afterContent: string;
  readonly action: "create" | "modify";
}

export function simpleContentHash(content: string): string {
  // FNV-1a 32-bit — deterministic, no crypto dependency in renderer tests.
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashesForStaged(
  files: readonly StagedPhaseFile[],
  which: "before" | "after",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of files) {
    out[file.relPath] = simpleContentHash(
      which === "before" ? file.beforeContent : file.afterContent,
    );
  }
  return out;
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Apply a fully validated phase atomically.
 * Stages conceptually (all content prepared), writes, verifies hashes;
 * on any failure restores exact pre-phase content.
 */
export async function applyPhaseTransactionally(
  api: BryantLabsApi,
  staged: readonly StagedPhaseFile[],
  opts?: { timeoutMs?: number },
): Promise<PhaseTransactionResult> {
  const timeoutMs = opts?.timeoutMs ?? EDIT_PHASE_TIMING_MS.parseAndApply;
  const beforeHashes = hashesForStaged(staged, "before");
  const expectedAfter = hashesForStaged(staged, "after");
  const applied: string[] = [];

  const run = async (): Promise<PhaseTransactionResult> => {
    if (staged.length === 0) {
      return {
        ok: true,
        applied: [],
        beforeHashes,
        afterHashes: {},
        rolledBack: false,
        rollbackOk: true,
        error: null,
        claimedSuccess: true,
      };
    }

    try {
      for (const file of staged) {
        let res;
        if (file.action === "create") {
          res = await api.createProjectFile(file.absPath, file.afterContent);
        } else {
          res = await api.applyEdit(file.absPath, file.beforeContent, file.afterContent);
        }
        if (!res.ok) {
          throw new Error(`${file.relPath}: ${res.reason ?? "Write failed"}`);
        }
        applied.push(file.relPath);
      }

      // Confirm on-disk content matches staged after hashes.
      const afterHashes: Record<string, string> = {};
      for (const file of staged) {
        const read = await api.readFile(file.absPath);
        if ("error" in read && read.error) {
          throw new Error(`${file.relPath}: post-write read failed`);
        }
        const content = "content" in read && typeof read.content === "string" ? read.content : "";
        const hash = simpleContentHash(content);
        afterHashes[file.relPath] = hash;
        if (hash !== expectedAfter[file.relPath]) {
          throw new Error(`${file.relPath}: post-write hash mismatch`);
        }
      }

      return {
        ok: true,
        applied,
        beforeHashes,
        afterHashes,
        rolledBack: false,
        rollbackOk: true,
        error: null,
        claimedSuccess: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Phase apply failed";
      const rollback = await rollbackStagedPhase(api, staged, applied);
      return {
        ok: false,
        applied,
        beforeHashes,
        afterHashes: {},
        rolledBack: rollback.rolledBack.length > 0 || applied.length === 0,
        rollbackOk: rollback.ok,
        error: rollback.ok
          ? message
          : `${message}; rollback failed: ${rollback.error ?? "unknown"}`,
        claimedSuccess: false,
      };
    }
  };

  try {
    return await withDeadline(run(), timeoutMs, "Patch parsing/application");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Phase apply timed out";
    const rollback = await rollbackStagedPhase(api, staged, applied);
    return {
      ok: false,
      applied,
      beforeHashes,
      afterHashes: {},
      rolledBack: true,
      rollbackOk: rollback.ok,
      error: message,
      claimedSuccess: false,
    };
  }
}

export async function rollbackStagedPhase(
  api: BryantLabsApi,
  staged: readonly StagedPhaseFile[],
  appliedPaths: readonly string[],
): Promise<{ ok: boolean; rolledBack: readonly string[]; error: string | null }> {
  const rolledBack: string[] = [];
  for (const relPath of [...appliedPaths].reverse()) {
    const file = staged.find((s) => s.relPath === relPath);
    if (!file) continue;
    try {
      if (file.action === "create") {
        const del = await api.deleteProjectFile(file.absPath);
        if (!del.ok) {
          return {
            ok: false,
            rolledBack,
            error: `${relPath}: ${del.reason ?? "Delete failed"}`,
          };
        }
      } else {
        const current = await api.readFile(file.absPath);
        if ("error" in current && current.error) {
          return { ok: false, rolledBack, error: `${relPath}: ${current.error}` };
        }
        const before =
          "content" in current && typeof current.content === "string" ? current.content : "";
        const res = await api.applyEdit(file.absPath, before, file.beforeContent);
        if (!res.ok) {
          return {
            ok: false,
            rolledBack,
            error: `${relPath}: ${res.reason ?? "Restore failed"}`,
          };
        }
      }
      rolledBack.push(relPath);
    } catch {
      return { ok: false, rolledBack, error: `${relPath}: Rollback failed` };
    }
  }
  return { ok: true, rolledBack, error: null };
}
