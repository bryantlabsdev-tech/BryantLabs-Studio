const FEATURE_VERB_RE =
  /\b(?:add|create|introduce|enable|implement)\s+(?:a\s+|an\s+|the\s+)?([a-z][\w\s-]{0,40})/i;

function trimFeaturePhrase(phrase: string): string {
  return phrase
    .replace(/\s+and\s+.*$/i, "")
    .replace(/\s+to\s+(?:the\s+)?(?:app|ui|project).*$/i, "")
    .trim();
}

function extractFeatureAction(prompt: string): string | null {
  const match = prompt.match(FEATURE_VERB_RE);
  if (!match?.[1]) return null;
  const feature = trimFeaturePhrase(match[1]);
  if (!feature || feature.length < 2) return null;
  return `Adding ${feature}`;
}

export function buildPlanPreviewLine(prompt: string): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const actions: string[] = [];

  const featureAction = extractFeatureAction(trimmed);
  if (featureAction) actions.push(featureAction);

  if (
    /\b(style|color|blue|red|green|theme|look|ui|layout|design|premium|polish)\b/i.test(
      lower,
    )
  ) {
    actions.push("updating UI");
  }

  if (/\bfix\b|\brepair\b|\bresolve\b|\bbroken\b/i.test(lower)) {
    actions.push("fixing issues");
  }

  if (/\bremove\b|\bdelete\b|\bdrop\b/i.test(lower) && !featureAction) {
    actions.push("removing code");
  }

  if (/\brefactor\b|\brestructure\b|\breorganize\b/i.test(lower)) {
    actions.push("refactoring code");
  }

  if (actions.length === 0) {
    actions.push("Applying changes");
  }

  actions.push("validating build");
  const unique = [...new Set(actions)];
  return `${unique.slice(0, 3).join(", ")}.`;
}
