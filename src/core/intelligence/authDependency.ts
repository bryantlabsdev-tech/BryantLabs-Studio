/**
 * Shared authentication / infrastructure dependency detection.
 * Used by feasibility gating, project facts, planner intents, and complexity routing.
 *
 * Game-local features (timer, hints, difficulty, etc.) never imply auth.
 * Negated instructions ("do not add auth") are stripped before matching.
 */

export interface DependencyPattern {
  readonly id: string;
  readonly re: RegExp;
}

export interface DependencyMatch {
  readonly required: boolean;
  readonly ruleId: string | null;
  readonly pattern: string | null;
}

/** Strip negated infrastructure instructions before dependency analysis. */
export function stripInfrastructureExclusions(prompt: string): string {
  let text = prompt;
  const stripPatterns = [
    /\b(?:do\s+not|don't|don\s*'\s*t|never|without|no)\s+(?:add\s+)?(?:any\s+)?(?:backend|auth(?:entication)?|api(?:\s+calls?)?)(?:\s*,\s*(?:or\s+)?(?:backend|auth(?:entication)?|api(?:\s+calls?)?))*\b[^.;\n]*/gi,
    /\b(?:avoid|skip|exclude)\s+(?:adding\s+)?(?:backend|auth(?:entication)?|api(?:\s+calls?)?)[^.;\n]*/gi,
  ];
  for (const re of stripPatterns) {
    text = text.replace(re, " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function firstPatternMatch(
  patterns: readonly DependencyPattern[],
  text: string,
): DependencyMatch {
  for (const { id, re } of patterns) {
    if (re.test(text)) {
      return { required: true, ruleId: id, pattern: re.source };
    }
  }
  return { required: false, ruleId: null, pattern: null };
}

/** Login, accounts, OAuth, protected routes, admin — not bare "auth". */
export const AUTH_INFRASTRUCTURE_PATTERNS: readonly DependencyPattern[] = [
  { id: "login", re: /\b(?:add\s+)?login\b|\blog\s*in\b/i },
  { id: "signup", re: /\bsign\s*up\b|\bsignup\b/i },
  { id: "register", re: /\bregister(?:\s+(?:account|user))?\b/i },
  { id: "user_accounts", re: /\buser\s+accounts?\b/i },
  { id: "profiles", re: /\bprofiles?\b/i },
  { id: "oauth", re: /\boauth\b/i },
  { id: "protected_routes", re: /\bprotected\s*routes?\b/i },
  { id: "admin_roles", re: /\badmin\s*roles?\b|\badmin\s*panel\b|\brole\s*based\b/i },
];

export const CLOUD_SAVE_PATTERNS: readonly DependencyPattern[] = [
  { id: "cloud_save", re: /\bcloud\s*(?:save|sync|progress)\b/i },
  { id: "saved_cloud_progress", re: /\bsaved\s+cloud\s+progress\b/i },
  { id: "remote_save", re: /\b(?:remote|online)\s*save\b/i },
];

export const PAYMENT_PATTERNS: readonly DependencyPattern[] = [
  { id: "payments", re: /\bpayments?\b/i },
  { id: "checkout", re: /\bcheckout\b/i },
  { id: "stripe", re: /\bstripe\b/i },
  { id: "subscription", re: /\bsubscription\b/i },
  { id: "billing", re: /\bbilling\b/i },
];

export const LOCAL_PERSISTENCE_PATTERNS: readonly DependencyPattern[] = [
  { id: "local_storage", re: /\blocal\s*storage\b/i },
  { id: "persist_locally", re: /\bpersist(?:ence)?\s+(?:locally|to\s+local)\b/i },
  { id: "save_locally", re: /\bsave\s+(?:progress|state|game)\s+locally\b/i },
  { id: "store_locally", re: /\bstore\s+(?:progress|state|game)\s+locally\b/i },
];

/** Local game UX — never imply authentication on their own. */
export const AUTH_GAME_LOCAL_PATTERNS: readonly RegExp[] = [
  /\btimer\b/i,
  /\bhints?\b/i,
  /\bdifficulty\b/i,
  /\bnew\s+game\b/i,
  /\bmistake\s*counter\b/i,
  /\bhighlights?\b/i,
  /\bwin\s*message\b/i,
  /\bstatistics?\b/i,
  /\bbest\s*time\b/i,
  /\bscoreboard\b/i,
  /\bleaderboard\b/i,
];

function analyzedPrompt(prompt: string): string {
  return stripInfrastructureExclusions(prompt.trim());
}

export function matchAuthenticationDependency(prompt: string): DependencyMatch {
  const text = analyzedPrompt(prompt);
  if (!text) return { required: false, ruleId: null, pattern: null };
  return firstPatternMatch(AUTH_INFRASTRUCTURE_PATTERNS, text);
}

export function matchCloudSaveDependency(prompt: string): DependencyMatch {
  const text = analyzedPrompt(prompt);
  if (!text) return { required: false, ruleId: null, pattern: null };
  return firstPatternMatch(CLOUD_SAVE_PATTERNS, text);
}

export function matchPaymentDependency(prompt: string): DependencyMatch {
  const text = analyzedPrompt(prompt);
  if (!text) return { required: false, ruleId: null, pattern: null };
  return firstPatternMatch(PAYMENT_PATTERNS, text);
}

export function matchLocalPersistenceDependency(prompt: string): DependencyMatch {
  const text = analyzedPrompt(prompt);
  if (!text) return { required: false, ruleId: null, pattern: null };
  return firstPatternMatch(LOCAL_PERSISTENCE_PATTERNS, text);
}

export function promptRequiresAuthentication(prompt: string): boolean {
  return matchAuthenticationDependency(prompt).required;
}

export function promptRequiresCloudSave(prompt: string): boolean {
  return matchCloudSaveDependency(prompt).required;
}

export function promptRequiresPayments(prompt: string): boolean {
  return matchPaymentDependency(prompt).required;
}

export function promptRequiresLocalPersistence(prompt: string): boolean {
  return matchLocalPersistenceDependency(prompt).required;
}

/** True when any corpus line explicitly requests auth infrastructure (not negated). */
export function textMentionsAuthenticationInfrastructure(text: string): boolean {
  return matchAuthenticationDependency(text).required;
}
