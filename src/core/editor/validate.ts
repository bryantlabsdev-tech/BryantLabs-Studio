import type { ValidationResult } from "@/core/editor/types";

/** Mirror of the main-process write limit (kept in sync intentionally). */
export const MAX_EDIT_BYTES = 2 * 1024 * 1024;

/** Directory names that must never be written to. */
const BLOCKED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "build",
  "out",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

/** File names that must never be written to. */
const BLOCKED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

/**
 * Early, renderer-side check used to disable UI for protected paths. The
 * authoritative check is enforced again in the main process before any write.
 */
export function isEditablePath(relPath: string): ValidationResult {
  const segments = relPath.split(/[/\\]/).filter(Boolean);
  for (const segment of segments.slice(0, -1)) {
    if (BLOCKED_DIRS.has(segment)) {
      return { ok: false, reason: `Editing is blocked inside "${segment}".` };
    }
  }
  const name = segments[segments.length - 1] ?? relPath;
  if (BLOCKED_FILES.has(name)) {
    return { ok: false, reason: `"${name}" is a protected lockfile.` };
  }
  return { ok: true };
}

/** Validate a computed patch result before it can be proposed/applied. */
export function validatePatch(before: string, after: string): ValidationResult {
  if (after === before) {
    return { ok: false, reason: "The edit produces no changes." };
  }
  if (after.includes("\u0000")) {
    return { ok: false, reason: "The edit would introduce binary content." };
  }
  if (new TextEncoder().encode(after).length > MAX_EDIT_BYTES) {
    return { ok: false, reason: "The result exceeds the 2 MB limit." };
  }
  return { ok: true };
}
