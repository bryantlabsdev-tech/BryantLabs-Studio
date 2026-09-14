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
}

export interface UndoBatchResult {
  readonly ok: boolean;
  readonly path?: string;
  readonly content?: string;
  readonly reason?: string;
}

export function isAbsentPathResult(result: EditIoResult): boolean {
  if (result.ok) return false;
  const reason = result.reason ?? "";
  return /ENOENT|no such file|does not exist/i.test(reason);
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

export async function applyUndoBatch(
  root: string | null,
  batch: readonly LastEditRecord[] | null,
  io: UndoBatchIo,
): Promise<UndoBatchResult> {
  if (!batch || batch.length === 0) {
    return { ok: false, reason: "Nothing to undo." };
  }

  let lastRestoredPath: string | undefined;
  let lastRestoredContent: string | undefined;
  let lastTouchedPath: string | undefined;

  for (const record of [...batch].reverse()) {
    lastTouchedPath = record.path;
    if (record.created) {
      const del = await io.deleteProjectFile(root, record.path);
      if (!del.ok && !isAbsentPathResult(del)) {
        return { ok: false, reason: del.reason };
      }
      io.notifyIndexFileChange(record.path, true);
      continue;
    }
    const written = await io.writeVerified(root, record.path, record.previousContent);
    if (!written.ok) {
      return { ok: false, reason: written.reason };
    }
    io.notifyIndexFileChange(record.path, false);
    lastRestoredPath = record.path;
    lastRestoredContent = written.content;
  }

  return {
    ok: true,
    path: lastRestoredPath ?? lastTouchedPath,
    content: lastRestoredContent ?? "",
  };
}

export function createLastEditStore() {
  let batch: LastEditRecord[] | null = null;

  return {
    peek(): LastEditRecord[] | null {
      return batch;
    },
    recordSingle(record: LastEditRecord): void {
      batch = [record];
    },
    replace(records: readonly LastEditRecord[]): void {
      batch = records.length > 0 ? [...records] : null;
    },
    clear(): void {
      batch = null;
    },
    async undo(root: string | null, io: UndoBatchIo): Promise<UndoBatchResult> {
      const result = await applyUndoBatch(root, batch, io);
      if (result.ok) batch = null;
      return result;
    },
  };
}
