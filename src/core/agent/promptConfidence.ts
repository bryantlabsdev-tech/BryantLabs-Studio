export interface PromptClarityInput {
  readonly hasAppContext: boolean;
  readonly hasProject: boolean;
}

export interface PromptClarityResult {
  readonly confidence: "high" | "low";
  readonly question?: string;
}

const VAGUE_ONLY_RE =
  /^(fix|help|yes|no|ok|sure|blue|red|green|hints?|timer|that|it|this)$/i;

const DESCRIPTIVE_RE =
  /\b(add|build|create|make|change|update|fix|remove|improve|style|enable|disable)\b/i;

export function assessPromptClarity(
  prompt: string,
  input: PromptClarityInput,
): PromptClarityResult {
  const trimmed = prompt.trim();
  if (trimmed.length < 2) {
    return {
      confidence: "low",
      question: "What would you like me to do?",
    };
  }

  if (input.hasAppContext || input.hasProject) {
    if (VAGUE_ONLY_RE.test(trimmed)) {
      return {
        confidence: "low",
        question:
          "What would you like me to change? For example, “Add product filters” or “Make the header blue”.",
      };
    }
    return { confidence: "high" };
  }

  if (VAGUE_ONLY_RE.test(trimmed)) {
    return {
      confidence: "low",
      question: "What would you like me to build or change?",
    };
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 2 && !DESCRIPTIVE_RE.test(trimmed)) {
    return {
      confidence: "low",
      question:
        "Could you describe what you want? For example, “Build a product comparison app” or “Add a dashboard summary”.",
    };
  }

  return { confidence: "high" };
}
