export type UndoMutationIntent = "write" | "delete";

export interface UndoOperation {
  readonly path: string;
  readonly created: boolean;
  readonly previousContent: string;
  readonly label: string;
}

export interface UndoPathSnapshot {
  readonly key: string;
  readonly path: string;
  readonly label: string;
  readonly existed: boolean;
  readonly content: string;
}

export interface UndoTransactionIo {
  normalizePath(filePath: string): string;
  validate(
    filePath: string,
    intent: UndoMutationIntent,
  ): Promise<{ ok: boolean; reason?: string }>;
  snapshot(
    filePath: string,
  ): Promise<
    | { ok: true; existed: boolean; content: string }
    | { ok: false; reason: string }
  >;
  write(
    filePath: string,
    content: string,
  ): Promise<{ ok: boolean; content?: string; reason?: string }>;
  delete(filePath: string): Promise<{ ok: boolean; reason?: string }>;
  notify?(filePath: string, deleted: boolean): void;
  shouldFail?(op: UndoOperation): boolean;
}

export interface AppliedUndoMutation {
  readonly op: UndoOperation;
  readonly snapshot: UndoPathSnapshot;
  readonly mutation: "deleted" | "written";
}

export interface UndoTransactionResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly failedPath?: string;
  readonly failedLabel?: string;
  readonly compensationOk: boolean;
  readonly compensationAttempted: boolean;
  readonly compensationErrors: readonly string[];
  readonly dirtyPaths: readonly string[];
  readonly dirtyLabels: readonly string[];
  readonly lastRestoredPath?: string;
  readonly lastRestoredContent?: string;
  readonly attemptBasis?: readonly UndoPathSnapshot[];
}

export function isAbsentPathReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return /ENOENT|no such file|does not exist/i.test(reason);
}

export function snapshotsMatch(
  basis: readonly UndoPathSnapshot[],
  current: readonly UndoPathSnapshot[],
): { ok: true } | { ok: false; label: string } {
  if (basis.length !== current.length) {
    return { ok: false, label: current[0]?.label ?? basis[0]?.label ?? "files" };
  }
  const currentByKey = new Map(current.map((item) => [item.key, item]));
  for (const prior of basis) {
    const now = currentByKey.get(prior.key);
    if (!now) return { ok: false, label: prior.label };
    if (now.existed !== prior.existed || now.content !== prior.content) {
      return { ok: false, label: now.label };
    }
  }
  return { ok: true };
}

export function formatUndoFailureReason(input: {
  readonly reason: string;
  readonly failedLabel?: string;
  readonly wrapPath?: boolean;
  readonly compensationAttempted?: boolean;
  readonly compensationOk?: boolean;
  readonly compensationErrors?: readonly string[];
  readonly dirtyLabels?: readonly string[];
}): string {
  const raw = input.reason || "Undo failed.";
  const origin =
    input.wrapPath && input.failedLabel
      ? `Undo failed at ${input.failedLabel}: ${raw}`
      : raw;
  if (!input.compensationAttempted) return origin;
  if (input.compensationOk) {
    return `${origin} Compensation succeeded; the project was restored to its pre-undo state.`;
  }
  const compensation = input.compensationErrors?.length
    ? input.compensationErrors.join("; ")
    : "Compensation failed.";
  const dirty =
    input.dirtyLabels && input.dirtyLabels.length > 0
      ? ` Remaining dirty paths: ${input.dirtyLabels.join(", ")}.`
      : "";
  return `${origin} Compensation failed: ${compensation}.${dirty}`;
}

function failResult(partial: {
  readonly reason: string;
  readonly failedPath?: string;
  readonly failedLabel?: string;
  readonly wrapPath?: boolean;
  readonly compensationOk?: boolean;
  readonly compensationAttempted?: boolean;
  readonly compensationErrors?: readonly string[];
  readonly dirtyPaths?: readonly string[];
  readonly dirtyLabels?: readonly string[];
  readonly attemptBasis?: readonly UndoPathSnapshot[];
}): UndoTransactionResult {
  const compensationAttempted = partial.compensationAttempted ?? false;
  const compensationOk = partial.compensationOk ?? true;
  const compensationErrors = partial.compensationErrors ?? [];
  const dirtyPaths = partial.dirtyPaths ?? [];
  const dirtyLabels = partial.dirtyLabels ?? [];
  return {
    ok: false,
    compensationOk,
    compensationAttempted,
    compensationErrors,
    dirtyPaths,
    dirtyLabels,
    reason: formatUndoFailureReason({
      reason: partial.reason,
      compensationAttempted,
      compensationOk,
      compensationErrors,
      dirtyLabels,
      ...(partial.failedLabel ? { failedLabel: partial.failedLabel } : {}),
      ...(partial.wrapPath ? { wrapPath: true } : {}),
    }),
    ...(partial.failedPath ? { failedPath: partial.failedPath } : {}),
    ...(partial.failedLabel ? { failedLabel: partial.failedLabel } : {}),
    ...(partial.attemptBasis ? { attemptBasis: partial.attemptBasis } : {}),
  };
}

