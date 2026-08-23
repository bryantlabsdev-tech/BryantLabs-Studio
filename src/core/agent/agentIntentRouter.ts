import {
  looksLikeAuditPrompt,
  looksLikeEditExistingProjectPrompt,
  looksLikeRepairPrompt,
} from "@/core/agent/agentPromptPatterns";

const REFACTOR_PROMPT_PATTERNS: readonly RegExp[] = [
  /\brefactor\b/i,
  /\brestructure\b/i,
  /\breorganize\b/i,
  /\bclean\s+up\s+(the\s+)?(code|codebase|project|app)/i,
];

function looksLikeRefactorPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return REFACTOR_PROMPT_PATTERNS.some((re) => re.test(trimmed));
}

/** Fine-grained prompt intent — determines whether Apply Plan runs. */
export type AgentPromptIntent =
  | "explain"
  | "review"
  | "analyze"
  | "search"
  | "ask"
  | "edit"
  | "refactor"
  | "generate"
  | "run"
  | "terminal";

export interface ClassifyAgentPromptIntentResult {
  readonly intent: AgentPromptIntent;
  /** Explain/review-style request that also asks for code changes. */
  readonly mixedEdit: boolean;
  readonly reason: string;
}

const EXPLAIN_PATTERNS: readonly RegExp[] = [
  /\bexplain\b/i,
  /\bwalk\s+me\s+through\b/i,
  /\bwhat\s+does\s+(this|the)\b/i,
  /\bhow\s+does\s+(this|the)\b/i,
  /\bdescribe\s+(this|the|how)\b/i,
  /\btell\s+me\s+(about|how|what)\b/i,
  /\bhelp\s+me\s+understand\b/i,
];

const REVIEW_PATTERNS: readonly RegExp[] = [
  /\breview\b/i,
  /\bcode\s+review\b/i,
  /\bsuggest\s+(improvements?|changes?)\b/i,
  /\bfeedback\s+on\b/i,
  /\bany\s+issues?\s+with\b/i,
  /\bwhat\s+would\s+you\s+improve\b/i,
];

const ANALYZE_PATTERNS: readonly RegExp[] = [
  /\banaly[sz]e\b/i,
  /\baudit\b/i,
  /\binspect\b/i,
  /\bhealth\s+check\b/i,
  /\barchitecture\s+review\b/i,
  /\bcode\s+quality\b/i,
  /\bsecurity\s+review\b/i,
];

const SEARCH_PATTERNS: readonly RegExp[] = [
  /\bsearch\s+(for|the)\b/i,
  /\bfind\s+where\b/i,
  /\blocate\b/i,
  /\bwhere\s+is\b/i,
  /\bwhere\s+are\b/i,
  /\bgrep\s+for\b/i,
  /\blook\s+for\b/i,
];

const ASK_PATTERNS: readonly RegExp[] = [
  /^(what|how|why|when|who|which|can|could|should|is|are|do|does)\b/i,
  /\?\s*$/,
  /\bwhat\s+is\b/i,
  /\bhow\s+do\b/i,
  /\bwhy\s+does\b/i,
];

const GENERATE_PATTERNS: readonly RegExp[] = [
  /\bgenerate\b/i,
  /\bwrite\s+(a\s+)?new\b/i,
  /\bcreate\s+(a\s+)?new\s+(file|module|component|class|function|hook|utility)\b/i,
  /\bbuild\s+(a\s+)?(\w+\s+)*?(app|application|game|dashboard|website|tool)\b/i,
  /\bcreate\s+(a\s+)?(\w+\s+)*?(app|application|game|dashboard|website|tool)\b/i,
  /\bscaffold\b/i,
  /\bproduce\s+(a\s+)?new\b/i,
];

const RUN_PATTERNS: readonly RegExp[] = [
  /\brun\s+(the\s+)?(build|tests?|typecheck|lint|preview|dev\s+server)\b/i,
  /\brun\s+verification\b/i,
  /\bverify\s+(the\s+)?(build|project|app)\b/i,
  /\btypecheck\b/i,
  /\bnpm\s+run\s+(build|test|typecheck|lint|preview)\b/i,
];

const TERMINAL_PATTERNS: readonly RegExp[] = [
  /\bin\s+(the\s+)?terminal\b/i,
  /\bshell\s+command\b/i,
  /\bexecute\s+(the\s+)?command\b/i,
  /^npm\s+(install|ci|run)\b/i,
  /^npx\s+\S+/i,
  /^git\s+(status|diff|log|commit)\b/i,
];

