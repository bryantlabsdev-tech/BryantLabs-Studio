/**
 * Provider-backed inline tab completion (ghost text after local symbol index).
 */

export interface InlineSuggestContext {
  readonly relPath: string;
  readonly languageId: string;
  readonly linePrefix: string;
  readonly lineSuffix: string;
}

export function buildInlineSuggestPrompt(ctx: InlineSuggestContext): string {
  return `You are a code completion assistant. Return ONLY the text to insert at the cursor — the continuation suffix, not the full line. No markdown, quotes, or explanation. Keep it under 80 characters. Return an empty string if no useful completion exists.

File: ${ctx.relPath}
Language: ${ctx.languageId}
Before cursor: ${JSON.stringify(ctx.linePrefix)}
After cursor: ${JSON.stringify(ctx.lineSuffix)}`;
}

/** Extract insertable suffix from a provider response. */
export function parseInlineSuggestResponse(
  text: string,
  linePrefix: string,
): string | null {
  let trimmed = text.trim();
  if (!trimmed) return null;

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    trimmed = trimmed.slice(1, -1);
  }

  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine || firstLine.length > 120) return null;
  if (linePrefix.endsWith(firstLine)) return null;
  if (firstLine.includes("\n")) return null;

  return firstLine;
}