export async function compensateAppliedUndoMutations(
  applied: readonly AppliedUndoMutation[],
  io: UndoTransactionIo,
): Promise<{
  ok: boolean;
  errors: string[];
  dirtyPaths: string[];
  dirtyLabels: string[];
}> {
  const errors: string[] = [];
  const dirtyPaths: string[] = [];
  const dirtyLabels: string[] = [];
  for (const item of [...applied].reverse()) {
    const { snapshot, op } = item;
    if (snapshot.existed) {
      const written = await io.write(op.path, snapshot.content);
      if (!written.ok) {
        errors.push(`${op.label}: ${written.reason ?? "Could not restore snapshot bytes."}`);
        dirtyPaths.push(op.path);
        dirtyLabels.push(op.label);
        continue;
      }
      io.notify?.(op.path, false);
      continue;
    }
    const del = await io.delete(op.path);
    if (!del.ok && !isAbsentPathReason(del.reason)) {
      errors.push(`${op.label}: ${del.reason ?? "Could not remove undo-created file."}`);
      dirtyPaths.push(op.path);
      dirtyLabels.push(op.label);
      continue;
    }
    io.notify?.(op.path, true);
  }
  return { ok: errors.length === 0, errors, dirtyPaths, dirtyLabels };
}

export async function runUndoTransaction(
  operations: readonly UndoOperation[],
  io: UndoTransactionIo,
  opts?: {
    reverse?: boolean;
    attemptBasis?: readonly UndoPathSnapshot[] | null;
  },
): Promise<UndoTransactionResult> {
  if (operations.length === 0) {
    return failResult({ reason: "Nothing to undo." });
  }

  const seen = new Map<string, string>();
  for (const op of operations) {
    const key = io.normalizePath(op.path);
    const prior = seen.get(key);
    if (prior) {
      return failResult({
        reason: `Duplicate undo path: ${op.label}.`,
        failedPath: op.path,
        failedLabel: op.label,
      });
    }
    seen.set(key, op.label);
  }

  for (const op of operations) {
    const intent: UndoMutationIntent = op.created ? "delete" : "write";
    const check = await io.validate(op.path, intent);
    if (!check.ok) {
      return failResult({
        reason: check.reason ?? "Path validation failed.",
        failedPath: op.path,
        failedLabel: op.label,
      });
    }
  }

  const attemptBasis: UndoPathSnapshot[] = [];
  for (const op of operations) {
    const snap = await io.snapshot(op.path);
    if (!snap.ok) {
      return failResult({
        reason: snap.reason,
        failedPath: op.path,
        failedLabel: op.label,
      });
    }
    attemptBasis.push({
      key: io.normalizePath(op.path),
      path: op.path,
      label: op.label,
      existed: snap.existed,
      content: snap.content,
    });
  }

  const prior = opts?.attemptBasis;
  if (prior && prior.length > 0) {
    const compared = snapshotsMatch(prior, attemptBasis);
    if (!compared.ok) {
      return failResult({
        reason: `The project changed since the last undo attempt (${compared.label}).`,
        failedPath: compared.label,
        failedLabel: compared.label,
        wrapPath: true,
        attemptBasis: prior,
      });
    }
  }

  const ordered = opts?.reverse ? [...operations].reverse() : [...operations];
  const snapshotByPath = new Map(attemptBasis.map((item) => [item.path, item]));
  const applied: AppliedUndoMutation[] = [];
  let lastRestoredPath: string | undefined;
  let lastRestoredContent: string | undefined;
  let lastTouchedPath: string | undefined;

  const failAfterMutation = async (
    op: UndoOperation,
    reason: string,
  ): Promise<UndoTransactionResult> => {
    const compensation = await compensateAppliedUndoMutations(applied, io);
    return failResult({
      reason,
      failedPath: op.path,
      failedLabel: op.label,
      wrapPath: true,
      compensationAttempted: applied.length > 0,
      compensationOk: compensation.ok,
      compensationErrors: compensation.errors,
      dirtyPaths: compensation.dirtyPaths,
      dirtyLabels: compensation.dirtyLabels,
      attemptBasis,
    });
  };

  for (const op of ordered) {
    lastTouchedPath = op.path;
    const snapshot = snapshotByPath.get(op.path);
    if (!snapshot) {
      return failResult({
        reason: "Missing pre-undo snapshot.",
        failedPath: op.path,
        failedLabel: op.label,
        attemptBasis,
      });
    }
    if (io.shouldFail?.(op)) {
      return failAfterMutation(op, "Forced undo restore failure");
    }
    if (op.created) {
      const del = await io.delete(op.path);
      if (!del.ok && !isAbsentPathReason(del.reason)) {
        return failAfterMutation(op, del.reason ?? "Delete failed");
      }
      if (snapshot.existed) {
        applied.push({ op, snapshot, mutation: "deleted" });
      }
      io.notify?.(op.path, true);
      continue;
    }
    const written = await io.write(op.path, op.previousContent);
    if (!written.ok) {
      return failAfterMutation(op, written.reason ?? "Restore failed");
    }
    applied.push({ op, snapshot, mutation: "written" });
    io.notify?.(op.path, false);
    lastRestoredPath = op.path;
    lastRestoredContent = written.content;
  }

  const restoredPath = lastRestoredPath ?? lastTouchedPath;
  return {
    ok: true,
    compensationOk: true,
    compensationAttempted: false,
    compensationErrors: [],
    dirtyPaths: [],
    dirtyLabels: [],
    lastRestoredContent: lastRestoredContent ?? "",
    attemptBasis,
    ...(restoredPath ? { lastRestoredPath: restoredPath } : {}),
  };
}
