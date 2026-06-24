const REPAIR_PROMPT_PATTERNS: readonly RegExp[] = [
  /\bfix\b/i,
  /\berrors?\b/i,
  /\btype\s*script\b/i,
  /\bts\s+error/i,
  /\brepair\b/i,
  /\bdebug\b/i,
  /\bbroken\b/i,
  /\bfailing\b/i,
  /\bnot\s+working\b/i,
  /\bcompile\s+error/i,
  /\blint\s+error/i,
];

const EDIT_EXISTING_PROJECT_PATTERNS: readonly RegExp[] = [
  /\b(modify|improve|improvements?|update|enhance|refactor|upgrade|add|change|remove|make|style|persist)\b/i,
  /\badd\s+(a\s+)?features?\b/i,
  /\badd\s+(a\s+)?(\w+\s+)?(button|history|toggle|feature|component)\b/i,
  /\bcreate\s+(a\s+)?(\w+\s+)?component\b/i,
  /\badd\s+calculation\s+history\b/i,
  /\bexisting\b/i,
  /\bexisting\s+(\w+\s+)*?(project|app)\b/i,
  /\bfix\b/i,
  /\bthis\s+(app|project|game|sudoku|calculator|dashboard)\b/i,
];

const EDIT_DISAMBIGUATION_RE =
  /\b(existing|modify|improve|improvements?|update|enhance|refactor|upgrade|add|change|remove|make|style)\b/i;

const AUDIT_PROMPT_PATTERNS: readonly RegExp[] = [
  /\baudit\b/i,
  /\banaly[sz]e\s+(the\s+)?(code|codebase|project|app)/i,
  /\breview\s+(the\s+)?(code|codebase|project|app)/i,
  /\barchitecture\s+review/i,
  /\bhealth\s+check/i,
  /\bcode\s+quality/i,
  /\bsecurity\s+review/i,
];

const EXPLICIT_GREENFIELD_RESTART_PATTERNS: readonly RegExp[] = [
  /\bstart\s+over\b/i,
  /\bfrom\s+scratch\b/i,
  /\bnew\s+empty\s+folder\b/i,
  /\bcreate\s+another\b/i,
  /\banother\s+(app|application|project|game)\b/i,
  /\bin\s+a\s+new\s+folder\b/i,
  /\bscaffold\s+(a\s+)?new\b/i,
  /\bbuild\s+(a\s+)?new\s+app\b/i,
  /\bcreate\s+(a\s+)?new\s+project\b/i,
  /\bscaffold\s+(a\s+)?new\s+app\b/i,
  /\bbrand\s+new\b[\s\S]{0,40}\b(new\s+folder|in\s+a\s+new)\b/i,
];

export function looksLikeEditExistingProjectPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  const matchesEdit = EDIT_EXISTING_PROJECT_PATTERNS.some((re) => re.test(trimmed));
  if (!matchesEdit) return false;
  if (/\bfix\b/i.test(trimmed) && looksLikeRepairPrompt(trimmed)) {
    return EDIT_DISAMBIGUATION_RE.test(trimmed);
  }
  return true;
}

export function looksLikeRepairPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return REPAIR_PROMPT_PATTERNS.some((re) => re.test(trimmed));
}

export function looksLikeAuditPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return AUDIT_PROMPT_PATTERNS.some((re) => re.test(trimmed));
}

export function looksLikeExplicitGreenfieldRestart(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return EXPLICIT_GREENFIELD_RESTART_PATTERNS.some((re) => re.test(trimmed));
}
