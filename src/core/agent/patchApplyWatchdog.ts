const WATCHDOG_MS = 30_000;

let patchGeneratedAt: number | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

export function markPatchGenerated(): void {
  patchGeneratedAt = Date.now();
}

export function clearPatchGeneratedWatchdog(): void {
  patchGeneratedAt = null;
  if (watchdogTimer !== null) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

export function startPatchApplyWatchdog(onTimeout: (message: string) => void): void {
  clearPatchGeneratedWatchdog();
  patchGeneratedAt = Date.now();
  watchdogTimer = setInterval(() => {
    if (patchGeneratedAt === null) return;
    if (Date.now() - patchGeneratedAt < WATCHDOG_MS) return;
    clearPatchGeneratedWatchdog();
    onTimeout("Patch generated but not applied. Check review/apply state.");
  }, 1000);
}

export function notifyPatchApplyStageReached(
  phase: string | null | undefined,
): void {
  if (
    phase === "waiting_for_review" ||
    phase === "review" ||
    phase === "applying" ||
    phase === "verifying" ||
    phase === "done"
  ) {
    clearPatchGeneratedWatchdog();
  }
}
