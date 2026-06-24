import { buildRepositorySummary } from "@/core/repository/summary";
import type {
  FileIndex,
  ProjectScan,
  RepositoryStats,
  SymbolEntry,
  SymbolGraphNode,
} from "@/types";

function emptyFileIndexFields(file: FileIndex): FileIndex {
  return {
    ...file,
    hooks: file.hooks ?? [],
    classes: file.classes ?? [],
    interfaces: file.interfaces ?? [],
    types: file.types ?? [],
    referencedNames: file.referencedNames ?? [],
    symbolLocations: file.symbolLocations ?? [],
  };
}

function buildStats(index: FileIndex[]): RepositoryStats {
  let totalImports = 0;
  let totalExports = 0;
  let totalComponents = 0;
  let totalFunctions = 0;
  let totalHooks = 0;
  let totalClasses = 0;
  let totalInterfaces = 0;
  let totalTypes = 0;

  for (const file of index) {
    totalImports += file.imports.length;
    totalExports += file.exports.length;
    totalComponents += file.components.length;
    totalFunctions += file.functions.length;
    totalHooks += file.hooks.length;
    totalClasses += file.classes.length;
    totalInterfaces += file.interfaces.length;
    totalTypes += file.types.length;
  }

  return {
    totalFiles: index.length,
    totalComponents,
    totalFunctions,
    totalHooks,
    totalClasses,
    totalInterfaces,
    totalTypes,
    totalImports,
    totalExports,
  };
}

function buildClientSymbolGraph(
  index: FileIndex[],
  symbols: SymbolEntry[],
): SymbolGraphNode[] {
  const refsByConsumer = new Map(
    index.map((f) => [f.path, new Set(f.referencedNames)]),
  );
  const graph: SymbolGraphNode[] = [];

  for (const sym of symbols) {
    if (sym.name === "default") continue;
    const referencedBy: string[] = [];
    for (const file of index) {
      if (file.path === sym.path) continue;
      if (refsByConsumer.get(file.path)?.has(sym.name)) {
        referencedBy.push(file.path);
      }
    }
    graph.push({
      name: sym.name,
      kind: sym.kind,
      definedIn: sym.path,
      absPath: sym.absPath,
      referencedBy,
    });
  }
  return graph;
}

/** Ensure scans from older mocks include Phase 12 repository fields. */
export function enrichProjectScan(scan: ProjectScan): ProjectScan {
  const index = scan.index.map(emptyFileIndexFields);
  const stats = scan.repositoryStats ?? buildStats(index);
  const symbolGraph =
    scan.symbolGraph != null && scan.symbolGraph.length > 0
      ? scan.symbolGraph
      : buildClientSymbolGraph(index, scan.symbols);

  const summary = {
    ...scan.summary,
    bundler: scan.summary.bundler ?? "unknown",
  };
  const dependencies = scan.dependencies ?? [];
  const enriched: ProjectScan = {
    ...scan,
    summary,
    index,
    repositoryStats: stats,
    symbolGraph,
    dependencies,
    repositorySummary:
      scan.repositorySummary?.trim() ||
      buildRepositorySummary({ ...scan, summary, repositoryStats: stats, dependencies }),
  };
  return enriched;
}

export function symbolKey(path: string, name: string): string {
  return `${path}::${name}`;
}
