const STORAGE_KEY = "bryantlabs.useAgentLoopForEdits";

/** When true, follow-up edits use the reasoning agent loop instead of structured build_loop. */
export function readUseAgentLoopForEdits(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    return raw === "1";
  } catch {
    return false;
  }
}

export function writeUseAgentLoopForEdits(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
