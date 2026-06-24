import { stopPreview, stopPreviewAsync } from "./greenfield/preview.cjs";
import { clearSemanticIndex, hydrateSemanticIndex } from "./semanticIndex/indexer.cjs";
import { noteActiveProject } from "./projectWriteCoordinator.cjs";
import { destroyAllTerminals } from "./terminal.cjs";
import { stopProjectIndex } from "./projectIndex/coordinator.cjs";

export interface ActivateProjectOptions {
  /** Wait for preview subprocess to exit (frees ports; use before starting new preview). */
  awaitPreviewStop?: boolean;
}

/**
 * Tear down project-scoped main-process resources before switching roots.
 * Kills PTYs first so shell/file-descriptor callbacks cannot race with new work.
 */
export async function prepareProjectSwitch(
  nextRoot: string,
  opts?: ActivateProjectOptions,
): Promise<void> {
  destroyAllTerminals();
  if (opts?.awaitPreviewStop) {
    await stopPreviewAsync();
  } else {
    stopPreview();
  }
  await stopProjectIndex();
  clearSemanticIndex();
  noteActiveProject(nextRoot);
}

/** After {@link prepareProjectSwitch}, hydrate index for the new root. */
export function hydrateProjectAfterSwitch(nextRoot: string): void {
  void hydrateSemanticIndex(nextRoot);
}
