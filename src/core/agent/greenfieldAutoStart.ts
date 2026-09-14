/**
 * Embedded auto-start must fire once per operation. After a successful
 * create, remount/effect churn must not launch another generate.
 */
export function shouldAutoStartEmbeddedGreenfield(input: {
  readonly embedded: boolean;
  readonly autoStartGeneration: boolean;
  readonly alreadyStarted: boolean;
  readonly genStatus: "idle" | "running" | "done" | "error" | "cancelled";
  readonly generateLocked: boolean;
  readonly promptLength: number;
  readonly folderPresent: boolean;
  readonly greenfieldRecovery: boolean;
  readonly runResult?: string | null;
  readonly followUpAccepted?: boolean;
}): boolean {
  if (!input.embedded || !input.autoStartGeneration) return false;
  if (input.alreadyStarted || input.generateLocked) return false;
  if (input.followUpAccepted) return false;
  if (input.genStatus === "running" || input.genStatus === "done") return false;
  if (input.genStatus === "error" || input.genStatus === "cancelled") return false;
  if (!input.greenfieldRecovery && input.runResult === "success") return false;
  if (!input.folderPresent || input.promptLength < 4) return false;
  return true;
}

/** Do not reset the auto-start latch after generate has begun or finished. */
export function shouldResetGreenfieldAutoStartLatch(input: {
  readonly alreadyStarted: boolean;
  readonly genStatus: "idle" | "running" | "done" | "error" | "cancelled";
  readonly runResult?: string | null;
}): boolean {
  if (input.alreadyStarted) return false;
  if (input.genStatus !== "idle") return false;
  if (input.runResult === "success") return false;
  return true;
}
