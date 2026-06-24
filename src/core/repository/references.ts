import type { RepositoryIndex, SymbolReferenceInfo } from "@/core/repository/types";

/**
 * Find where a symbol is defined and which files reference it.
 */
export function findSymbolReferences(
  repo: RepositoryIndex,
  symbolName: string,
): SymbolReferenceInfo[] {
  const name = symbolName.trim();
  if (!name) return [];

  const entries = repo.symbolsByName.get(name) ?? [];
  const out: SymbolReferenceInfo[] = [];

  for (const sym of entries) {
    const node = repo.graphBySymbolKey.get(`${sym.path}::${sym.name}`);
    out.push({
      name: sym.name,
      kind: sym.kind,
      definedIn: sym.path,
      absPath: sym.absPath,
      line: sym.line ?? null,
      usedIn: node?.referencedBy ?? [],
    });
  }

  return out;
}
