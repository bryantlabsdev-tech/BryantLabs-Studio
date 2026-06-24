import { isGameplayApplyPrompt } from "@/core/planApply/applyIntent";
import { isUiOnlyApplyPrompt } from "@/core/planApply/targetPolicy";
import type { ContextTaskType } from "@/core/contextEngine/types";

export function classifyContextTask(
  userPrompt: string,
  opts?: { explicit?: ContextTaskType },
): ContextTaskType {
  if (opts?.explicit) return opts.explicit;
  if (isUiOnlyApplyPrompt(userPrompt)) return "ui_edit";
  if (isGameplayApplyPrompt(userPrompt)) return "gameplay_edit";
  return "apply_plan";
}

export function isPremiumStylingPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return /\b(premium|polish|refine|modern|luxury|elevated|upscale|sophisticated)\b/.test(
    lower,
  );
}
