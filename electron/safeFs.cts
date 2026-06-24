import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface FsResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export const BRYANTLABS_DIR = ".bryantlabs";

const writeQueues = new Map<string, Promise<FsResult>>();

function logFailure(tag: string, detail: string): void {
  console.warn(`[${tag}] ${detail}`);
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Validate a directory path string before mkdir/write. */
export function validateDirectoryPath(target: unknown): FsResult & { path?: string } {
  if (typeof target !== "string" || target.trim().length === 0) {
    return { ok: false, reason: "Invalid path." };
  }
  const trimmed = target.trim();
  if (trimmed === "." || trimmed === "..") {
    return { ok: false, reason: "Invalid path." };
  }
  return { ok: true, path: path.resolve(trimmed) };
}

/** Validate project root before writing metadata under `.bryantlabs`. */
export function validateProjectRootForMetadata(
  projectRoot: unknown,
): FsResult & { path?: string } {
  const check = validateDirectoryPath(projectRoot);
  if (!check.ok || !check.path) return check;
  return { ok: true, path: check.path };
}

export function bryantlabsFilePath(
  projectRoot: string,
  ...segments: string[]
): string {
  return path.join(projectRoot, BRYANTLABS_DIR, ...segments);
}

/**
 * Recursively create a directory. Never throws — returns structured errors.
 */
export async function safeMkdir(dir: unknown): Promise<FsResult> {
  const check = validateDirectoryPath(dir);
  if (!check.ok || !check.path) {
    logFailure("filesystem", `mkdir failed — ${check.reason ?? "invalid path"}`);
    return { ok: false, reason: check.reason ?? "Invalid path." };
  }
  try {
    await fs.mkdir(check.path, { recursive: true });
    return { ok: true };
  } catch (err) {
    const message = errMessage(err, "mkdir failed.");
    logFailure("filesystem", `mkdir failed — ${message}`);
    return { ok: false, reason: message };
  }
}

/** Idempotent `.bryantlabs` directory creation for a project root. */
export async function ensureBryantlabsDir(
  projectRoot: unknown,
): Promise<FsResult & { dir?: string }> {
  const check = validateProjectRootForMetadata(projectRoot);
  if (!check.ok || !check.path) {
    logFailure("filesystem", `mkdir failed — ${check.reason ?? "invalid project root"}`);
    return { ok: false, reason: check.reason ?? "Invalid project root." };
  }
  const dir = path.join(check.path, BRYANTLABS_DIR);
  const mkdir = await safeMkdir(dir);
  if (!mkdir.ok) return mkdir;
  return { ok: true, dir };
}

/**
 * Write UTF-8 text to an absolute path. Creates parent directories when requested.
 */
export async function safeWriteText(
  absPath: unknown,
  content: unknown,
  opts?: { mkdirParents?: boolean; logTag?: string },
): Promise<FsResult> {
  const check = validateDirectoryPath(absPath);
  if (!check.ok || !check.path) {
    const tag = opts?.logTag ?? "filesystem";
    logFailure(tag, `write failed — ${check.reason ?? "invalid path"}`);
    return { ok: false, reason: check.reason ?? "Invalid path." };
  }
  if (typeof content !== "string") {
    const tag = opts?.logTag ?? "filesystem";
    logFailure(tag, "write failed — invalid content");
    return { ok: false, reason: "Invalid content." };
  }

  if (opts?.mkdirParents !== false) {
    const parent = path.dirname(check.path);
    const mkdir = await safeMkdir(parent);
    if (!mkdir.ok) {
      const tag = opts?.logTag ?? "filesystem";
      logFailure(tag, `write failed — ${mkdir.reason ?? "mkdir failed"}`);
      return mkdir;
    }
  }

  try {
    await fs.writeFile(check.path, content, "utf8");
    return { ok: true };
  } catch (err) {
    const message = errMessage(err, "write failed.");
    const tag = opts?.logTag ?? "filesystem";
    logFailure(tag, `write failed — ${message}`);
    return { ok: false, reason: message };
  }
}

/**
 * Atomic JSON write: temp file in same directory, then rename.
 */
export async function writeJsonAtomic(
  absPath: unknown,
  data: unknown,
  logTag = "filesystem",
): Promise<FsResult> {
  const check = validateDirectoryPath(absPath);
  if (!check.ok || !check.path) {
    logFailure(logTag, `write failed — ${check.reason ?? "invalid path"}`);
    return { ok: false, reason: check.reason ?? "Invalid path." };
  }

  const parent = path.dirname(check.path);
  const mkdir = await safeMkdir(parent);
  if (!mkdir.ok) {
    logFailure(logTag, `write failed — ${mkdir.reason ?? "mkdir failed"}`);
    return mkdir;
  }

  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = path.join(
    parent,
    `.${path.basename(check.path)}.tmp.${process.pid}.${Date.now()}`,
  );

  try {
    await fs.writeFile(tmp, payload, "utf8");
    await fs.rename(tmp, check.path);
    return { ok: true };
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    const message = errMessage(err, "write failed.");
    logFailure(logTag, `write failed — ${message}`);
    return { ok: false, reason: message };
  }
}

/** Serialize async writes to the same logical key (checkpoint, semantic index, etc.). */
export function enqueueSerializedWrite(
  key: string,
  fn: () => Promise<FsResult>,
): Promise<FsResult> {
  const prev = writeQueues.get(key) ?? Promise.resolve({ ok: true });
  const next = prev
    .catch((): FsResult => ({ ok: false, reason: "Prior write failed." }))
    .then(() => fn());
  writeQueues.set(key, next);
  return next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  });
}

/** Write JSON under `{projectRoot}/.bryantlabs/{relativePath}`. */
export async function writeBryantlabsJson(
  projectRoot: unknown,
  relativePath: string,
  data: unknown,
  logTag: string,
): Promise<FsResult> {
  const check = validateProjectRootForMetadata(projectRoot);
  if (!check.ok || !check.path) {
    logFailure(logTag, `write failed — ${check.reason ?? "invalid project root"}`);
    return { ok: false, reason: check.reason ?? "Invalid project root." };
  }
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    logFailure(logTag, "write failed — invalid relative path");
    return { ok: false, reason: "Invalid relative path." };
  }
  const norm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (norm.includes("..")) {
    logFailure(logTag, "write failed — path traversal blocked");
    return { ok: false, reason: "Invalid relative path." };
  }

  const ensured = await ensureBryantlabsDir(check.path);
  if (!ensured.ok) {
    logFailure(logTag, `write failed — ${ensured.reason ?? "mkdir failed"}`);
    return ensured;
  }

  const abs = bryantlabsFilePath(check.path, ...norm.split("/"));
  return writeJsonAtomic(abs, data, logTag);
}
