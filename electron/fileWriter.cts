import * as path from "node:path";
import * as fsSync from "node:fs";
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

export const PATH_OUTSIDE_PROJECT_ROOT = "Path is outside the project root.";

/** How a path will be mutated. `write`/`create` follow a final symlink; `delete` does not. */
export type PathMutationIntent = "write" | "create" | "delete";

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

function isFsCode(err: unknown, code: string): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === code);
}

function isLexicallyInsideRoot(resolvedRoot: string, resolvedTarget: string): boolean {
  return (
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + path.sep)
  );
}

function isCanonicallyInsideRoot(canonicalRoot: string, candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return resolved === canonicalRoot || resolved.startsWith(canonicalRoot + path.sep);
}

function protectedPathReason(rel: string): string | null {
  const segments = rel.split(path.sep).filter(Boolean);
  for (const segment of segments.slice(0, -1)) {
    if (BLOCKED_DIRS.has(segment)) {
      return `Writing is blocked inside "${segment}".`;
    }
  }
  const name = segments[segments.length - 1] ?? "";
  if (BLOCKED_FILES.has(name)) {
    return `"${name}" is a protected lockfile.`;
  }
  return null;
}

function nearestExistingLexicalAncestor(
  absPath: string,
): { ok: true; existing: string; missing: string[] } | { ok: false; reason: string } {
  const missing: string[] = [];
  let current = absPath;
  for (;;) {
    try {
      fsSync.lstatSync(current);
      return { ok: true, existing: current, missing };
    } catch (err) {
      if (!isFsCode(err, "ENOENT")) {
        return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
      }
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve a path that exists as a symlink, including a dangling one.
 * Fail closed on ELOOP, EACCES, and other unexpected lstat/realpath errors.
 */
function realpathExistingOrDangling(
  absPath: string,
): { ok: true; path: string } | { ok: false; reason: string } {
  try {
    return { ok: true, path: fsSync.realpathSync(absPath) };
  } catch (err) {
    let st: fsSync.Stats;
    try {
      st = fsSync.lstatSync(absPath);
    } catch {
      return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
    }
    if (!st.isSymbolicLink() || !isFsCode(err, "ENOENT")) {
      return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
    }
    try {
      const link = fsSync.readlinkSync(absPath);
      const parentReal = fsSync.realpathSync(path.dirname(absPath));
      return { ok: true, path: path.resolve(parentReal, link) };
    } catch {
      return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
    }
  }
}

function joinResolved(base: string, segments: readonly string[]): string {
  return segments.length === 0 ? path.resolve(base) : path.resolve(base, ...segments);
}

/**
 * Canonical path-containment for filesystem mutations.
 *
 * The project root is canonicalized with realpathSync and must exist. Comparison
 * uses the canonical root plus a path-separator boundary so `/var` and
 * `/private/var` aliases agree, and sibling-prefix paths cannot sneak through.
 *
 * Check-then-use race: the tree can change between this inspection and the
 * later mkdir/write/unlink. Callers re-run this immediately before each
 * mutating syscall. Unexpected lstat/realpath errors fail closed.
 *
 * This does not use openat, O_NOFOLLOW, or RESOLVE_BENEATH.
 */
export function assertCanonicalPathContainment(
  root: string,
  target: string,
  intent: PathMutationIntent,
): { ok: true; canonicalRoot: string; effectivePath: string } | { ok: false; reason: string } {
  let canonicalRoot: string;
  try {
    canonicalRoot = fsSync.realpathSync(root);
  } catch {
    return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
  }

  const resolved = path.resolve(target);
  const nearest = nearestExistingLexicalAncestor(resolved);
  if (!nearest.ok) return nearest;

  if (intent === "delete") {
    const parentLexical = path.dirname(resolved);
    const parentNearest = nearestExistingLexicalAncestor(parentLexical);
    if (!parentNearest.ok) return parentNearest;
    const parentReal = realpathExistingOrDangling(parentNearest.existing);
    if (!parentReal.ok) return parentReal;
    const effectiveParent = joinResolved(parentReal.path, parentNearest.missing);
    if (!isCanonicallyInsideRoot(canonicalRoot, effectiveParent)) {
      return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
    }
    const effectivePath =
      parentNearest.missing.length === 0 && nearest.missing.length === 0
        ? path.join(effectiveParent, path.basename(resolved))
        : joinResolved(parentReal.path, [
            ...parentNearest.missing,
            path.basename(resolved),
          ]);
    return { ok: true, canonicalRoot, effectivePath };
  }

  const base = realpathExistingOrDangling(nearest.existing);
  if (!base.ok) return base;
  const effectivePath = joinResolved(base.path, nearest.missing);
  if (!isCanonicallyInsideRoot(canonicalRoot, effectivePath)) {
    return { ok: false, reason: PATH_OUTSIDE_PROJECT_ROOT };
  }
  return { ok: true, canonicalRoot, effectivePath };
}

/** True when `target` resolves inside the canonical project root (follow semantics). */
export function isCanonicalPathWithinRoot(root: string, target: string): boolean {
  if (typeof root !== "string" || root.length === 0) return false;
  if (typeof target !== "string" || target.length === 0) return false;
  const contained = assertCanonicalPathContainment(root, target, "write");
  return contained.ok;
}

/** Validate that `target` is a writable path inside `root`. */
export function validateWritePath(
  root: string | null,
  target: string,
  intent: PathMutationIntent = "write",
): { ok: boolean; reason?: string } {
  if (!root) return { ok: false, reason: "No project is open." };
  if (typeof target !== "string" || target.length === 0) {
    return { ok: false, reason: "Invalid path." };
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);

  if (resolved === resolvedRoot && intent !== "delete") {
    return { ok: false, reason: "Cannot write to the project root itself." };
  }

  if (isLexicallyInsideRoot(resolvedRoot, resolved)) {
    const rel = path.relative(resolvedRoot, resolved);
    const blocked = protectedPathReason(rel);
    if (blocked) return { ok: false, reason: blocked };
  }

  const contained = assertCanonicalPathContainment(root, target, intent);
  if (!contained.ok) return contained;

  if (contained.effectivePath === contained.canonicalRoot && intent !== "delete") {
    return { ok: false, reason: "Cannot write to the project root itself." };
  }

  const canonicalRel = path.relative(contained.canonicalRoot, contained.effectivePath);
  if (!canonicalRel.startsWith("..") && !path.isAbsolute(canonicalRel)) {
    const blocked = protectedPathReason(canonicalRel);
    if (blocked) return { ok: false, reason: blocked };
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
  const pathCheck = validateWritePath(root, filePath, "write");
  if (!pathCheck.ok) return fail(pathCheck.reason!);
  const contentCheck = validateContent(content);
  if (!contentCheck.ok) return fail(contentCheck.reason!);

  const preWrite = validateWritePath(root, filePath, "write");
  if (!preWrite.ok) return fail(preWrite.reason!);

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
  const pathCheck = validateWritePath(root, filePath, "write");
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
  const pathCheck = validateWritePath(root, filePath, "create");
  if (!pathCheck.ok) return fail(pathCheck.reason!);

  try {
    await fs.access(filePath);
    return fail("File already exists.");
  } catch {
    // expected for new files; a dangling symlink is not treated as absent —
    // validateWritePath already rejected one that would escape the project.
  }

  const preMkdir = validateWritePath(root, filePath, "create");
  if (!preMkdir.ok) return fail(preMkdir.reason!);

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
  const pathCheck = validateWritePath(root, filePath, "delete");
  if (!pathCheck.ok) return fail(pathCheck.reason!);

  const preUnlink = validateWritePath(root, filePath, "delete");
  if (!preUnlink.ok) return fail(preUnlink.reason!);

  try {
    await fs.unlink(filePath);
    return { ok: true, content: "", previousContent: "" };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : null;
    if (code === "ENOENT") {
      return { ok: true, content: "", previousContent: "" };
    }
    const message = err instanceof Error ? err.message : "Could not delete file.";
    return fail(message);
  }
}
