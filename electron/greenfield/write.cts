import * as path from "node:path";
import { promises as fs } from "node:fs";
import {
  writeVerified,
  validateWritePath,
  deleteProjectFile,
  type WriteResult,
} from "../fileWriter.cjs";
import { safeMkdir, validateProjectRootForMetadata } from "../safeFs.cjs";
import type { FileWriteMode } from "../providers/settings.cjs";
import type { GeneratedFile } from "./generate.cjs";
import { GREENFIELD_PATHS } from "./generate.cjs";
import {
  isAllowedGreenfieldWritePath,
} from "./paths.cjs";
import { validateGreenfieldFiles } from "./validate.cjs";
import {
  beginProviderRequest,
  endProviderRequest,
  isProviderScopeCancelled,
  PROVIDER_USER_CANCEL_MESSAGE,
} from "../providers/providerRequestRegistry.cjs";

/**
 * Write greenfield files using the Phase 5 safe writer (Phase 10).
 * Creates parent directories; workspace mode overwrites existing files.
 * Successful writes are transactional: cancel or write failure rolls disk back.
 */

export interface WriteFileLogEntry {
  readonly path: string;
  readonly mkdir: "created" | "exists" | "failed" | "skipped";
  readonly mkdirDetail?: string;
  readonly overwrite: boolean;
  readonly ok: boolean;
  readonly reason?: string;
}

export interface GreenfieldWriteResult {
  ok: boolean;
  written: string[];
  errors: string[];
  logs: WriteFileLogEntry[];
}

export interface GreenfieldWriteIo {
  writeVerified(
    root: string | null,
    filePath: string,
    content: string,
  ): Promise<WriteResult>;
  deleteProjectFile(root: string | null, filePath: string): Promise<WriteResult>;
}

export interface GreenfieldWriteOptions {
  mode?: FileWriteMode;
  generationId?: string;
  io?: GreenfieldWriteIo;
}

interface RollbackEntry {
  readonly relPath: string;
  readonly absPath: string;
  readonly existed: boolean;
  readonly previousContent: string;
}

const LOG_TAG = "greenfield:write";
const DEFAULT_IO: GreenfieldWriteIo = {
  writeVerified,
  deleteProjectFile,
};

function logWrite(line: string): void {
  console.log(`[${LOG_TAG}] ${line}`);
}

function logWriteFailure(line: string): void {
  console.warn(`[${LOG_TAG}] ${line}`);
}

function formatLogLine(entry: WriteFileLogEntry): string {
  const parts = [
    `path=${entry.path}`,
    `mkdir=${entry.mkdir}`,
    entry.overwrite ? "overwrite=yes" : "overwrite=no",
    entry.ok ? "status=ok" : `status=failed reason=${entry.reason ?? "unknown"}`,
  ];
  if (entry.mkdirDetail) parts.splice(2, 0, `mkdirDetail=${entry.mkdirDetail}`);
  return parts.join(" ");
}

export async function isEmptyDirectory(dir: string): Promise<boolean> {
  const entries = await fs.readdir(dir);
  const visible = entries.filter((e) => e !== ".DS_Store");
  return visible.length === 0;
}

async function ensureParentDirectory(
  absPath: string,
): Promise<
  | { ok: true; mkdir: "created" | "exists" }
  | { ok: false; mkdir: "failed"; detail: string }
> {
  const parent = path.dirname(absPath);
  try {
    const stat = await fs.stat(parent);
    if (stat.isDirectory()) return { ok: true, mkdir: "exists" };
    return { ok: false, mkdir: "failed", detail: "Parent path is not a directory." };
  } catch {
    const mkdir = await safeMkdir(parent);
    if (!mkdir.ok) {
      return {
        ok: false,
        mkdir: "failed",
        detail: mkdir.reason ?? "mkdir failed",
      };
    }
    return { ok: true, mkdir: "created" };
  }
}

async function fileExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

