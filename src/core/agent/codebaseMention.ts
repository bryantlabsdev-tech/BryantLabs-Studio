/** Cursor-style @codebase pin — semantic / relevance search over the open project. */

export const CODEBASE_MENTION = "codebase";

const CODEBASE_MENTION_RE = /@codebase\b/i;

export function hasCodebaseMention(prompt: string): boolean {
  return CODEBASE_MENTION_RE.test(prompt);
}

export function stripCodebaseMention(prompt: string): string {
  return prompt.replace(CODEBASE_MENTION_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function promptForCodebaseSearch(prompt: string): string {
  const stripped = stripCodebaseMention(prompt);
  return stripped.length > 0 ? stripped : prompt.trim();
}
