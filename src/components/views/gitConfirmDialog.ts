export const GIT_BRANCH_IPC_FAILURE_MESSAGE = "Branch change failed.";
export const GIT_WORKTREE_IPC_FAILURE_MESSAGE = "Worktree change failed.";

export function isBackdropDismissTarget(
  target: EventTarget | null,
  currentTarget: EventTarget | null,
): boolean {
  return target === currentTarget;
}

export function nextDialogControl(
  current: "cancel" | "confirm",
  shiftKey: boolean,
): "cancel" | "confirm" {
  if (shiftKey) return current === "cancel" ? "confirm" : "cancel";
  return current === "cancel" ? "confirm" : "cancel";
}
