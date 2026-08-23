/** Shadow workspace paths under the open project (disk staging before promote). */

export const SHADOW_RUNS_DIR = ".bryantlabs/shadow-runs";

export interface ShadowStagedFile {
  readonly relPath: string;
  readonly content: string;
}

export function shadowRunRoot(projectRoot: string, runId: string): string {
  const root = projectRoot.replace(/[/\\]+$/, "");
  const safeId = runId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${root}/${SHADOW_RUNS_DIR}/${safeId}`;
}

export function shadowFileAbs(projectRoot: string, runId: string, relPath: string): string {
  const normalized = relPath.replace(/^\.\//, "").replace(/\\/g, "/");
  return `${shadowRunRoot(projectRoot, runId)}/${normalized}`;
}
