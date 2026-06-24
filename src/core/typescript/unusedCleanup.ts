/** Automatic cleanup for TS6133 (unused locals / imports / parameters). */

import {
  detectUsedReactHooks,
  ensureReactHookImports,
  removeUnusedDefaultReactImport,
} from "@/core/typescript/reactHookImports";

export interface UnusedDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export function extractUnusedSymbol(message: string): string | null {
  const valueUnread = message.match(/^'([^']+)' is declared but its value is never read\.?$/);
  if (valueUnread?.[1]) return valueUnread[1];
  const neverUsed = message.match(/^'([^']+)' is declared but never used\.?$/);
  return neverUsed?.[1] ?? null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineAt(content: string, lineNumber: number): string | null {
  const lines = content.split("\n");
  const idx = lineNumber - 1;
  return idx >= 0 && idx < lines.length ? lines[idx]! : null;
}

function removeNamedImportFromLine(line: string, symbol: string): string | null {
  const match = line.match(/^(\s*)import\s+\{([^}]+)\}\s+from\s+(['"].*['"])\s*;?\s*$/);
  if (!match) return null;
  const [, indent, inner, fromClause] = match;
  const parts = inner!.split(",").map((p) => p.trim()).filter(Boolean);
  const filtered = parts.filter((part) => {
    const bare = part.split(/\s+as\s+/)[0]!.trim();
    return bare !== symbol;
  });
  if (filtered.length === parts.length) return null;
  if (filtered.length === 0) return "";
  return `${indent}import { ${filtered.join(", ")} } from ${fromClause};`;
}

function removeDefaultImportFromLine(line: string, symbol: string): string | null {
  const match = line.match(
    /^(\s*)import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"].*['"])\s*;?\s*$/,
  );
  if (!match || match[2] !== symbol) return null;
  return "";
}

