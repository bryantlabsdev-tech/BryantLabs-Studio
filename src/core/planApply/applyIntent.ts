import {
  isGameplayOrLogicPrompt,
  isFunctionalFeaturePrompt,
  isUiOnlyStylingPrompt,
} from "@/core/planner/fallback";

export type ApplyRoutingIntent = "feature_addition" | "small_ui";

export type ApplyRoutingReason =
  | "gameplay_keywords"
  | "functional_keywords"
  | "styling_keywords"
  | "default_full_apply";

export interface ApplyIntentClassification {
  readonly intent: ApplyRoutingIntent;
  readonly reason: ApplyRoutingReason;
  readonly gameplay: boolean;
}

/** Classify follow-up / apply-plan routing from the user prompt. */
export function classifyApplyIntent(prompt: string): ApplyIntentClassification {
  const lower = prompt.toLowerCase();
  if (isGameplayOrLogicPrompt(lower)) {
    return {
      intent: "feature_addition",
      reason: "gameplay_keywords",
      gameplay: true,
    };
  }
  if (isFunctionalFeaturePrompt(lower)) {
    return {
      intent: "feature_addition",
      reason: "functional_keywords",
      gameplay: false,
    };
  }
  if (isUiOnlyStylingPrompt(prompt)) {
    return {
      intent: "small_ui",
      reason: "styling_keywords",
      gameplay: false,
    };
  }
  return {
    intent: "feature_addition",
    reason: "default_full_apply",
    gameplay: false,
  };
}

export function isGameplayApplyPrompt(prompt: string): boolean {
  return classifyApplyIntent(prompt).gameplay;
}

export function isSmallUiApplyPrompt(prompt: string): boolean {
  return classifyApplyIntent(prompt).intent === "small_ui";
}
