export function logEditPlan(files: readonly string[]): void {
  console.log(`[edit:plan] files=${files.join(",")}`);
}

export function logPatchApplied(success: boolean, files?: readonly string[]): void {
  const fileSuffix = files?.length ? ` files=${files.join(",")}` : "";
  console.log(`[patch:applied] success=${success}${fileSuffix}`);
}

export {
  logPatchApplyFailed,
  logPatchApplyStart,
  logPatchApplySuccess,
  logPatchReadyForApply,
  logPatchReviewMode,
  logVerifyBuildStart,
  logVerifyTypescriptStart,
} from "@/core/agent/patchApplyLogs";

export function logVerifyTypescript(success: boolean): void {
  console.log(`[verify:typescript] success=${success}`);
}

export function logVerifyBuild(success: boolean): void {
  console.log(`[verify:build] success=${success}`);
}

export function logProjectAudit(line: string): void {
  console.log(`[project:audit] ${line}`);
}

export function logProjectFiles(line: string): void {
  console.log(`[project:files] ${line}`);
}
