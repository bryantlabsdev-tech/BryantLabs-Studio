import { hashPrompt } from "@/core/agent/runContextReset";
import { promptsMatchForGreenfieldRecovery } from "@/core/agent/promptRecoveryMatch";
import { classifyRunFailureReason } from "@/core/agent/runFailureDiagnostics";
import { hasProjectScaffoldMarkers } from "@/core/agent/projectIntentRouting";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import type { RunLogStage } from "@/core/greenfield/runLog";

export const GREENFIELD_SETUP_FAILURE_STAGES = new Set<RunLogStage | string>([
  "npm_install",
  "typescript",
  "build",
  "preview",
  "greenfield_repair",
  "generation",
  "parser",
  "write",
]);

export const GREENFIELD_RECOVERY_ERROR_CATEGORIES = new Set<string>([
  "npm_install_failed",
  "typescript_failed",
  "build_failed",
  "preview_failed",
  "verification_failed",
  "generation_failed",
  "parser_failed",
  "write_failed",
]);

export interface GreenfieldRecoveryContext {
  readonly previousRoute: string | null;
  readonly previousActionType: string | null;
  readonly previousRunResult: string | null;
  readonly failedStage: string | null;
  readonly errorCategory: string | null;
  readonly previousPromptHash: string | null;
  readonly previousPrompt: string | null;
  readonly currentPrompt: string;
  readonly currentPromptHash: string;
  readonly filesCreated: number;
  readonly projectPath: string | null;
  readonly targetFolder: string | null;
  readonly hasGeneratedFiles: boolean;
  readonly setupSucceeded: boolean;
}

export function resolveGreenfieldFailedStage(run: GreenfieldRunSnapshot): string | null {
  const fromAction = run.latestAction?.stage;
  if (fromAction && GREENFIELD_SETUP_FAILURE_STAGES.has(fromAction)) {
    return fromAction;
  }

  for (let i = run.entries.length - 1; i >= 0; i -= 1) {
    const entry = run.entries[i]!;
    if (entry.status === "failed" && GREENFIELD_SETUP_FAILURE_STAGES.has(entry.stage)) {
      return entry.stage;
    }
  }

  if (run.setupResult && !run.setupResult.ok) {
    if (run.setupResult.install && !run.setupResult.install.ok) return "npm_install";
    if (run.setupResult.typecheck && !run.setupResult.typecheck.ok) return "typescript";
    if (run.setupResult.build && !run.setupResult.build.ok) return "build";
  }

  return null;
}

export function isIncompleteGreenfieldRun(run: GreenfieldRunSnapshot): boolean {
  const hasScaffold =
    hasProjectScaffoldMarkers(null, run.filesWritten) ||
    (run.generatedFiles?.length ?? 0) >= GREENFIELD_FILE_PATHS.length;

  if (!hasScaffold) return false;

  if (run.runResult === "success" && run.setupResult?.ok === true) {
    return false;
  }

  const wasGreenfield =
    run.actionType === "greenfield" ||
    run.runTimeline?.route === "greenfield" ||
    run.routeDecision?.selectedRoute === "greenfield" ||
    run.routeDecision?.selectedRoute === "greenfield_recovery";

  if (!wasGreenfield && run.actionType !== "idle") {
    return false;
  }

  if (
    run.runResult === "failed" ||
    run.setupStatus === "error" ||
    run.setupStatus === "repair_needed" ||
    (run.setupResult != null && !run.setupResult.ok)
  ) {
    return true;
  }

  return run.genStatus === "done" && run.runResult !== "success";
}

export function buildGreenfieldRecoveryContext(input: {
  readonly prompt: string;
  readonly projectPath: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly lastArtifact?: AgentRunArtifact | null;
}): GreenfieldRecoveryContext | null {
  const { greenfieldRun, lastArtifact, projectPath } = input;
  if (!projectPath?.trim()) return null;

  const currentPromptHash = hashPrompt(input.prompt);
  const previousPrompt =
    lastArtifact?.prompt?.trim() ||
    lastArtifact?.diagnosticReport?.prompt?.trim() ||
    greenfieldRun.workflow?.prompt?.trim() ||
    "";
  const previousPromptHash = previousPrompt ? hashPrompt(previousPrompt) : null;

  const previousRoute =
    lastArtifact?.diagnosticReport?.route ??
    greenfieldRun.runTimeline?.route ??
    greenfieldRun.routeDecision?.selectedRoute ??
    null;

  const previousActionType =
    lastArtifact?.diagnosticReport?.generationMode ??
    (greenfieldRun.actionType !== "idle" ? greenfieldRun.actionType : null);

  const failedStage = resolveGreenfieldFailedStage(greenfieldRun);
  const errorCategory =
    lastArtifact?.diagnosticReport?.errorCategory ??
    classifyRunFailureReason({
      run: greenfieldRun,
      report: greenfieldRun.failureReport,
      rawError: greenfieldRun.finalMessage,
    });

  const filesCreated = Math.max(
    greenfieldRun.filesWritten.length,
    greenfieldRun.generatedFiles?.length ?? 0,
    lastArtifact?.diagnosticReport?.filesCreated ?? 0,
  );

  return {
    previousRoute,
    previousActionType,
    previousRunResult: greenfieldRun.runResult,
    failedStage,
    errorCategory,
    previousPromptHash,
    previousPrompt: previousPrompt || null,
    currentPrompt: input.prompt.trim(),
    currentPromptHash,
    filesCreated,
    projectPath,
    targetFolder: greenfieldRun.targetFolder ?? greenfieldRun.projectPath,
    hasGeneratedFiles: (greenfieldRun.generatedFiles?.length ?? 0) > 0,
    setupSucceeded: greenfieldRun.setupResult?.ok === true,
  };
}