function removeTypeImportFromLine(line: string, symbol: string): string | null {
  const match = line.match(
    /^(\s*)import\s+type\s+\{([^}]+)\}\s+from\s+(['"].*['"])\s*;?\s*$/,
  );
  if (!match) return null;
  return removeNamedImportFromLine(
    `${match[1]}import {${match[2]}} from ${match[3]};`,
    symbol,
  );
}

function removeNamespaceImportFromLine(line: string, symbol: string): string | null {
  const match = line.match(
    /^(\s*)import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(['"].*['"])\s*;?\s*$/,
  );
  if (!match || match[2] !== symbol) return null;
  return "";
}

export function removeUnusedImportLine(content: string, symbol: string): string | null {
  const lines = content.split("\n");
  let changed = false;
  const next = lines.map((line) => {
    const reactFixed = removeUnusedDefaultReactImport(content, symbol, line);
    if (reactFixed != null && reactFixed !== line) {
      changed = true;
      return reactFixed;
    }
    const updated =
      removeNamedImportFromLine(line, symbol) ??
      removeDefaultImportFromLine(line, symbol) ??
      removeTypeImportFromLine(line, symbol) ??
      removeNamespaceImportFromLine(line, symbol);
    if (updated != null && updated !== line) {
      changed = true;
      return updated;
    }
    return line;
  });
  if (!changed) return null;
  let joined = next.filter((line, i, arr) => !(line === "" && arr[i + 1] === "")).join("\n");
  if (symbol === "React") {
    const hooksFixed = ensureReactHookImports(joined);
    if (hooksFixed) joined = hooksFixed;
  }
  return joined;
}

function isUnsafeToRemoveUnusedDeclaration(line: string, symbol: string): boolean {
  if (/\bfor\s*\(/.test(line)) return true;
  if (/\bwhile\s*\(/.test(line)) return true;
  if (/\bcatch\s*\(/.test(line)) return true;
  if (/=>/.test(line) && line.includes(symbol)) return true;
  if (/\b(?:function|class)\b/.test(line) && line.includes("(")) return true;
  return false;
}

function removeUnusedArrayDestructuringOnLine(line: string, symbol: string): string | null {
  const match = line.match(
    /^(\s*)(?:const|let)\s+\[([^\]]+)\](\s*:[^=]+)?\s*=\s*(.+);?\s*$/,
  );
  if (!match) return null;
  const [, indent, inner, typeAnn = "", rhs] = match;
  const parts = inner!.split(",").map((p) => p.trim()).filter(Boolean);
  let changed = false;
  const nextParts = parts.map((part) => {
    const bare = part.split(/\s*:/)[0]!.trim();
    if (bare !== symbol) return part;
    if (bare.startsWith("_")) return part;
    changed = true;
    return `_${bare}`;
  });
  if (!changed) return null;
  return `${indent}const [${nextParts.join(", ")}]${typeAnn} = ${rhs};`;
}

function removeUnusedLocalOnLine(line: string, symbol: string): string | null {
  const arrayFixed = removeUnusedArrayDestructuringOnLine(line, symbol);
  if (arrayFixed != null) return arrayFixed;

  const singleBinding = new RegExp(
    `^(\\s*)(?:const|let)\\s+${escapeRegExp(symbol)}\\b(?:\\s*:[^=;]+)?\\s*=\\s*[^;]+;\\s*$`,
  );
  if (singleBinding.test(line)) return "";

  const singleDecl = new RegExp(
    `^(\\s*)(?:const|let)\\s+${escapeRegExp(symbol)}\\b(?:\\s*:[^;]+)?\\s*;\\s*$`,
  );
  if (singleDecl.test(line)) return "";

  const destructure = line.match(
    /^(\s*)(?:const|let)\s+\{([^}]+)\}(\s*:\s*[^=]+)?\s*=\s*(.+);?\s*$/,
  );
  if (destructure) {
    const [, indent, inner, typeAnn = "", rhs] = destructure;
    const parts = inner!.split(",").map((p) => p.trim()).filter(Boolean);
    const filtered = parts.filter((part) => {
      const bare = part.split(/\s*:/)[0]!.split(/\s+as\s+/)[0]!.trim();
      return bare !== symbol;
    });
    if (filtered.length === parts.length) return null;
    if (filtered.length === 0) return "";
    return `${indent}const { ${filtered.join(", ")} }${typeAnn} = ${rhs};`;
  }

  return null;
}

function removeUnusedFunctionDeclaration(
  content: string,
  lineNumber: number,
  symbol: string,
): string | null {
  const line = lineAt(content, lineNumber);
  if (!line || !new RegExp(`\\bfunction\\s+${escapeRegExp(symbol)}\\b`).test(line)) {
    return null;
  }
  return removeUnusedDeclarationBlock(content, lineNumber, symbol);
}

function removeUnusedDeclarationBlock(
  content: string,
  lineNumber: number,
  symbol: string,
): string | null {
  const lines = content.split("\n");
  const idx = lineNumber - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx]!;
  if (!line.includes(symbol)) return null;

  const fnStart = idx;
  let end = idx;
  if (/\bfunction\b/.test(line) || /=>\s*\{/.test(line) || /\{\s*$/.test(line)) {
    let depth = 0;
    for (let i = idx; i < lines.length; i++) {
      const l = lines[i]!;
      for (const ch of l) {
        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;
      }
      end = i;
      if (depth <= 0 && i > idx) break;
    }
  }

  const next = [...lines.slice(0, fnStart), ...lines.slice(end + 1)];
  return next.join("\n");
}

function removeUnusedParameterOnLine(line: string, symbol: string): string | null {
  const fnMatch = line.match(/^(\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*)\(([^)]*)\)/);
  if (fnMatch) {
    const [, head, params] = fnMatch;
    const nextParams = removeParamFromList(params!, symbol);
    if (nextParams == null) return null;
    return line.replace(fnMatch[0], `${head}(${nextParams})`);
  }

  const arrowMatch = line.match(/^(\s*(?:const|let)\s+\w+\s*=\s*(?:async\s+)?)\(([^)]*)\)\s*=>/);
  if (arrowMatch) {
    const [, head, params] = arrowMatch;
    const nextParams = removeParamFromList(params!, symbol);
    if (nextParams == null) return null;
    return line.replace(arrowMatch[0], `${head}(${nextParams}) =>`);
  }

  return null;
}

function removeParamFromList(params: string, symbol: string): string | null {
  const parts = splitTopLevelParams(params);
  const filtered = parts.filter((part) => {
    const bare = part.trim().split(/\s*:/)[0]!.split(/\s*=/)[0]!.trim();
    return bare !== symbol;
  });
  if (filtered.length === parts.length) return null;
  return filtered.join(", ");
}

function splitTopLevelParams(params: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of params) {
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function removeCatchBinding(line: string, symbol: string): string | null {
  const catchMatch = line.match(new RegExp(`\\bcatch\\s*\\(\\s*${escapeRegExp(symbol)}\\s*\\)`));
  if (!catchMatch) return null;
  return line.replace(catchMatch[0], "catch");
}

/** Fix `(e) => e.id !== e.id` when param `id` was meant on the RHS (common AI typo). */
function fixSelfComparisonFilterLine(line: string, symbol: string): string | null {
  const re = new RegExp(
    `(\\w+)\\.${escapeRegExp(symbol)}\\s*!==\\s*\\1\\.${escapeRegExp(symbol)}`,
  );
  if (!re.test(line)) return null;
  return line.replace(re, `$1.${symbol} !== ${symbol}`);
}

function prefixUnusedParameterOnLine(line: string, symbol: string): string | null {
  if (symbol.startsWith("_")) return null;

  const arrowAssign = line.match(/^(\s*(?:const|let)\s+\w+\s*=\s*)\(([^)]*)\)(\s*=>)/);
  if (arrowAssign) {
    const [, head, params, tail] = arrowAssign;
    const nextParams = prefixSymbolInParamList(params!, symbol);
    if (nextParams != null) {
      return line.replace(arrowAssign[0], `${head}(${nextParams})${tail}`);
    }
  }

  const fnMatch = line.match(/^(\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*)\(([^)]*)\)/);
  if (fnMatch) {
    const [, head, params] = fnMatch;
    const nextParams = prefixSymbolInParamList(params!, symbol);
    if (nextParams != null) {
      return line.replace(fnMatch[0], `${head}(${nextParams})`);
    }
  }

  return null;
}

function prefixSymbolInParamList(params: string, symbol: string): string | null {
  const parts = splitTopLevelParams(params);
  let changed = false;
  const next = parts.map((part) => {
    const bare = part.trim().split(/\s*:/)[0]!.split(/\s*=/)[0]!.trim();
    if (bare !== symbol || bare.startsWith("_")) return part;
    changed = true;
    return part.replace(new RegExp(`^\\s*${escapeRegExp(symbol)}\\b`), `_${symbol}`);
  });
  return changed ? next.join(", ") : null;
}

/**
 * Apply a single TS6133 fix. Prefers removal over leaving dead bindings.
 * Returns null when no safe automatic fix exists.
 */
export function applyUnusedSymbolFix(
  content: string,
  diagnostic: UnusedDiagnostic,
): { content: string; label: string } | null {
  const symbol = extractUnusedSymbol(diagnostic.message);
  if (!symbol) return null;

  const importFixed = removeUnusedImportLine(content, symbol);
  if (importFixed != null) {
    const label =
      symbol === "React" && detectUsedReactHooks(importFixed).length > 0
        ? "converted unused React import to hooks"
        : `removed unused import ${symbol}`;
    return { content: importFixed, label };
  }

  const line = lineAt(content, diagnostic.line);
  if (!line) return null;

  const selfComparisonFixed = fixSelfComparisonFilterLine(line, symbol);
  if (selfComparisonFixed != null) {
    const lines = content.split("\n");
    lines[diagnostic.line - 1] = selfComparisonFixed;
    return { content: lines.join("\n"), label: `fixed self-comparison for ${symbol}` };
  }

  const localRemoved = removeUnusedLocalOnLine(line, symbol);
  if (localRemoved != null) {
    const lines = content.split("\n");
    lines[diagnostic.line - 1] = localRemoved;
    const next = lines
      .filter((l, i, arr) => !(l === "" && arr[i + 1] === ""))
      .join("\n")
      .replace(/^\n+/, "");
    return { content: next, label: `removed unused ${symbol}` };
  }

  const fnRemoved = removeUnusedFunctionDeclaration(content, diagnostic.line, symbol);
  if (fnRemoved != null) {
    return { content: fnRemoved, label: `removed unused function ${symbol}` };
  }

  if (!isUnsafeToRemoveUnusedDeclaration(line, symbol)) {
    const blockRemoved = removeUnusedDeclarationBlock(content, diagnostic.line, symbol);
    if (blockRemoved != null) {
      return { content: blockRemoved, label: `removed unused ${symbol}` };
    }
  }

  const paramRemoved = removeUnusedParameterOnLine(line, symbol);
  if (paramRemoved != null) {
    const lines = content.split("\n");
    lines[diagnostic.line - 1] = paramRemoved;
    return { content: lines.join("\n"), label: `removed unused parameter ${symbol}` };
  }

  const paramPrefixed = prefixUnusedParameterOnLine(line, symbol);
  if (paramPrefixed != null) {
    const lines = content.split("\n");
    lines[diagnostic.line - 1] = paramPrefixed;
    return { content: lines.join("\n"), label: `prefixed unused parameter ${symbol} with _` };
  }

  const catchFixed = removeCatchBinding(line, symbol);
  if (catchFixed != null) {
    const lines = content.split("\n");
    lines[diagnostic.line - 1] = catchFixed;
    return { content: lines.join("\n"), label: `removed unused catch binding ${symbol}` };
  }

  return null;
}

function pathsMatch(diagPath: string, targetPath: string): boolean {
  const a = diagPath.replace(/\\/g, "/");
  const b = targetPath.replace(/\\/g, "/");
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

export function applyUnusedCleanupToFile(
  content: string,
  diagnostics: readonly UnusedDiagnostic[],
  filePath: string,
): { content: string; fixes: string[] } | null {
  const normalized = filePath.replace(/\\/g, "/");
  const fileDiags = diagnostics
    .filter((d) => pathsMatch(d.file, normalized))
    .sort((a, b) => b.line - a.line);

  if (fileDiags.length === 0) return null;

  let next = content;
  const fixes: string[] = [];
  for (const diagnostic of fileDiags) {
    const result = applyUnusedSymbolFix(next, diagnostic);
    if (!result) continue;
    next = result.content;
    fixes.push(result.label);
  }

  if (fixes.length === 0 || next === content) return null;
  return { content: next, fixes };
}
