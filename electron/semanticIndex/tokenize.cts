const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "is",
  "it",
  "as",
  "at",
  "by",
  "with",
  "from",
  "this",
  "that",
  "be",
  "are",
  "was",
  "were",
  "const",
  "let",
  "var",
  "function",
  "return",
  "import",
  "export",
  "default",
]);

/** Lowercase alphanumeric tokens for TF-IDF indexing. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const parts = text.toLowerCase().split(/[^a-z0-9_]+/);
  for (const part of parts) {
    if (part.length < 2 || STOP.has(part)) continue;
    tokens.push(part);
  }
  return tokens;
}