const MIXED_EDIT_TAIL_PATTERNS: readonly RegExp[] = [
  /\band\s+(simplify|improve|refactor|update|change|fix|add|remove|rewrite|clean\s+up)\b/i,
  /\bthen\s+(simplify|improve|refactor|update|change|fix|add|remove|rewrite)\b/i,
  /\balso\s+(simplify|improve|refactor|update|change|fix|add|remove|rewrite)\b/i,
];

const CONSULTATION_INTENTS: readonly AgentPromptIntent[] = [
  "explain",
  "review",
  "analyze",
  "search",
  "ask",
];

export function intentEntersApplyPlan(intent: AgentPromptIntent): boolean {
  return intent === "edit" || intent === "refactor" || intent === "generate";
}

export function intentIsConsultation(intent: AgentPromptIntent): boolean {
  return CONSULTATION_INTENTS.includes(intent);
}

export function looksLikeApplyConfirmation(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 2) return false;
  return /^(yes|yep|yeah|sure|ok(?:ay)?|apply|do\s+it|go\s+ahead|please\s+apply|make\s+(those|the)\s+changes|proceed)\b[.!?\s]*$/i.test(
    trimmed,
  );
}

function matchesAny(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

function detectConsultationIntent(trimmed: string): AgentPromptIntent | null {
  if (matchesAny(EXPLAIN_PATTERNS, trimmed)) return "explain";
  if (matchesAny(REVIEW_PATTERNS, trimmed)) return "review";
  if (matchesAny(ANALYZE_PATTERNS, trimmed) || looksLikeAuditPrompt(trimmed)) {
    return "analyze";
  }
  if (matchesAny(SEARCH_PATTERNS, trimmed)) return "search";
  if (matchesAny(ASK_PATTERNS, trimmed)) return "ask";
  return null;
}

function detectMutationIntent(trimmed: string): AgentPromptIntent | null {
  if (looksLikeRepairPrompt(trimmed)) return "edit";
  if (looksLikeRefactorPrompt(trimmed)) return "refactor";
  if (matchesAny(GENERATE_PATTERNS, trimmed)) return "generate";
  if (looksLikeEditExistingProjectPrompt(trimmed)) return "edit";
  return null;
}

function detectOperationalIntent(trimmed: string): AgentPromptIntent | null {
  if (matchesAny(TERMINAL_PATTERNS, trimmed)) return "terminal";
  if (matchesAny(RUN_PATTERNS, trimmed)) return "run";
  return null;
}

function hasMixedEditSignal(trimmed: string): boolean {
  const consultation = detectConsultationIntent(trimmed);
  if (!consultation) return false;
  if (detectMutationIntent(trimmed)) return true;
  return matchesAny(MIXED_EDIT_TAIL_PATTERNS, trimmed);
}

export function classifyAgentPromptIntent(prompt: string): ClassifyAgentPromptIntentResult {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) {
    return { intent: "ask", mixedEdit: false, reason: "too_short" };
  }

  if (hasMixedEditSignal(trimmed)) {
    const consultation = detectConsultationIntent(trimmed) ?? "explain";
    return {
      intent: consultation,
      mixedEdit: true,
      reason: "mixed_consultation_and_edit",
    };
  }

  const operational = detectOperationalIntent(trimmed);
  if (operational) {
    return { intent: operational, mixedEdit: false, reason: `${operational}_keywords` };
  }

  const mutation = detectMutationIntent(trimmed);
  if (mutation) {
    return { intent: mutation, mixedEdit: false, reason: `${mutation}_keywords` };
  }

  const consultation = detectConsultationIntent(trimmed);
  if (consultation) {
    return { intent: consultation, mixedEdit: false, reason: `${consultation}_keywords` };
  }

  return { intent: "ask", mixedEdit: false, reason: "default_question" };
}

export function consultationPreviewLine(intent: AgentPromptIntent): string {
  switch (intent) {
    case "explain":
      return "Reading the code to explain it.";
    case "review":
      return "Reviewing the code and preparing suggestions.";
    case "analyze":
      return "Analyzing the project.";
    case "search":
      return "Searching the codebase.";
    case "ask":
      return "Answering your question.";
    case "run":
      return "Running the requested command.";
    case "terminal":
      return "Running the terminal command.";
    default:
      return "Working on your request.";
  }
}

export const MIXED_EDIT_CONFIRM_QUESTION =
  "Would you like me to apply these changes?";