function greenfieldWriteDelayMs(): number {
  const raw = process.env.BRYANTLABS_GREENFIELD_WRITE_DELAY_MS;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Abortable pause after a successful write so Stop can land mid-tree. */
export function waitForGreenfieldWriteDelay(
  generationId: string | undefined,
  enabled: boolean,
): Promise<"ok" | "cancelled"> {
  if (!enabled) return Promise.resolve("ok");
  const ms = greenfieldWriteDelayMs();
  if (ms <= 0) return Promise.resolve("ok");
  if (generationId && isProviderScopeCancelled(generationId)) {
    return Promise.resolve("cancelled");
  }
  return new Promise((resolve) => {
    const id = `greenfield-write-delay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      endProviderRequest(id);
      resolve("ok");
    }, ms);
    beginProviderRequest({
      id,
      kind: "http_json",
      attempt: 1,
      scope: generationId ?? null,
      abort: () => {
        clearTimeout(timer);
        endProviderRequest(id);
        resolve("cancelled");
      },
    });
  });
}

async function capturePreWriteState(
  relPath: string,
  absPath: string,
): Promise<RollbackEntry> {
  const existed = await fileExists(absPath);
  if (!existed) {
    return { relPath, absPath, existed: false, previousContent: "" };
  }
  const previousContent = await fs.readFile(absPath, "utf8");
  return { relPath, absPath, existed: true, previousContent };
}

async function remainingAffectedPaths(
  entries: readonly RollbackEntry[],
): Promise<string[]> {
  const remaining: string[] = [];
  for (const entry of entries) {
    if (!entry.existed) {
      if (await fileExists(entry.absPath)) remaining.push(entry.relPath);
      continue;
    }
    try {
      const current = await fs.readFile(entry.absPath, "utf8");
      if (current !== entry.previousContent) remaining.push(entry.relPath);
    } catch {
      remaining.push(entry.relPath);
    }
  }
  return remaining;
}

async function rollbackCommittedWrites(
  projectRoot: string,
  committed: readonly RollbackEntry[],
  io: GreenfieldWriteIo,
  logs: WriteFileLogEntry[],
): Promise<{ failures: string[]; remaining: string[] }> {
  const failures: string[] = [];
  for (const entry of [...committed].reverse()) {
    try {
      if (entry.existed) {
        const restored = await io.writeVerified(
          projectRoot,
          entry.absPath,
          entry.previousContent,
        );
        if (!restored.ok) {
          const reason = restored.reason ?? "Restore failed during rollback";
          failures.push(`${entry.relPath}: ${reason}`);
          logs.push({
            path: entry.relPath,
            mkdir: "skipped",
            overwrite: true,
            ok: false,
            reason: `rollback restore failed: ${reason}`,
          });
          logWriteFailure(formatLogLine(logs[logs.length - 1]!));
          continue;
        }
        logs.push({
          path: entry.relPath,
          mkdir: "exists",
          overwrite: true,
          ok: true,
          reason: "rollback restored",
        });
        logWrite(`rollback restored path=${entry.relPath}`);
      } else {
        const deleted = await io.deleteProjectFile(projectRoot, entry.absPath);
        if (!deleted.ok) {
          const reason = deleted.reason ?? "Delete failed during rollback";
          failures.push(`${entry.relPath}: ${reason}`);
          logs.push({
            path: entry.relPath,
            mkdir: "skipped",
            overwrite: false,
            ok: false,
            reason: `rollback delete failed: ${reason}`,
          });
          logWriteFailure(formatLogLine(logs[logs.length - 1]!));
          continue;
        }
        logs.push({
          path: entry.relPath,
          mkdir: "skipped",
          overwrite: false,
          ok: true,
          reason: "rollback deleted",
        });
        logWrite(`rollback deleted path=${entry.relPath}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Rollback failed";
      failures.push(`${entry.relPath}: ${reason}`);
      logs.push({
        path: entry.relPath,
        mkdir: "skipped",
        overwrite: entry.existed,
        ok: false,
        reason: `rollback failed: ${reason}`,
      });
      logWriteFailure(formatLogLine(logs[logs.length - 1]!));
    }
  }
  const remaining = await remainingAffectedPaths(committed);
  return { failures, remaining };
}

function failedResult(
  errors: string[],
  logs: WriteFileLogEntry[],
  written: string[],
): GreenfieldWriteResult {
  logWrite(
    `completed with errors written=${written.length} errors=${errors.length}`,
  );
  return { ok: false, written, errors, logs };
}

export async function writeGreenfieldFiles(
  root: string,
  files: { path: string; content: string }[],
  opts?: GreenfieldWriteOptions,
): Promise<GreenfieldWriteResult> {
  const mode: FileWriteMode = opts?.mode ?? "workspace";
  const io = opts?.io ?? DEFAULT_IO;
  const rootCheck = validateProjectRootForMetadata(root);
  if (!rootCheck.ok || !rootCheck.path) {
    const reason = rootCheck.reason ?? "Invalid project path.";
    logWriteFailure(`blocked — ${reason}`);
    return {
      ok: false,
      written: [],
      errors: [reason],
      logs: [],
    };
  }
  const projectRoot = rootCheck.path;
  const generationId = opts?.generationId;
  const delayWrites =
    greenfieldWriteDelayMs() > 0 &&
    !(
      process.env.BRYANTLABS_GREENFIELD_WRITE_DELAY_ONCE === "1" &&
      process.env.BRYANTLABS_GREENFIELD_WRITE_DELAY_USED === "1"
    );
  const markWriteDelayUsed = (): void => {
    if (delayWrites && process.env.BRYANTLABS_GREENFIELD_WRITE_DELAY_ONCE === "1") {
      process.env.BRYANTLABS_GREENFIELD_WRITE_DELAY_USED = "1";
    }
  };
  if (generationId && isProviderScopeCancelled(generationId)) {
    logWriteFailure(`blocked — ${PROVIDER_USER_CANCEL_MESSAGE}`);
    return {
      ok: false,
      written: [],
      errors: [PROVIDER_USER_CANCEL_MESSAGE],
      logs: [],
    };
  }
  const written: string[] = [];
  const errors: string[] = [];
  const logs: WriteFileLogEntry[] = [];
  const committed: RollbackEntry[] = [];

  console.log("[greenfield:write:start]");
  logWrite(`starting mode=${mode} root=${projectRoot} files=${files.length}`);

  const paths = new Set(files.map((f) => f.path));
  for (const required of GREENFIELD_PATHS) {
    if (!paths.has(required)) {
      const msg = `Missing required file: ${required}`;
      logWriteFailure(msg);
      return {
        ok: false,
        written,
        errors: [msg],
        logs,
      };
    }
  }

  const configCheck = validateGreenfieldFiles(files as GeneratedFile[]);
  if (!configCheck.ok) {
    for (const err of configCheck.errors) logWriteFailure(err);
    return { ok: false, written, errors: configCheck.errors, logs };
  }
  const filesToWrite = configCheck.files;

  let abortKind: "cancel" | "write" | null = null;

  const abortAndRollback = async (
    originalErrors: string[],
  ): Promise<GreenfieldWriteResult> => {
    if (committed.length === 0) {
      return failedResult(originalErrors, logs, []);
    }
    logWriteFailure(
      `rolling back ${committed.length} file(s) reason=${abortKind ?? "write"}`,
    );
    const rollback = await rollbackCommittedWrites(
      projectRoot,
      committed,
      io,
      logs,
    );
    if (rollback.failures.length === 0 && rollback.remaining.length === 0) {
      const errorsWithRollback = [
        ...originalErrors,
        `Rolled back ${committed.length} file(s).`,
      ];
      logWriteFailure(`rollback complete files=${committed.length}`);
      return failedResult(errorsWithRollback, logs, []);
    }
    const rollbackNotes = [
      ...rollback.failures.map((f) => `rollback failed: ${f}`),
    ];
    if (rollback.remaining.length > 0) {
      rollbackNotes.push(
        `Remaining affected paths: ${rollback.remaining.join(", ")}`,
      );
    }
    logWriteFailure(
      `rollback incomplete remaining=${rollback.remaining.join(",") || "none"} failures=${rollback.failures.length}`,
    );
    return failedResult([...originalErrors, ...rollbackNotes], logs, rollback.remaining);
  };

  for (const file of filesToWrite) {
    markWriteDelayUsed();
    if (generationId && isProviderScopeCancelled(generationId)) {
      const msg = PROVIDER_USER_CANCEL_MESSAGE;
      errors.push(msg);
      logs.push({
        path: file.path,
        mkdir: "skipped",
        overwrite: false,
        ok: false,
        reason: msg,
      });
      logWriteFailure(formatLogLine(logs[logs.length - 1]!));
      abortKind = "cancel";
      break;
    }
    if (!isAllowedGreenfieldWritePath(file.path)) {
      const msg = `Rejected non-allowed path: ${file.path}`;
      errors.push(msg);
      logs.push({
        path: file.path,
        mkdir: "skipped",
        overwrite: false,
        ok: false,
        reason: msg,
      });
      logWriteFailure(formatLogLine(logs[logs.length - 1]!));
      continue;
    }

    const abs = path.join(projectRoot, file.path);
    const check = validateWritePath(projectRoot, abs);
    if (!check.ok) {
      const reason = check.reason ?? "Path validation failed.";
      errors.push(`${file.path}: ${reason}`);
      logs.push({
        path: file.path,
        mkdir: "skipped",
        overwrite: false,
        ok: false,
        reason,
      });
      logWriteFailure(formatLogLine(logs[logs.length - 1]!));
      abortKind = "write";
      break;
    }

    const exists = await fileExists(abs);
    if (exists && mode === "safe") {
      const reason = "already exists";
      errors.push(`${file.path}: ${reason}.`);
      logs.push({
        path: file.path,
        mkdir: "skipped",
        overwrite: true,
        ok: false,
        reason,
      });
      logWriteFailure(formatLogLine(logs[logs.length - 1]!));
      abortKind = "write";
      break;
    }

    if (exists) {
      logWrite(`overwrite detected path=${file.path}`);
    }

    const parentResult = await ensureParentDirectory(abs);
    if (!parentResult.ok) {
      const reason = parentResult.detail;
      errors.push(`${file.path}: ${reason}`);
      logs.push({
        path: file.path,
        mkdir: "failed",
        mkdirDetail: reason,
        overwrite: exists,
        ok: false,
        reason,
      });
      logWriteFailure(formatLogLine(logs[logs.length - 1]!));
      abortKind = "write";
      break;
    }

    if (parentResult.mkdir === "created") {
      logWrite(`directory created path=${path.dirname(abs)}`);
    }

    const snapshot = await capturePreWriteState(file.path, abs);
    const result = await io.writeVerified(projectRoot, abs, file.content);
    if (result.ok) {
      committed.push(snapshot);
      written.push(file.path);
      logs.push({
        path: file.path,
        mkdir: parentResult.mkdir,
        overwrite: exists,
        ok: true,
      });
      logWrite(formatLogLine(logs[logs.length - 1]!));
      const delay = await waitForGreenfieldWriteDelay(generationId, delayWrites);
      if (
        delay === "cancelled" ||
        (generationId && isProviderScopeCancelled(generationId))
      ) {
        const msg = PROVIDER_USER_CANCEL_MESSAGE;
        errors.push(msg);
        logs.push({
          path: file.path,
          mkdir: "skipped",
          overwrite: false,
          ok: false,
          reason: msg,
        });
        logWriteFailure(formatLogLine(logs[logs.length - 1]!));
        abortKind = "cancel";
        break;
      }
    } else {
      const reason = result.reason ?? "write failed";
      errors.push(`${file.path}: ${reason}`);
      logs.push({
        path: file.path,
        mkdir: parentResult.mkdir,
        overwrite: exists,
        ok: false,
        reason,
      });
      logWriteFailure(formatLogLine(logs[logs.length - 1]!));
      const mutated =
        snapshot.existed || (await fileExists(abs));
      if (mutated) committed.push(snapshot);
      abortKind = "write";
      break;
    }
  }

  if (
    abortKind === null &&
    generationId &&
    isProviderScopeCancelled(generationId) &&
    committed.length > 0
  ) {
    errors.push(PROVIDER_USER_CANCEL_MESSAGE);
    abortKind = "cancel";
  }

  if (abortKind) {
    return abortAndRollback(errors);
  }

  const requiredWritten = GREENFIELD_PATHS.every((p) => written.includes(p));
  const ok = errors.length === 0 && requiredWritten;
  logWrite(
    ok
      ? `completed written=${written.length}`
      : `completed with errors written=${written.length} errors=${errors.length}`,
  );

  return {
    ok,
    written,
    errors,
    logs,
  };
}
