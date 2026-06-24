import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Simplify `Patient & { ... }` annotations when mock data only satisfies the inline shape. */
export function simplifyIntersectionTypeInFile(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): string | null {
  const match = diagnostic.message.match(/is not assignable to type '([^']+)'/);
  const fullType = match?.[1];
  if (!fullType?.includes(" & ")) return null;

  const inlinePart = fullType.split(" & ").slice(1).join(" & ").trim();
  if (!inlinePart.startsWith("{")) return null;

  const baseType = fullType.split(" & ")[0]!.trim();
  const intersectionPattern = new RegExp(
    `${escapeRegExp(baseType)}\\s*&\\s*${escapeRegExp(inlinePart)}`,
  );

  const lines = content.split("\n");
  const start = Math.max(0, diagnostic.line - 12);
  const end = Math.min(lines.length, diagnostic.line + 2);

  for (let i = start; i < end; i++) {
    const line = lines[i]!;
    if (!intersectionPattern.test(line)) continue;
    lines[i] = line.replace(intersectionPattern, inlinePart);
    return lines.join("\n");
  }

  return null;
}

/** Replace a local intersection alias with its inline extension only. */
export function simplifyLocalIntersectionAlias(
  content: string,
  aliasName: string,
): string | null {
  const aliasRe = new RegExp(
    `type\\s+${escapeRegExp(aliasName)}\\s*=\\s*([A-Z][A-Za-z0-9_]*)\\s*&\\s*(\\{[\\s\\S]*?\\})\\s*;`,
    "m",
  );
  const aliasMatch = content.match(aliasRe);
  if (!aliasMatch?.[2]) return null;

  const inlineOnly = aliasMatch[2]!.trim();
  const usageRe = new RegExp(`\\b${escapeRegExp(aliasName)}\\b`, "g");
  const next = content.replace(aliasRe, `type ${aliasName} = ${inlineOnly};`);
  if (next === content) return null;
  return next.replace(usageRe, aliasName);
}

/** Drop overly strict mock array annotations that block deterministic completion. */
export function relaxMockArrayAnnotation(content: string, typeName: string): string | null {
  let next = content;
  const mockRe = new RegExp(`(const\\s+mock\\w*:\\s*)${escapeRegExp(typeName)}\\[\\]`, "g");
  next = next.replace(mockRe, "$1Array<Record<string, unknown>>");
  const stateRe = new RegExp(`useState<${escapeRegExp(typeName)}\\[\\]>`, "g");
  next = next.replace(stateRe, "useState<Array<Record<string, unknown>>>");
  return next === content ? null : next;
}

/** Relax exhaustive Record<Union, T> maps when generated code only includes a subset. */
export function relaxExhaustiveRecordAnnotation(content: string): string | null {
  let next = content.replace(/Record<[^>]+,\s*string>/g, "Record<string, string>");
  return next === content ? null : next;
}

export function inferEntityTypeFromMockName(mockName: string): string | null {
  if (!mockName.startsWith("mock")) return null;
  const base = mockName.slice(4);
  if (base.endsWith("ies")) return `${base.slice(0, -3)}y`;
  if (base.endsWith("ses")) return base.slice(0, -1);
  if (base.endsWith("s")) return base.slice(0, -1);
  return base;
}

/** Drop strict useState generic when the mock array was relaxed to Record<string, unknown>. */
export function alignUseStateWithRelaxedMock(content: string): string | null {
  let next = content;
  let changed = false;
  const entities = new Set<string>();

  for (const match of content.matchAll(
    /const\s+(mock\w+)\s*:\s*Array<Record<string,\s*unknown>>/g,
  )) {
    const mockName = match[1]!;
    const entity = inferEntityTypeFromMockName(mockName);
    if (!entity) continue;
    entities.add(entity);

    const statePatterns = [
      new RegExp(`useState<([A-Z][\\w]*)\\[\\]>\\(\\s*${mockName}\\s*\\)`, "g"),
      new RegExp(`useState\\(\\s*${mockName}\\s+as\\s+[A-Za-z]+\\[\\]\\s*\\)`, "g"),
      new RegExp(`useState\\(\\s*${mockName}\\s*\\)`, "g"),
    ];

    for (const stateRe of statePatterns) {
      const replaced = next.replace(
        stateRe,
        `useState(${mockName} as unknown as ${entity}[])`,
      );
      if (replaced !== next) {
        next = replaced;
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    for (const entity of entities) {
      if (new RegExp(`import[^;\\n]*\\b${entity}\\b`).test(next)) continue;
      const typesPath = next.match(/from\s+(['"]\.\.\/types['"])/)?.[1] ?? '"../types"';
      const lines = next.split("\n");
      let insertAt = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*import\s+/.test(lines[i]!)) insertAt = i + 1;
      }
      lines.splice(insertAt, 0, `import type { ${entity} } from ${typesPath};`);
      next = lines.join("\n");
    }
  }

  return changed ? next : null;
}
