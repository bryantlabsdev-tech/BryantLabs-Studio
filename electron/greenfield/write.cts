import * as path from "node:path";
import { promises as fs } from "node:fs";
import { writeVerified, validateWritePath } from "../fileWriter.cjs";
import { safeMkdir, validateProjectRootForMetadata } from "../safeFs.cjs";
import type { FileWriteMode } from "../providers/settings.cjs";
import type { GeneratedFile } from "./generate.cjs";
import { GREENFIELD_PATHS } from "./generate.cjs";
import {
  isAllowedGreenfieldWritePath,
} from "./paths.cjs";
import { validateGreenfieldFiles } from "./validate.cjs";

/**
 * Write greenfield files using the Phase 5 safe writer (Phase 10).
 * Creates parent directories; workspace mode overwrites existing files.
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

export interface GreenfieldWriteOptions {
  mode?: FileWriteMode;
}

const LOG_TAG = "greenfield:write";

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

export async function writeGreenfieldFiles(
  root: string,
  files: { path: string; content: string }[],
  opts?: GreenfieldWriteOptions,
): Promise<GreenfieldWriteResult> {
  const mode: FileWriteMode = opts?.mode ?? "workspace";
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
  const written: string[] = [];
  const errors: string[] = [];
  const logs: WriteFileLogEntry[] = [];

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

  for (const file of filesToWrite) {
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
      continue;
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
      continue;
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
      continue;
    }

    if (parentResult.mkdir === "created") {
      logWrite(`directory created path=${path.dirname(abs)}`);
    }

    const result = await writeVerified(projectRoot, abs, file.content);
    if (result.ok) {
      written.push(file.path);
      logs.push({
        path: file.path,
        mkdir: parentResult.mkdir,
        overwrite: exists,
        ok: true,
      });
      logWrite(formatLogLine(logs[logs.length - 1]!));
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
    }
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
