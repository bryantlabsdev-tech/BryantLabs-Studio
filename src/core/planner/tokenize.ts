/**
 * Prompt tokenization. Deterministic: lowercase, split on non-alphanumerics,
 * drop stopwords and very short tokens. No stemming, no models.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "in",
  "on",
  "and",
  "or",
  "with",
  "into",
  "from",
  "by",
  "is",
  "are",
  "be",
  "it",
  "this",
  "that",
  "my",
  "our",
  "your",
  // Imperative verbs that carry little targeting signal on their own.
  "add",
  "create",
  "make",
  "build",
  "fix",
  "update",
  "change",
  "implement",
  "support",
  "enable",
  "new",
  "please",
  "want",
  "need",
  "should",
  "can",
  "let",
]);

export function tokenize(prompt: string): string[] {
  const raw = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const token of raw) {
    if (token.length < 2) continue;
    if (STOPWORDS.has(token)) continue;
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}
