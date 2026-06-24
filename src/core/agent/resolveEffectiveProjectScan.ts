import { buildScaffoldProjectScan } from "@/core/repository/scaffoldScan";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { ProjectScan } from "@/types";

export function resolveEffectiveProjectScan(input: {
  readonly scan: ProjectScan | null;
  readonly projectPath: string | null;
  readonly greenfieldRun?: GreenfieldRunSnapshot | null;
}): ProjectScan | null {
  if (input.scan) return input.scan;
  const path = input.projectPath?.trim();
  if (!path) return null;
  const filesWritten = input.greenfieldRun?.filesWritten ?? [];
  if (filesWritten.length === 0) return null;
  return buildScaffoldProjectScan(path, filesWritten);
}
