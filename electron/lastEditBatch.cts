import * as path from "node:path";
import { promises as fs } from "node:fs";
import {
  deleteProjectFile,
  validateWritePath,
  writeVerified,
  type PathMutationIntent,
} from "./fileWriter.cjs";
import {
  isAbsentPathReason,
  runUndoTransaction,
  type UndoPathSnapshot,
  type UndoTransactionIo,
} from "./undoTransaction.cjs";

export interface LastEditRecord {
  readonly path: string;
  readonly previousContent: string;
  readonly created: boolean;
}

export interface EditIoResult {
  readonly ok: boolean;
  readonly content?: string;
  readonly reason?: string;
}

export interface UndoBatchIo {
  writeVerified(
    root: string | null,
    filePath: string,
    content: string,
  ): Promise<EditIoResult>;
  deleteProjectFile(root: string | null, filePath: string): Promise<EditIoResult>;
  notifyIndexFileChange(filePath: string, deleted?: boolean): void;
  validateTarget?(
    root: string | null,
    filePath: string,
    intent: PathMutationIntent,
  ): Promise<EditIoResult>;
  readSnapshot?(
    root: string | null,
    filePath: string,
  ): Promise<{ ok: true; existed: boolean; content: string } | { ok: false; reason: string }>;
  shouldFail?(filePath: string): boolean;
}

export interface UndoBatchResult {
  readonly ok: boolean;
  readonly path?: string;
  readonly content?: string;
  readonly reason?: string;
  readonly failedPath?: string;
  readonly compensationOk?: boolean;
  readonly compensationAttempted?: boolean;
  readonly dirtyPaths?: readonly string[];
  readonly attemptBasis?: readonly UndoPathSnapshot[];
}

export function isAbsentPathResult(result: EditIoResult): boolean {
  if (result.ok) return false;
  return isAbsentPathReason(result.reason);
}

export function publicUndoPath(root: string | null, filePath: string): string {
  if (root) {
    const rel = path.relative(path.resolve(root), path.resolve(filePath));
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return rel.split(path.sep).join("/");
    }
  }
  return path.basename(filePath);
}

async function defaultReadSnapshot(
  root: string | null,
  filePath: string,
): Promise<{ ok: true; existed: boolean; content: string } | { ok: false; reason: string }> {
  const writeCheck = validateWritePath(root, filePath, "write");
  const deleteCheck = validateWritePath(root, filePath, "delete");
  if (!writeCheck.ok && !deleteCheck.ok) {
    return { ok: false, reason: writeCheck.reason ?? deleteCheck.reason ?? "Invalid path." };
  }
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { ok: true, existed: true, content };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : null;
    if (code === "ENOENT") {
      return { ok: true, existed: false, content: "" };
    }
    const message = err instanceof Error ? err.message : "Could not snapshot file.";
    return { ok: false, reason: message };
  }
}

export function createFsUndoIo(
  notifyIndexFileChange: (filePath: string, deleted?: boolean) => void,
  overrides?: Partial<UndoBatchIo>,
): UndoBatchIo {
  return {
    writeVerified: overrides?.writeVerified ?? writeVerified,
    deleteProjectFile: overrides?.deleteProjectFile ?? deleteProjectFile,
    notifyIndexFileChange,
    validateTarget:
      overrides?.validateTarget ??
      (async (root, filePath, intent) => validateWritePath(root, filePath, intent)),
    readSnapshot: overrides?.readSnapshot ?? defaultReadSnapshot,
    shouldFail: overrides?.shouldFail,
  };
}

export function parseUndoBatchEntries(
  input: unknown,
): { ok: true; entries: LastEditRecord[] } | { ok: false; reason: string } {
  if (!Array.isArray(input)) {
    return { ok: false, reason: "Invalid undo batch." };
  }
  const entries: LastEditRecord[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      return { ok: false, reason: "Invalid undo batch entry." };
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.path !== "string" || rec.path.length === 0) {
      return { ok: false, reason: "Invalid undo batch path." };
    }
    if (typeof rec.previousContent !== "string") {
      return { ok: false, reason: "Invalid undo batch previous content." };
    }
    if (typeof rec.created !== "boolean") {
      return { ok: false, reason: "Invalid undo batch created flag." };
    }
    entries.push({
      path: rec.path,
      previousContent: rec.previousContent,
      created: rec.created,
    });
  }
  return { ok: true, entries };
}

function toBatchIoAdapter(
  root: string | null,
  io: UndoBatchIo,
): UndoTransactionIo {
  return {
    normalizePath: (filePath) => path.resolve(filePath),
    validate: async (filePath, intent) => {
      if (io.validateTarget) return io.validateTarget(root, filePath, intent);
      return validateWritePath(root, filePath, intent);
    },
    snapshot: async (filePath) => {
      if (io.readSnapshot) return io.readSnapshot(root, filePath);
      return defaultReadSnapshot(root, filePath);
    },
    write: (filePath, content) => io.writeVerified(root, filePath, content),
    delete: (filePath) => io.deleteProjectFile(root, filePath),
    notify: (filePath, deleted) => io.notifyIndexFileChange(filePath, deleted),
    shouldFail: io.shouldFail ? (op) => io.shouldFail!(op.path) : undefined,
  };
}

export async function applyUndoBatch(
  root: string | null,
  batch: readonly LastEditRecord[] | null,
  io: UndoBatchIo,
  opts?: { attemptBasis?: readonly UndoPathSnapshot[] | null },
): Promise<UndoBatchResult> {
  if (!batch || batch.length === 0) {
    return { ok: false, reason: "Nothing to undo." };
  }

  const result = await runUndoTransaction(
    batch.map((record) => ({
      path: record.path,
      created: record.created,
      previousContent: record.previousContent,
      label: publicUndoPath(root, record.path),
    })),
    toBatchIoAdapter(root, io),
    { reverse: true, attemptBasis: opts?.attemptBasis },
  );

  if (result.ok) {
    return {
      ok: true,
      path: result.lastRestoredPath,
      content: result.lastRestoredContent ?? "",
      compensationOk: true,
    };
  }

  return {
    ok: false,
    path: result.failedPath,
    reason: result.reason,
    failedPath: result.failedPath,
    compensationOk: result.compensationOk,
    compensationAttempted: result.compensationAttempted,
    dirtyPaths: result.dirtyPaths,
    attemptBasis: result.attemptBasis,
  };
}

export function createLastEditStore() {
  let batch: LastEditRecord[] | null = null;
  let attemptBasis: UndoPathSnapshot[] | null = null;

  return {
    peek(): LastEditRecord[] | null {
      return batch;
    },
    peekAttemptBasis(): UndoPathSnapshot[] | null {
      return attemptBasis;
    },
    recordSingle(record: LastEditRecord): void {
      batch = [record];
      attemptBasis = null;
    },
    replace(records: readonly LastEditRecord[]): void {
      batch = records.length > 0 ? [...records] : null;
      attemptBasis = null;
    },
    clear(): void {
      batch = null;
      attemptBasis = null;
    },
    async undo(root: string | null, io: UndoBatchIo): Promise<UndoBatchResult> {
      const result = await applyUndoBatch(root, batch, io, { attemptBasis });
      if (result.ok) {
        batch = null;
        attemptBasis = null;
      } else if (result.attemptBasis) {
        attemptBasis = [...result.attemptBasis];
      }
      return result;
    },
  };
}
