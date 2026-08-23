import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import { buildScaffoldProjectScan } from "@/core/repository/scaffoldScan";
import type { ProjectScan } from "@/types";

function scaffoldFromKnownPaths(
  projectPath: string,
  paths: readonly string[],
): ProjectScan | null {
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  return buildScaffoldProjectScan(projectPath, unique);
}

/**
 * Prefer the live project scan, but recover from stale cached indexes after reopen:
 * - in-memory greenfield `filesWritten` during the same session
 * - persisted `sessionMemory.modifiedFiles` from prior successful edits/creates
 */
export function resolveEffectiveProjectScan(input: {
  readonly scan: ProjectScan | null;
  readonly projectPath: string | null;
  readonly greenfieldRun?: { readonly filesWritten?: readonly string[] } | null;
  readonly persistedModifiedFiles?: readonly string[] | null;
}): ProjectScan | null {
  const path = input.projectPath?.trim();
  if (!path) return null;

  if (input.scan && countProjectSourceFiles(input.scan) > 0) {
    return input.scan;
  }

  const inMemoryWritten = input.greenfieldRun?.filesWritten ?? [];
  const fromRun = scaffoldFromKnownPaths(path, inMemoryWritten);
  if (fromRun) return fromRun;

  const persisted = input.persistedModifiedFiles ?? [];
  const fromPersisted = scaffoldFromKnownPaths(path, persisted);
  if (fromPersisted) return fromPersisted;

  return input.scan;
}
