import type { SymbolEntry } from "@/types";

/**
 * Suggest ghost-text suffix to complete the identifier or JSX tag at end of line prefix.
 * Returns only the suffix (not the full word) for Monaco inline completions.
 */
export function suggestInlineTabSuffix(
  linePrefix: string,
  symbols: readonly SymbolEntry[],
): string | null {
  const jsxMatch = linePrefix.match(/<([A-Z][A-Za-z0-9_]*)$/);
  if (jsxMatch) {
    const partial = jsxMatch[1] ?? "";
    if (partial.length < 1) return null;
    const partialLower = partial.toLowerCase();
    const component = symbols.find(
      (symbol) =>
        symbol.kind === "component" &&
        symbol.name.length > partial.length &&
        symbol.name.toLowerCase().startsWith(partialLower),
    );
    return component ? component.name.slice(partial.length) : null;
  }

  const wordMatch = linePrefix.match(/[A-Za-z_$][\w$]*$/);
  if (!wordMatch) return null;
  const partial = wordMatch[0];
  if (partial.length < 2) return null;
  const partialLower = partial.toLowerCase();

  let best: SymbolEntry | null = null;
  for (const symbol of symbols) {
    if (symbol.name.length <= partial.length) continue;
    if (!symbol.name.toLowerCase().startsWith(partialLower)) continue;
    if (
      !best ||
      symbol.name.length < best.name.length ||
      (symbol.path.startsWith("src/") && !best.path.startsWith("src/"))
    ) {
      best = symbol;
    }
  }
  return best ? best.name.slice(partial.length) : null;
}
