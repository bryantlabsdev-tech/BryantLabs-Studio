/** React hooks commonly emitted by greenfield page generators. */
export const REACT_HOOKS = [
  "useState",
  "useEffect",
  "useMemo",
  "useCallback",
  "useRef",
  "useReducer",
  "useContext",
  "useId",
  "useLayoutEffect",
] as const;

export function detectUsedReactHooks(content: string): string[] {
  const used: string[] = [];
  for (const hook of REACT_HOOKS) {
    if (new RegExp(`\\b${hook}\\s*[<(]`).test(content)) {
      used.push(hook);
    }
  }
  return used;
}

function parseReactNamedImports(line: string): string[] {
  const brace = line.match(/\{([^}]+)\}/);
  if (!brace?.[1]) return [];
  return brace[1]
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/\s+as\s+/)[0]!.trim());
}

function isReactImportLine(line: string): boolean {
  return /^\s*import\s+.*from\s+['"]react['"]\s*;?\s*$/.test(line);
}

/** Ensures all used React hooks are imported from "react". Idempotent. */
export function ensureReactHookImports(content: string): string | null {
  const needed = detectUsedReactHooks(content);
  if (needed.length === 0) return null;

  const lines = content.split("\n");
  let reactLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isReactImportLine(lines[i]!)) {
      reactLineIdx = i;
      break;
    }
  }

  const sorted = [...new Set(needed)].sort();

  if (reactLineIdx >= 0) {
    const line = lines[reactLineIdx]!;
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    const existing = parseReactNamedImports(line);
    const merged = [...new Set([...existing, ...sorted])].sort();
    const nextLine = `${indent}import { ${merged.join(", ")} } from "react";`;
    if (nextLine === line) return null;
    lines[reactLineIdx] = nextLine;
    return lines.join("\n");
  }

  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (/^\s*import\s+/.test(lines[i]!)) insertAt = i + 1;
    else if (insertAt > 0 && trimmed && !trimmed.startsWith("//")) break;
  }
  lines.splice(insertAt, 0, `import { ${sorted.join(", ")} } from "react";`);
  return lines.join("\n");
}

export function removeUnusedDefaultReactImport(
  content: string,
  symbol: string,
  line: string,
): string | null {
  if (symbol !== "React") return null;

  const mixed = line.match(
    /^(\s*)import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]+)\}\s+from\s+(['"].*['"])\s*;?\s*$/,
  );
  if (mixed && mixed[2] === symbol && /from\s+['"]react['"]/.test(line)) {
    const [, indent, , named, fromClause] = mixed;
    const trimmed = named!.trim();
    if (trimmed) return `${indent}import { ${trimmed} } from ${fromClause};`;
    return ensureReactHookImports(content.replace(line, "")) ?? "";
  }

  const simple = line.match(
    /^(\s*)import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"].*['"])\s*;?\s*$/,
  );
  if (simple && simple[2] === symbol && /from\s+['"]react['"]/.test(line)) {
    const [, indent, , fromClause] = simple;
    const hooks = detectUsedReactHooks(content);
    if (hooks.length > 0) {
      return `${indent}import { ${hooks.join(", ")} } from ${fromClause};`;
    }
    return "";
  }

  return null;
}

/** Fix common greenfield page pattern: default React import + bare hook calls. */
export function sanitizeGeneratedReactImports(content: string): string | null {
  let out = content;
  let changed = false;
  const lines = out.split("\n");
  const nextLines: string[] = [];

  for (const line of lines) {
    if (/^\s*import\s+React\b/.test(line) && /from\s+['"]react['"]/.test(line)) {
      const fixed = removeUnusedDefaultReactImport(out, "React", line);
      if (fixed != null && fixed !== line) {
        changed = true;
        if (fixed !== "") nextLines.push(fixed);
        continue;
      }
    }
    nextLines.push(line);
  }

  out = nextLines.join("\n");
  const hooksFixed = ensureReactHookImports(out);
  if (hooksFixed) {
    out = hooksFixed;
    changed = true;
  }
  return changed ? out : null;
}
