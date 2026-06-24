import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";

export function presentGreenfieldFilePaths(run: {
  readonly generatedFiles?: readonly { readonly path: string }[] | null;
  readonly filesWritten?: readonly string[];
}): Set<string> {
  return new Set([
    ...(run.generatedFiles?.map((file) => file.path) ?? []),
    ...(run.filesWritten ?? []),
  ]);
}

/** Paths still missing after generation/write — ignores marker audit when content exists. */
export function collectGreenfieldMissingFiles(run: GreenfieldRunSnapshot): string[] {
  const have = presentGreenfieldFilePaths(run);

  const fromAudit = run.debug?.markerAudit?.missingFiles ?? [];
  const auditMissing = fromAudit.filter((path) => !have.has(path));
  if (auditMissing.length > 0) return auditMissing;

  if (have.size > 0 && have.size < GREENFIELD_FILE_PATHS.length) {
    return GREENFIELD_FILE_PATHS.filter((path) => !have.has(path));
  }

  return [];
}
