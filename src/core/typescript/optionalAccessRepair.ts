import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";

const TS18048_RE = /'([^']+)' is possibly 'undefined'/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parsePossiblyUndefinedSymbol(message: string): string | null {
  return message.match(TS18048_RE)?.[1] ?? null;
}

export function addNullishFallbackOnLine(line: string, symbolPath: string): string | null {
  if (line.includes(`${symbolPath} ??`) || line.includes(`${symbolPath}?`)) return null;

  const segments = symbolPath.split(".");
  const root = segments[0]!;
  const fallback =
    root === "part" || root === "record" || root === "item"
      ? '""'
      : root.endsWith("s")
        ? "[]"
        : "0";

  const methodRe = new RegExp(`\\b${escapeRegExp(symbolPath)}\\b(\\s*\\.\\w+)`);
  const methodMatch = line.match(methodRe);
  if (methodMatch) {
    const stringMethod = /^\s*\.(toLowerCase|toUpperCase|trim|slice|includes|startsWith|endsWith|match|replace)\b/.test(
      methodMatch[1]!,
    );
    const methodFallback = stringMethod ? '""' : fallback;
    return line.replace(methodRe, `(${symbolPath} ?? ${methodFallback})$1`);
  }

  const re = new RegExp(`\\b${escapeRegExp(symbolPath)}\\b(?!\\s*\\?\\.)`);
  if (!re.test(line)) return null;
  const wrap = /\|\||&&/.test(line);
  return line.replace(re, wrap ? `(${symbolPath} ?? ${fallback})` : `${symbolPath} ?? ${fallback}`);
}

export function applyOptionalAccessFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): { content: string; label: string } | null {
  if (diagnostic.code !== "TS18048") return null;
  const symbol = parsePossiblyUndefinedSymbol(diagnostic.message);
  if (!symbol) return null;

  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const fixed = addNullishFallbackOnLine(lines[idx]!, symbol);
  if (!fixed) return null;
  lines[idx] = fixed;
  return { content: lines.join("\n"), label: `added fallback for ${symbol}` };
}
