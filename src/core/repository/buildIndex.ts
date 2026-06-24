import type { ProjectScan, SymbolEntry, SymbolGraphNode } from "@/types";
import { buildCodeGraphSummary } from "@/core/repository/codeGraph";
import { enrichProjectScan, symbolKey } from "@/core/repository/enrichScan";
import type { RepositoryIndex } from "@/core/repository/types";

function baseName(relPath: string): string {
  const last = relPath.split(/[/\\]/).pop() ?? relPath;
  return last.replace(/\.[^.]+$/, "");
}

function buildImportGraph(scan: ProjectScan): Map<string, Set<string>> {
  const basenameMap = new Map<string, string[]>();
  for (const file of scan.files) {
    const key = baseName(file.path).toLowerCase();
    const list = basenameMap.get(key) ?? [];
    list.push(file.path);
    basenameMap.set(key, list);
  }

  const graph = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    (graph.get(a) ?? graph.set(a, new Set()).get(a)!).add(b);
    (graph.get(b) ?? graph.set(b, new Set()).get(b)!).add(a);
  };

  for (const file of scan.index) {
    for (const spec of file.imports) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      const targets = basenameMap.get(baseName(spec).toLowerCase());
      if (!targets) continue;
      for (const target of targets) link(file.path, target);
    }
  }
  return graph;
}

function buildSymbolsByName(
  symbols: readonly SymbolEntry[],
): Map<string, SymbolEntry[]> {
  const map = new Map<string, SymbolEntry[]>();
  for (const sym of symbols) {
    const list = map.get(sym.name) ?? [];
    list.push(sym);
    map.set(sym.name, list);
  }
  return map;
}

function buildGraphByKey(
  graph: readonly SymbolGraphNode[],
): Map<string, SymbolGraphNode> {
  const map = new Map<string, SymbolGraphNode>();
  for (const node of graph) {
    map.set(symbolKey(node.definedIn, node.name), node);
  }
  return map;
}

/** Build an in-memory repository index from a project scan. */
export function buildRepositoryIndex(scan: ProjectScan): RepositoryIndex {
  const enriched = enrichProjectScan(scan);
  const absByPath = new Map(enriched.files.map((f) => [f.path, f.absPath]));

  const base: Omit<RepositoryIndex, "codeGraph"> = {
    scan: enriched,
    stats: enriched.repositoryStats,
    symbolGraph: enriched.symbolGraph,
    symbolsByName: buildSymbolsByName(enriched.symbols),
    graphBySymbolKey: buildGraphByKey(enriched.symbolGraph),
    importGraph: buildImportGraph(enriched),
    absByPath,
  };
  return {
    ...base,
    codeGraph: buildCodeGraphSummary(base),
  };
}
