const STORAGE_KEY = "bryantlabs.useAgentLoopForEdits";

/** When true (default), follow-up edits use the reasoning agent loop instead of plan→apply only. */
export function readUseAgentLoopForEdits(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeUseAgentLoopForEdits(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
