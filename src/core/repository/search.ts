import type { SymbolKind } from "@/types";
import type { RepositoryIndex, RepositorySearchHit } from "@/core/repository/types";
import { symbolKey } from "@/core/repository/enrichScan";

const MAX_RESULTS = 100;

const KIND_LABEL: Record<SymbolKind, string> = {
  component: "React component",
  function: "Function",
  export: "Export",
  hook: "React hook",
  class: "Class",
  interface: "Interface",
  type: "Type alias",
};

function scoreMatch(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 50;
  return 0;
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const file = parts[parts.length - 1] ?? path;
  return file.replace(/\.[^.]+$/, "");
}

/**
 * Search repository symbols and files by component/function/type name.
 */
export function searchRepository(
  repo: RepositoryIndex,
  query: string,
): RepositorySearchHit[] {
  const q = query.trim();
  if (!q) return [];

  const hits: RepositorySearchHit[] = [];
  const seen = new Set<string>();
  const qLower = q.toLowerCase();

  const pushHit = (hit: RepositorySearchHit, dedupeKey: string) => {
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    hits.push(hit);
  };

  for (const sym of repo.scan.symbols) {
    const score = scoreMatch(sym.name, q);
    if (score <= 0) continue;
    const node = repo.graphBySymbolKey.get(symbolKey(sym.path, sym.name));
    pushHit(
      {
        path: sym.path,
        absPath: sym.absPath,
        reason: KIND_LABEL[sym.kind],
        symbolName: sym.name,
        symbolKind: sym.kind,
        line: sym.line ?? null,
        referencedBy: node ? [...node.referencedBy] : [],
        score,
      },
      `${sym.path}::${sym.name}::${sym.kind}`,
    );
  }

  for (const file of repo.scan.files) {
    const base = basename(file.path);
    const baseLower = base.toLowerCase();
    const pathLower = file.path.toLowerCase();
    let score = 0;
    if (baseLower === qLower) score = 95;
    else if (baseLower.startsWith(qLower)) score = 70;
    else if (baseLower.includes(qLower) || pathLower.includes(qLower)) score = 40;
    if (score <= 0) continue;
    pushHit(
      {
        path: file.path,
        absPath: file.absPath,
        reason:
          baseLower === qLower
            ? "File name match"
            : "File path match",
        score,
      },
      `file::${file.path}`,
    );
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.symbolName ?? "").localeCompare(b.symbolName ?? "") ||
        a.path.localeCompare(b.path),
    )
    .slice(0, MAX_RESULTS);
}
