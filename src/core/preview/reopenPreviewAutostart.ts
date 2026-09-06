/**
 * After quit/reopen, PreviewView only mounts when the Preview tab is selected,
 * and openProjectAt does not spawn the preview server. Autostart once the
 * scan has real sources — never from generate, and never in a render loop.
 */
export interface ReopenPreviewAutostartInput {
  readonly projectPath: string | null;
  readonly scanStatus: string;
  readonly indexedSourceFileCount: number;
  readonly previewRunning: boolean;
  readonly startedForProjectPath: string | null;
  readonly genStatus: string;
  readonly setupStatus: string;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
}

export function shouldAutostartPreviewOnReopen(
  input: ReopenPreviewAutostartInput,
): boolean {
  if (!input.projectPath) return false;
  if (input.scanStatus !== "done") return false;
  if (input.indexedSourceFileCount < 1) return false;
  if (input.previewRunning) return false;
  if (input.startedForProjectPath === input.projectPath) return false;
  if (input.genStatus === "running") return false;
  if (
    input.setupStatus === "running" ||
    input.setupStatus === "repairing" ||
    input.setupStatus === "repair_needed" ||
    input.setupStatus === "error"
  ) {
    return false;
  }
  if (input.buildRunning || input.pipelineRunning) return false;
  return true;
}

/** Keep probing after reopen until the spawned server answers HTTP. */
export function shouldRetryPreviewHttpProbe(input: {
  readonly running: boolean;
  readonly url: string | null;
  readonly probeOk: boolean;
}): boolean {
  return Boolean(input.running && input.url && !input.probeOk);
}

export function previewAutostartLatchAfterProjectChange(
  previousPath: string | null,
  nextPath: string | null,
  startedForProjectPath: string | null,
): string | null {
  if (previousPath === nextPath) return startedForProjectPath;
  return null;
}
