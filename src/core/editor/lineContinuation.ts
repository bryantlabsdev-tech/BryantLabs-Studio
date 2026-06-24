import { suggestInlineTabSuffix } from "@/core/editor/inlineTabSuggest";
import type { SymbolEntry } from "@/types";

/**
 * Local line-continuation suggestions (imports, brackets, symbol suffixes).
 * Used for ghost-text before optional AI completion.
 */
export function suggestLineContinuation(
  linePrefix: string,
  symbols: readonly SymbolEntry[],
): string | null {
  const symbolSuffix = suggestInlineTabSuffix(linePrefix, symbols);
  if (symbolSuffix) return symbolSuffix;

  const importMatch = linePrefix.match(/import\s+\{\s*([A-Za-z0-9_,\s]*)$/);
  if (importMatch) {
    const partial = importMatch[1]?.split(",").pop()?.trim() ?? "";
    if (partial.length >= 1) {
      const partialLower = partial.toLowerCase();
      const hit = symbols.find(
        (symbol) =>
          symbol.name.length > partial.length &&
          symbol.name.toLowerCase().startsWith(partialLower),
      );
      if (hit) return hit.name.slice(partial.length);
    }
  }

  const openBraces = (linePrefix.match(/\{/g) ?? []).length;
  const closeBraces = (linePrefix.match(/\}/g) ?? []).length;
  if (openBraces > closeBraces && /\{[^{}]*$/.test(linePrefix)) {
    return "}";
  }

  const openParens = (linePrefix.match(/\(/g) ?? []).length;
  const closeParens = (linePrefix.match(/\)/g) ?? []).length;
  if (openParens > closeParens && /\([^()]*$/.test(linePrefix)) {
    return ")";
  }

  return null;
}
