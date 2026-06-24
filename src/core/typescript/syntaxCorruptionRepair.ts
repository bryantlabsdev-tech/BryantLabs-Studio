/** Repair Record literals corrupted by bad missing-property insertion. */
export function repairCorruptedRecordLiteral(content: string): string | null {
  let next = content;

  next = next.replace(
    /(^\s*[\w"']+:\s*'[^']*')\s*\n(\s*)return\s+([^;]+);,/gm,
    "$1\n$2};\n$2return $3;",
  );

  next = next.replace(/return\s+([^;]+);,\s*\n/g, "return $1;\n");

  next = next.replace(
    /return\s+([^;]+);,\s*\n(?:\s*[\w]+:\s*"",\s*\n)+\s*\}/g,
    "return $1;\n}",
  );

  next = next.replace(
    /(\{[^{}]*),\s*\n(\s*\w[\w]*:\s*"",\s*\n)+(\s*\})/g,
    "$1$3",
  );

  return next === content ? null : next;
}

export function repairOrphanObjectLiteralLines(content: string): string | null {
  const lines = content.split("\n");
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*return\s+.+;\s*$/.test(lines[i]!)) continue;
    while (i + 1 < lines.length && /^\s*[\w"'].*:\s*.+,\s*$/.test(lines[i + 1]!)) {
      lines.splice(i + 1, 1);
      changed = true;
    }
  }

  return changed ? lines.join("\n") : null;
}

export function repairBrokenNullishMethodCalls(content: string): string | null {
  let next = content.replace(
    /(\b[\w.]+\b)\s*\?\?\s*(\d+)(\.[A-Za-z_$][\w$]*\()/g,
    "($1 ?? $2)$3",
  );
  next = next.replace(
    /(\b[\w.]+\b)\s*\?\?\s*(""|'')\s*\.fixed/g,
    "($1 ?? 0).toFixed",
  );
  return next === content ? null : next;
}

export function repairMixedLogicalNullish(content: string): string | null {
  const next = content.replace(
    /(\|\|\s*)([A-Za-z_$][\w$.]*)\s*\?\?\s*(""|''|\d+)/g,
    "$1($2 ?? $3)",
  );
  return next === content ? null : next;
}

/** Fix `(x ?? "").toLowerCase()` misparsed as `x ?? "".toLowerCase()`. */
export function repairNullishBeforeMethodCall(content: string): string | null {
  let next = content.replace(
    /(\b[A-Za-z_$][\w$.]*)\s*\?\?\s*(""|'')\s*\.(toLowerCase|toUpperCase|trim|slice|includes)\b/g,
    "($1 ?? $2).$3",
  );
  next = next.replace(
    /(\b[A-Za-z_$][\w$.]*)\s*\?\?\s*(\d+)\s*\.(toFixed)\b/g,
    "($1 ?? $2).$3",
  );
  next = next.replace(
    /\((\b[A-Za-z_$][\w$.]*)\s*\?\?\s*0\)\s*\.(toLowerCase|toUpperCase|trim|slice|includes|startsWith|endsWith)\b/g,
    '($1 ?? "").$2',
  );
  return next === content ? null : next;
}

export function repairDuplicateImports(content: string): string | null {
  const lines = content.split("\n");
  const seen = new Set<string>();
  let changed = false;
  const next: string[] = [];
  for (const line of lines) {
    if (/^\s*import\s+/.test(line)) {
      const key = line.replace(/\/\/.*$/, "").trim();
      if (seen.has(key)) {
        changed = true;
        continue;
      }
      seen.add(key);
    }
    next.push(line);
  }
  return changed ? next.join("\n") : null;
}

export function stripInjectedReactInternalObjectProperties(content: string): string | null {
  let next = content
    .replace(/,\s*\n\s*\$\$typeof:\s*""\s*\n/g, "\n")
    .replace(/^\s*\$\$typeof:\s*""\s*,?\s*\n/gm, "");
  return next === content ? null : next;
}

export function relaxLucideForwardRefIconTypes(content: string): string | null {
  let next = content.replace(
    /ForwardRefExoticComponent<Omit<LucideProps,\s*"ref">\s*&\s*RefAttributes<SVGSVGElement>>/g,
    "React.FC<React.SVGProps<SVGSVGElement>>",
  );
  next = next.replace(
    /Omit<LucideProps,\s*"ref">/g,
    'Omit<React.SVGProps<SVGSVGElement>, "ref">',
  );
  next = next.replace(
    /:\s*LucideProps\b/g,
    ": React.SVGProps<SVGSVGElement>",
  );
  next = next.replace(
    /^import type \{ ForwardRefExoticComponent(?:,\s*RefAttributes)? \} from "react";\n?/m,
    "",
  );
  if (!/import\s+React\b/.test(next) && /\bReact\.(?:FC|ComponentType)\b/.test(next)) {
    next = `import React from "react";\n${next}`;
  }
  return next === content ? null : next;
}

export function repairIconComponentTypeFields(content: string): string | null {
  if (!/Icon:\s*React\.(?:FC|ComponentType)/.test(content)) return null;
  const importMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+["'][^"']*IconStub["']/);
  const firstIcon =
    importMatch?.[1]
      ?.split(",")[0]
      ?.trim()
      .split(/\s+as\s+/)[0]
      ?.trim() ?? "Users";
  const next = content.replace(
    /Icon:\s*React\.(?:FC|ComponentType)<[^;]+>;/,
    `Icon: typeof ${firstIcon};`,
  );
  return next === content ? null : next;
}

