export function logPatchReadyForApply(files: readonly string[]): void {
  console.log(`[patch:ready_for_apply] files=${files.join(",")}`);
}

export function logPatchReviewMode(enabled: boolean): void {
  console.log(`[patch:review_mode] enabled=${enabled}`);
}

export function logPatchApplyStart(files: readonly string[]): void {
  console.log(`[patch:apply:start] files=${files.join(",")}`);
}

export function logPatchApplySuccess(files: readonly string[]): void {
  console.log(`[patch:apply:success] files=${files.join(",")}`);
}

export function logPatchApplyFailed(reason: string): void {
  console.log(`[patch:apply:failed] reason=${reason}`);
}

export function logVerifyTypescriptStart(): void {
  console.log("[verify:typescript:start]");
}

export function logVerifyBuildStart(): void {
  console.log("[verify:build:start]");
}
