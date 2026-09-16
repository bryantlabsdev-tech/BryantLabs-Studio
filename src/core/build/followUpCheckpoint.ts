import { consumeForcedUndoPathFailure } from "@/core/agent/runRecoveryTestSeams";
import type { BryantLabsApi } from "@/types";
import {
  isAbsentPathReason,
  runUndoTransaction,
  type UndoPathSnapshot,
} from "@/core/build/undoTransaction";

export interface FollowUpCheckpointFile {
  readonly relPath: string;
  readonly absPath: string;
  readonly content: string;
  /** Absent on older checkpoints — treat as modify, never infer from empty content. */
  readonly action?: "create" | "modify";
}

export interface FollowUpUndoAttemptBasis {
  readonly relPath: string;
  readonly absPath: string;
  readonly existed: boolean;
  readonly content: string;
}

export interface FollowUpCheckpoint {
  readonly id: string;
  readonly projectPath: string;
  readonly createdAt: number;
  readonly prompt: string;
  /** Apply Plan run that produced this undo batch, when known. */
  readonly applyRunId?: string;
  readonly files: readonly FollowUpCheckpointFile[];
  /** Pre-undo snapshot from the last failed attempt; used to refuse divergent retries. */
  readonly undoAttemptBasis?: readonly FollowUpUndoAttemptBasis[];
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
  readonly compensationOk: boolean;
  readonly compensationAttempted: boolean;
  readonly dirtyPaths: readonly string[];
  readonly attemptBasis?: readonly FollowUpUndoAttemptBasis[];
}

export function shouldCommitFollowUpUndo(
  result: RestoreFollowUpCheckpointResult,
): boolean {
  return result.ok;
}

function normalizeLexicalPath(filePath: string): string {
  const raw = filePath.replace(/\\/g, "/");
  const absolute = raw.startsWith("/");
  const parts = raw.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  const joined = out.join("/");
  return absolute ? `/${joined}` : joined;
}

function isLexicallyInsideProject(root: string, target: string): boolean {
  if (!root) return true;
  const resolvedRoot = normalizeLexicalPath(root);
  const resolved = normalizeLexicalPath(target);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}/`);
}

function toFollowUpBasis(
  snapshots: readonly UndoPathSnapshot[] | undefined,
): FollowUpUndoAttemptBasis[] | undefined {
  if (!snapshots) return undefined;
  return snapshots.map((item) => ({
    relPath: item.label,
    absPath: item.path,
    existed: item.existed,
    content: item.content,
  }));
}

export async function restoreFollowUpCheckpoint(
  api: BryantLabsApi,
  checkpoint: FollowUpCheckpoint,
): Promise<RestoreFollowUpCheckpointResult> {
  const restored: string[] = [];
  const failed: RestoreFollowUpFailure[] = [];
  const forcedFail = consumeForcedUndoPathFailure();

  const result = await runUndoTransaction(
    checkpoint.files.map((file) => ({
      path: file.absPath,
      created: file.action === "create",
      previousContent: file.action === "create" ? "" : file.content,
      label: file.relPath,
    })),
    {
      normalizePath: (filePath) => normalizeLexicalPath(filePath),
      validate: async (filePath, _intent) => {
        if (!isLexicallyInsideProject(checkpoint.projectPath, filePath)) {
          return { ok: false, reason: "Path is outside the project root." };
        }
        return { ok: true };
      },
      snapshot: async (filePath) => {
        const current = await api.readFile(filePath);
        if (current.readable) {
          return {
            ok: true,
            existed: true,
            content: "content" in current ? current.content : "",
          };
        }
        const reason = current.reason ?? "";
        if (/permission|EACCES|binary|too large/i.test(reason)) {
          return { ok: false, reason: reason || "Snapshot failed" };
        }
        return { ok: true, existed: false, content: "" };
      },
      write: async (filePath, content) => {
        const current = await api.readFile(filePath);
        if (!current.readable) {
          return api.createProjectFile(filePath, content);
        }
        const before = "content" in current ? current.content : "";
        return api.applyEdit(filePath, before, content, false);
      },
      delete: async (filePath) => {
        const del = await api.deleteProjectFile(filePath);
        if (!del.ok && isAbsentPathReason(del.reason)) {
          return { ok: true };
        }
        return del;
      },
      shouldFail: (op) => Boolean(forcedFail && op.label === forcedFail),
    },
    {
      reverse: false,
      ...(checkpoint.undoAttemptBasis
        ? {
            attemptBasis: checkpoint.undoAttemptBasis.map((item) => ({
              key: normalizeLexicalPath(item.absPath),
              path: item.absPath,
              label: item.relPath,
              existed: item.existed,
              content: item.content,
            })),
          }
        : {}),
    },
  );

  const attemptBasis = toFollowUpBasis(result.attemptBasis);

  if (result.ok) {
    return {
      ok: true,
      restored: checkpoint.files.map((file) => file.relPath),
      failed,
      compensationOk: true,
      compensationAttempted: false,
      dirtyPaths: [],
    };
  }

  if (result.failedLabel) {
    failed.push({
      relPath: result.failedLabel,
      error: result.reason ?? "Undo failed",
    });
  }

  return {
    ok: false,
    restored,
    failed,
    compensationOk: result.compensationOk,
    compensationAttempted: result.compensationAttempted,
    dirtyPaths: result.dirtyLabels,
    ...(result.reason ? { error: result.reason } : {}),
    ...(attemptBasis ? { attemptBasis } : {}),
  };
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
