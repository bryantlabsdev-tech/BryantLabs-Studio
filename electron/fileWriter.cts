import * as path from "node:path";
import { promises as fs } from "node:fs";
import { safeMkdir, safeWriteText } from "./safeFs.cjs";

/**
 * Read-only-by-default file writer with strict safety (Phase 5).
 *
 * Every write is validated against the active project root, refuses protected
 * directories and lockfiles, refuses binary/oversized content, and is verified
 * by re-reading the file afterwards. No write is performed without these checks.
 */

export const MAX_WRITE_BYTES = 2 * 1024 * 1024;

const BLOCKED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "dist-electron",
  "build",
  "out",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

const BLOCKED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

export interface WriteResult {
  ok: boolean;
  content?: string;
  /** Disk content before the write (used to support undo). */
  previousContent?: string;
  reason?: string;
}

function fail(reason: string): WriteResult {
  return { ok: false, reason };
}

/** Validate that `target` is a writable path inside `root`. */
export function validateWritePath(
  root: string | null,
  target: string,
): { ok: boolean; reason?: string } {
  if (!root) return { ok: false, reason: "No project is open." };
  if (typeof target !== "string" || target.length === 0) {
    return { ok: false, reason: "Invalid path." };
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);

  if (resolved === resolvedRoot) {
    return { ok: false, reason: "Cannot write to the project root itself." };
  }
  if (!resolved.startsWith(resolvedRoot + path.sep)) {
    return { ok: false, reason: "Path is outside the project root." };
  }

  const rel = path.relative(resolvedRoot, resolved);
  const segments = rel.split(path.sep).filter(Boolean);
  for (const segment of segments.slice(0, -1)) {
    if (BLOCKED_DIRS.has(segment)) {
      return { ok: false, reason: `Writing is blocked inside "${segment}".` };
    }
  }
  const name = segments[segments.length - 1] ?? "";
  if (BLOCKED_FILES.has(name)) {
    return { ok: false, reason: `"${name}" is a protected lockfile.` };
  }

  return { ok: true };
}

function validateContent(content: string): { ok: boolean; reason?: string } {
  if (typeof content !== "string") return { ok: false, reason: "Invalid content." };
  if (content.includes("\u0000")) {
    return { ok: false, reason: "Refusing to write binary content." };
  }
  if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
    return { ok: false, reason: "Content exceeds the 2 MB limit." };
  }
  return { ok: true };
}

async function readExistingText(
  filePath: string,
): Promise<{ ok: boolean; text?: string; reason?: string }> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return { ok: false, reason: "File does not exist." };
  }
  if (!stat.isFile()) return { ok: false, reason: "Target is not a file." };
  if (stat.size > MAX_WRITE_BYTES) {
    return { ok: false, reason: "File is too large to edit (over 2 MB)." };
  }
  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) {
    return { ok: false, reason: "Binary file — editing is blocked." };
  }
  return { ok: true, text: buffer.toString("utf8") };
}

/** Write `content` and confirm by re-reading. Validates path + content first. */
export async function writeVerified(
  root: string | null,
  filePath: string,
  content: string,
): Promise<WriteResult> {
  const pathCheck = validateWritePath(root, filePath);
  if (!pathCheck.ok) return fail(pathCheck.reason!);
  const contentCheck = validateContent(content);
  if (!contentCheck.ok) return fail(contentCheck.reason!);

  try {
    const written = await safeWriteText(filePath, content, { logTag: "filesystem" });
    if (!written.ok) return fail(written.reason ?? "Failed to write the file.");
  } catch {
    return fail("Failed to write the file.");
  }

  // Re-read to verify the write actually landed.
  const reread = await fs.readFile(filePath, "utf8").catch(() => null);
  if (reread === null || reread !== content) {
    return fail("Write verification failed (re-read did not match).");
  }
  return { ok: true, content: reread };
}

/**
 * Apply an edit: validate, confirm the on-disk content still matches the basis
 * the patch was computed from, then write + verify. Returns the prior content
 * so the caller can support undo.
 */
export async function applyEdit(
  root: string | null,
  filePath: string,
  expectedBefore: string,
  after: string,
): Promise<WriteResult> {
  const pathCheck = validateWritePath(root, filePath);
  if (!pathCheck.ok) return fail(pathCheck.reason!);

  const existing = await readExistingText(filePath);
  if (!existing.ok) return fail(existing.reason!);

  if (existing.text !== expectedBefore) {
    return fail("The file changed on disk since the patch was created.");
  }

  const written = await writeVerified(root, filePath, after);
  if (!written.ok) return written;

  return { ok: true, content: written.content!, previousContent: existing.text! };
}

/**
 * Create a new file under the project root (mkdir parent dirs, then write + verify).
 * Used by multi-file execution for planned paths not yet on disk.
 */
export async function createProjectFile(
  root: string | null,
  filePath: string,
  content: string,
): Promise<WriteResult> {
  const pathCheck = validateWritePath(root, filePath);
  if (!pathCheck.ok) return fail(pathCheck.reason!);

  try {
    await fs.access(filePath);
    return fail("File already exists.");
  } catch {
    // expected for new files
  }

  const mkdir = await safeMkdir(path.dirname(filePath));
  if (!mkdir.ok) return fail(mkdir.reason ?? "Could not create parent directories.");

  const written = await writeVerified(root, filePath, content);
  if (!written.ok) return written;
  return { ok: true, content: written.content!, previousContent: "" };
}

/**
 * Remove a project file created during a failed multi-file apply rollback.
 */
export async function deleteProjectFile(
  root: string | null,
  filePath: string,
): Promise<WriteResult> {
  const pathCheck = validateWritePath(root, filePath);
  if (!pathCheck.ok) return fail(pathCheck.reason!);

  try {
    await fs.unlink(filePath);
    return { ok: true, content: "", previousContent: "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete file.";
    return fail(message);
  }
}
