import {
  classifyAgentPromptIntent,
  looksLikeApplyConfirmation,
  type AgentPromptIntent,
} from "@/core/agent/agentIntentRouter";
import type {
  AgentExecutionKind,
  AgentRouteDecisionTrace,
  ComposerModeOverride,
  RouteAgentPromptResult,
} from "@/core/agent/unifiedAgentRoute";

/** Composer UI modes. Auto keeps intent routing; Ask is a hard read-only lock. */
export type ComposerAgentMode =
  | "auto"
  | "create"
  | "edit"
  | "fix"
  | "refactor"
  | "ask";

export const ASK_MODE_READONLY_EXPLANATION =
  "Ask mode is read-only. I can inspect and explain this project, but I will not edit files, create a project, apply patches, or run mutating commands. Switch to Auto, Edit, Create, or Fix to make changes.";

export const ASK_MODE_PENDING_BLOCK_EXPLANATION =
  "Ask mode is read-only, so confirmation text such as “yes” or “apply” will not apply your pending edit. The pending work is still waiting. Switch to Edit, Fix, or Auto to apply it.";

const COMPOSER_MODE_TO_OVERRIDE: Record<ComposerAgentMode, ComposerModeOverride> = {
  auto: "auto",
  create: "new_app",
  edit: "edit",
  fix: "fix_errors",
  refactor: "edit",
  ask: "ask",
};

export function isAskComposerOverride(
  override: ComposerModeOverride | undefined,
): boolean {
  return override === "ask";
}

export function overrideFromComposerMode(mode: ComposerAgentMode): ComposerModeOverride {
  return COMPOSER_MODE_TO_OVERRIDE[mode];
}

export function composerModeFromOverride(
  override: ComposerModeOverride,
): ComposerAgentMode {
  if (override === "new_app") return "create";
  if (override === "fix_errors") return "fix";
  if (override === "edit") return "edit";
  if (override === "ask") return "ask";
  return "auto";
}

export function isMutationCapableExecution(kind: AgentExecutionKind): boolean {
  return (
    kind === "build_loop" ||
    kind === "greenfield" ||
    kind === "greenfield_recovery" ||
    kind === "run_command" ||
    kind === "mixed_confirm"
  );
}

export type PendingEditConfirmationDecision =
  | { readonly action: "ignore" }
  | { readonly action: "keep_pending_explain_ask" };

/**
 * Ask mode never applies a pending edit or plan from confirmation text.
 * Auto/edit confirmation is ignored here so existing review/apply surfaces stay
 * authoritative — this helper must not start applyEdit.
 */
export function resolvePendingEditConfirmation(input: {
  readonly modeOverride: ComposerModeOverride;
  readonly prompt: string;
  readonly pendingPrompt: string | null;
  readonly hasPendingReview?: boolean;
}): PendingEditConfirmationDecision {
  const confirmation = looksLikeApplyConfirmation(input.prompt);
  const hasPending =
    Boolean(input.pendingPrompt?.trim()) || input.hasPendingReview === true;
  if (!confirmation || !hasPending) return { action: "ignore" };
  if (isAskComposerOverride(input.modeOverride)) {
    return { action: "keep_pending_explain_ask" };
  }
  return { action: "ignore" };
}

export function buildAskModeRoute(input: {
  readonly prompt: string;
  readonly decision: AgentRouteDecisionTrace;
}): RouteAgentPromptResult {
  const trimmed = input.prompt.trim();
  const confirmation = looksLikeApplyConfirmation(trimmed);
  const reason = confirmation
    ? "override_ask_blocks_pending_apply"
    : "override_ask_readonly";
  const promptIntent: AgentPromptIntent = confirmation
    ? "ask"
    : classifyAgentPromptIntent(trimmed).intent;

  return {
    mode: "edit_existing_project",
    reason,
    execution: "consultation",
    intent: "consultation",
    promptIntent:
      promptIntent === "explain" ||
      promptIntent === "review" ||
      promptIntent === "analyze" ||
      promptIntent === "search"
        ? promptIntent
        : "ask",
    mixedEdit: false,
    blockedReason: null,
    activityNote: confirmation
      ? ASK_MODE_PENDING_BLOCK_EXPLANATION
      : ASK_MODE_READONLY_EXPLANATION,
    needsEmptyFolder: false,
    decision: {
      ...input.decision,
      selectedRoute: "consultation",
      selectionReason: reason,
      greenfieldRejected: true,
      greenfieldRejectReason: "ask_mode_readonly",
    },
  };
}