export function repairMalformedReactImportBlock(content: string): string | null {
  const broken = /^import\s*\{\s*\nimport\s+\{([^}]+)\}\s+from\s+["']react["'];?\s*\n([\s\S]*?)\}\s+from\s+["']react["'];?\s*\n/m;
  const match = content.match(broken);
  if (!match) return null;

  const symbols = new Set<string>();
  for (const part of match[1]!.split(",")) {
    const trimmed = part.trim().replace(/,$/, "");
    if (!trimmed) continue;
    const name = trimmed.split(/\s+as\s+/)[0]!.trim();
    if (name) symbols.add(name);
  }
  for (const line of match[2]!.split("\n")) {
    const trimmed = line.trim().replace(/,$/, "");
    if (!trimmed || trimmed.startsWith("//")) continue;
    const name = trimmed.split(/\s+as\s+/)[0]!.trim();
    if (name) symbols.add(name);
  }

  const merged = [...symbols].sort().join(", ");
  const replacement = `import { ${merged} } from "react";\n`;
  const next = content.replace(broken, replacement);
  return next === content ? null : next;
}

export function applySyntaxCorruptionRepairs(content: string): string | null {
  let next = content;
  const reactImport = repairMalformedReactImportBlock(next);
  if (reactImport) next = reactImport;
  const reactInternal = stripInjectedReactInternalObjectProperties(next);
  if (reactInternal) next = reactInternal;
  const lucideTypes = relaxLucideForwardRefIconTypes(next);
  if (lucideTypes) next = lucideTypes;
  const iconField = repairIconComponentTypeFields(next);
  if (iconField) next = iconField;
  const record = repairCorruptedRecordLiteral(next);
  if (record) next = record;
  const orphan = repairOrphanObjectLiteralLines(next);
  if (orphan) next = orphan;
  const nullish = repairBrokenNullishMethodCalls(next);
  if (nullish) next = nullish;
  const method = repairNullishBeforeMethodCall(next);
  if (method) next = method;
  const logical = repairMixedLogicalNullish(next);
  if (logical) next = logical;
  const imports = repairDuplicateImports(next);
  if (imports) next = imports;
  const leaked = repairLeakedNullGuardsInJsx(next);
  if (leaked) next = leaked;
  return next === content ? null : next;
}

export function repairLeakedNullGuardsInJsx(content: string): string | null {
  const next = content.replace(
    /(\n\s*)if\s*\(\w+\s*==\s*null\)\s*return;\s*\n(\s*<)/g,
    "$1$2",
  );
  return next === content ? null : next;
}
