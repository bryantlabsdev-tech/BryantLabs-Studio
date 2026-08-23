const STORAGE_KEY = "bryantlabs.followUpShadowApply";

/** When true (default), proposed edits are staged under `.bryantlabs/shadow-runs/` before apply. */
export function readFollowUpShadowApply(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeFollowUpShadowApply(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
