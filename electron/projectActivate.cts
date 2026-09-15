import { stopPreview, stopPreviewAsync } from "./greenfield/preview.cjs";
import { clearSemanticIndex, hydrateSemanticIndex } from "./semanticIndex/indexer.cjs";
import { noteActiveProject } from "./projectWriteCoordinator.cjs";
import { destroyAllTerminals } from "./terminal.cjs";
import { stopProjectIndex } from "./projectIndex/coordinator.cjs";

export interface ActivateProjectOptions {
  /** Wait for preview subprocess to exit (frees ports; use before starting new preview). */
  awaitPreviewStop?: boolean;
}

export const PROJECT_SWITCH_OPTIONS: ActivateProjectOptions = {
  awaitPreviewStop: true,
};

/** Optional overrides for unit tests; production uses the real preview stoppers. */
export interface ProjectSwitchRuntime {
  stopPreviewAsync?: () => Promise<void>;
  stopPreview?: () => void;
}

/**
 * Tear down project-scoped main-process resources before switching roots.
 * Kills PTYs first so shell/file-descriptor callbacks cannot race with new work.
 */
export async function prepareProjectSwitch(
  nextRoot: string,
  opts?: ActivateProjectOptions,
  runtime?: ProjectSwitchRuntime,
): Promise<void> {
  destroyAllTerminals();
  if (opts?.awaitPreviewStop) {
    await (runtime?.stopPreviewAsync ?? stopPreviewAsync)();
  } else {
    (runtime?.stopPreview ?? stopPreview)();
  }
  await stopProjectIndex();
  clearSemanticIndex();
  noteActiveProject(nextRoot);
}

/**
 * Production project switch: wait for the previous preview tree/port to settle
 * before the next root is marked active.
 */
export async function switchToProjectRoot(
  nextRoot: string,
  onActivated: (root: string) => Promise<void> | void,
  runtime?: ProjectSwitchRuntime,
): Promise<void> {
  await prepareProjectSwitch(nextRoot, PROJECT_SWITCH_OPTIONS, runtime);
  await onActivated(nextRoot);
}

/** After {@link prepareProjectSwitch}, hydrate index for the new root. */
export function hydrateProjectAfterSwitch(nextRoot: string): void {
  void hydrateSemanticIndex(nextRoot);
}
