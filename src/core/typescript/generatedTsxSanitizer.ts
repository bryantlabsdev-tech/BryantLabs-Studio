import { sanitizeGeneratedReactImports } from "@/core/typescript/reactHookImports";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prefix unused useState setters so strict TS passes without a repair pass. */
export function prefixUnusedUseStateSetters(content: string): string | null {
  const declRe = /const\s+\[\s*(\w+)\s*,\s*(set[A-Za-z]\w*)\s*\]\s*=\s*useState/g;
  let changed = false;
  let next = content;
  const seen = new Set<string>();

  for (const match of content.matchAll(declRe)) {
    const setter = match[2]!;
    if (setter.startsWith("_") || seen.has(setter)) continue;
    seen.add(setter);
    const uses = (
      next.match(new RegExp(`\\b${escapeRegExp(setter)}\\b`, "g")) ?? []
    ).length;
    if (uses > 1) continue;
    next = next.replace(
      new RegExp(`(const\\s+\\[\\s*\\w+\\s*,\\s*)${escapeRegExp(setter)}(\\s*\\]\\s*=\\s*useState)`, "g"),
      `$1_${setter}$2`,
    );
    changed = true;
  }

  return changed ? next : null;
}

/** Pre-write cleanup for generated .tsx sources. */
export function sanitizeGeneratedTsxSource(content: string): string | null {
  let out = content;
  let changed = false;

  const react = sanitizeGeneratedReactImports(out);
  if (react) {
    out = react;
    changed = true;
  }

  const setters = prefixUnusedUseStateSetters(out);
  if (setters) {
    out = setters;
    changed = true;
  }

  return changed ? out : null;
}