export function shouldRouteGreenfieldRecovery(
  ctx: GreenfieldRecoveryContext | null,
  run: GreenfieldRunSnapshot,
): boolean {
  if (!ctx) return false;
  if (!isIncompleteGreenfieldRun(run)) return false;
  if (ctx.previousRunResult !== "failed") return false;
  if (ctx.setupSucceeded) return false;
  if (ctx.filesCreated === 0 && !ctx.hasGeneratedFiles) return false;

  const samePrompt =
    ctx.previousPromptHash != null &&
    ctx.previousPromptHash === ctx.currentPromptHash;
  const similarPrompt =
    ctx.previousPrompt != null &&
    promptsMatchForGreenfieldRecovery(ctx.previousPrompt, ctx.currentPrompt);
  if (!samePrompt && !similarPrompt) return false;

  const sameFolder =
    ctx.targetFolder != null &&
    ctx.projectPath != null &&
    ctx.targetFolder === ctx.projectPath;
  if (!sameFolder) return false;

  const wasGreenfield =
    ctx.previousRoute === "greenfield" ||
    ctx.previousRoute === "greenfield_recovery" ||
    ctx.previousActionType === "greenfield" ||
    run.actionType === "greenfield" ||
    (run.generatedFiles?.length ?? 0) >= GREENFIELD_FILE_PATHS.length;
  if (!wasGreenfield) return false;

  if (ctx.failedStage && GREENFIELD_SETUP_FAILURE_STAGES.has(ctx.failedStage)) {
    return true;
  }

  if (ctx.errorCategory && GREENFIELD_RECOVERY_ERROR_CATEGORIES.has(ctx.errorCategory)) {
    return true;
  }

  return ctx.hasGeneratedFiles || ctx.filesCreated >= GREENFIELD_FILE_PATHS.length;
}

export const INCOMPLETE_GREENFIELD_EDIT_BLOCK_MESSAGE =
  "Previous app generation failed before build completed. Submit the original creation prompt again to retry setup recovery — editing is not available until setup succeeds.";

export function isIncompleteGreenfieldBlockMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return (
    trimmed.includes(INCOMPLETE_GREENFIELD_EDIT_BLOCK_MESSAGE) ||
    /Previous app generation failed before build completed/i.test(trimmed)
  );
}

export function incompleteGreenfieldEditBlockMessage(
  run: GreenfieldRunSnapshot,
): string {
  const original = run.workflow?.prompt?.trim();
  if (original && original.length > 0) {
    const preview =
      original.length > 96 ? `${original.slice(0, 96).trim()}…` : original;
    return `${INCOMPLETE_GREENFIELD_EDIT_BLOCK_MESSAGE} Original prompt: "${preview}"`;
  }
  return INCOMPLETE_GREENFIELD_EDIT_BLOCK_MESSAGE;
}

/** Block edit/apply on any incomplete greenfield scaffold in the same folder. */
export function shouldBlockEditForIncompleteGreenfield(input: {
  readonly projectPath: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
}): boolean {
  if (!input.projectPath?.trim()) return false;
  if (!isIncompleteGreenfieldRun(input.greenfieldRun)) return false;
  const target =
    input.greenfieldRun.targetFolder ?? input.greenfieldRun.projectPath;
  return target != null && target === input.projectPath;
}

export function shouldBlockApplyPlanForIncompleteGreenfield(input: {
  readonly prompt: string;
  readonly projectPath: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly lastArtifact?: AgentRunArtifact | null;
}): boolean {
  return shouldBlockEditForIncompleteGreenfield({
    projectPath: input.projectPath,
    greenfieldRun: input.greenfieldRun,
  });
}
