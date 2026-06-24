import { isUiAuditFixPrompt } from "@/core/agent/uiAuditAdvisoryUx";
import {
  isGameplayOrLogicPrompt,
  isFunctionalFeaturePrompt,
  isUiLayoutPrompt,
  isUiOnlyStylingPrompt,
} from "@/core/planner/fallback";

export type FollowUpPromptType =
  | "general"
  | "ui_audit_fix"
  | "ui_layout"
  | "functional"
  | "gameplay";

export function classifyFollowUpPromptType(prompt: string): FollowUpPromptType {
  if (isUiAuditFixPrompt(prompt)) return "ui_audit_fix";
  const lower = prompt.toLowerCase();
  if (isGameplayOrLogicPrompt(lower)) return "gameplay";
  if (isFunctionalFeaturePrompt(lower)) return "functional";
  if (isUiLayoutPrompt(lower)) return "ui_layout";
  return "general";
}

/** UI-only follow-ups eligible for styling allowlists and deterministic planner fallback. */
export function isUiOnlyFollowUpPrompt(prompt: string): boolean {
  if (isUiAuditFixPrompt(prompt)) return true;
  return isUiOnlyStylingPrompt(prompt);
}
