import { STRESS_PROMPTS, stressPromptById } from "./prompts";
import type { StressPromptDefinition, StressSuiteId } from "./types";

/** Curated fast-validation set — mixed difficulty, ~half the live runtime of the full suite. */
export const STRESS_PROMPTS_FAST_IDS = [
  "fleetops-pro",
  "medtrack-clinic",
  "legalcase-vault",
  "inventory-command",
  "schoolops-portal",
] as const;

export type StressFastPromptId = (typeof STRESS_PROMPTS_FAST_IDS)[number];

export interface StressSuiteTarget {
  readonly suiteId: StressSuiteId;
  readonly promptCount: number;
  readonly passTarget: number;
  readonly successRateTarget: number;
}

export function stressSuiteTarget(suiteId: StressSuiteId, promptCount: number): StressSuiteTarget {
  if (suiteId === "fast") {
    return {
      suiteId: "fast",
      promptCount,
      passTarget: 4,
      successRateTarget: 0.8,
    };
  }
  if (suiteId === "single") {
    return {
      suiteId: "single",
      promptCount: 1,
      passTarget: 1,
      successRateTarget: 1,
    };
  }
  return {
    suiteId: "full",
    promptCount,
    passTarget: 8,
    successRateTarget: 0.8,
  };
}

export function resolveStressPromptSelection(options: {
  readonly promptId?: string | null;
  readonly limit?: number | null;
  readonly fast?: boolean;
}): { readonly suiteId: StressSuiteId; readonly prompts: readonly StressPromptDefinition[] } {
  if (options.promptId) {
    const prompt = stressPromptById(options.promptId);
    if (!prompt) {
      throw new Error(`Unknown stress prompt id: ${options.promptId}`);
    }
    return { suiteId: "single", prompts: [prompt] };
  }

  if (options.fast || options.limit === 5) {
    const prompts = STRESS_PROMPTS_FAST_IDS.map((id) => stressPromptById(id)).filter(
      (p): p is StressPromptDefinition => p != null,
    );
    return { suiteId: "fast", prompts };
  }

  if (options.limit != null && options.limit > 0) {
    const prompts = STRESS_PROMPTS.slice(0, options.limit);
    const suiteId: StressSuiteId = options.limit >= STRESS_PROMPTS.length ? "full" : "single";
    return {
      suiteId: options.limit >= STRESS_PROMPTS.length ? "full" : suiteId,
      prompts,
    };
  }

  return { suiteId: "full", prompts: STRESS_PROMPTS };
}
