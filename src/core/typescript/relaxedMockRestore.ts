import { isPageSourceFile } from "@/core/greenfield/repairConvergencePolicy";
import { inferEntityTypeFromMockName } from "@/core/typescript/intersectionTypeRepair";

export function extractExportedTypeNames(typesSource: string): Set<string> {
  const names = new Set<string>();
  for (const match of typesSource.matchAll(/export\s+(?:type|interface)\s+(\w+)/g)) {
    names.add(match[1]!);
  }
  return names;
}

function typesImportPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  const depth = normalized.split("/").length - 2;
  if (depth <= 1) return "../types";
  return `${"../".repeat(depth)}types`.replace(/\/$/, "") || "../types";
}

function ensureEntityTypeImports(content: string, entities: readonly string[], relPath: string): string {
  if (entities.length === 0) return content;
  const typesPath = typesImportPath(relPath);
  const importRe = new RegExp(
    `import\\s+type\\s+\\{([^}]+)\\}\\s+from\\s+['"]${typesPath.replace(/\//g, "\\/")}['"]`,
  );
  const existing = content.match(importRe);
  const present = new Set(
    (existing?.[1] ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  );
  const missing = entities.filter((e) => !present.has(e));
  if (missing.length === 0) return content;

  const merged = [...new Set([...present, ...missing])].sort().join(", ");
  const importLine = `import type { ${merged} } from "${typesPath}";`;
  if (existing) {
    return content.replace(importRe, importLine);
  }

  const lines = content.split("\n");
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i]!)) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, importLine);
  return lines.join("\n");
}

/** Undo Record<string, unknown> mock relaxation when domain types exist in types.ts. */
export function restoreRelaxedPageMockTypes(
  content: string,
  relPath: string,
  knownEntityTypes: ReadonlySet<string>,
): string | null {
  if (!isPageSourceFile(relPath)) return null;
  if (!/Array<Record<string,\s*unknown>>/.test(content)) return null;

  let next = content;
  const restoredEntities = new Set<string>();

  for (const match of content.matchAll(/const\s+(mock\w+)\s*:\s*Array<Record<string,\s*unknown>>/g)) {
    const mockName = match[1]!;
    const entity = inferEntityTypeFromMockName(mockName);
    if (!entity || !knownEntityTypes.has(entity)) continue;
    next = next.replace(
      `const ${mockName}: Array<Record<string, unknown>>`,
      `const ${mockName}: ${entity}[]`,
    );
    restoredEntities.add(entity);
  }

  next = next.replace(
    /useState<Array<Record<string,\s*unknown>>>\(\s*(mock\w+)\s*\)/g,
    (full, mockName: string) => {
      const entity = inferEntityTypeFromMockName(mockName);
      if (!entity || !knownEntityTypes.has(entity)) return full;
      restoredEntities.add(entity);
      return `useState<${entity}[]>(${mockName})`;
    },
  );

  if (next === content) return null;
  next = ensureEntityTypeImports(next, [...restoredEntities], relPath);
  return next;
}
