import type { FailureDiagnostic } from "@/core/autoFix/types";
import type { ProjectScan } from "@/types";

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

/** Resolve a diagnostic file path to a project-relative path. */
export function resolveFailureFilePath(
  diagnosticFile: string,
  scan: ProjectScan,
  modifiedFiles: readonly string[],
): string | null {
  const norm = diagnosticFile.replace(/\\/g, "/");
  if (!norm) {
    return modifiedFiles[0] ?? scan.files[0]?.path ?? null;
  }

  const exact = scan.files.find(
    (f) => f.path === norm || f.path.endsWith("/" + norm) || f.absPath.endsWith(norm),
  );
  if (exact) return exact.path;

  const byBase = scan.files.filter(
    (f) => basename(f.path).toLowerCase() === basename(norm).toLowerCase(),
  );
  const inModified = byBase.find((f) => modifiedFiles.includes(f.path));
  if (inModified) return inModified.path;
  if (byBase.length === 1) return byBase[0]!.path;

  const modifiedMatch = modifiedFiles.find(
    (p) => p === norm || basename(p).toLowerCase() === basename(norm).toLowerCase(),
  );
  if (modifiedMatch) return modifiedMatch;

  return modifiedFiles[0] ?? null;
}

/**
 * Pick a single file to repair — only files involved in the failure or the apply set.
 */
export function pickRepairTargetPath(
  primary: FailureDiagnostic,
  scan: ProjectScan,
  modifiedFiles: readonly string[],
): string | null {
  if (primary.file) {
    const resolved = resolveFailureFilePath(primary.file, scan, modifiedFiles);
    if (resolved) return resolved;
  }
  return modifiedFiles[0] ?? null;
}
