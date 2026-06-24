import type { RepositoryIndex } from "@/core/repository/types";
import type { SymbolKind } from "@/types";

export interface FileDependencyEdge {
  readonly from: string;
  readonly to: string;
}

export interface ReferencedSymbolSummary {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly definedIn: string;
  readonly referenceCount: number;
}

export interface CodeGraphSummary {
  readonly indexedFiles: number;
  readonly importEdges: number;
  readonly exportCount: number;
  readonly importCount: number;
  readonly topReferencedSymbols: readonly ReferencedSymbolSummary[];
  readonly hubFiles: readonly { path: string; dependencyCount: number }[];
  readonly sampleDependencies: readonly FileDependencyEdge[];
  readonly narrative: string;
}

const MAX_SAMPLE_EDGES = 24;
const MAX_HUB_FILES = 8;
const MAX_TOP_SYMBOLS = 10;

type GraphInput = Omit<RepositoryIndex, "codeGraph">;

/** Summarize file import graph and symbol reference graph for UI and agents. */
export function buildCodeGraphSummary(repo: GraphInput): CodeGraphSummary {
  const sampleDependencies: FileDependencyEdge[] = [];
  let importEdges = 0;

  for (const [from, neighbors] of repo.importGraph) {
    for (const to of neighbors) {
      importEdges++;
      if (sampleDependencies.length < MAX_SAMPLE_EDGES) {
        sampleDependencies.push({ from, to });
      }
    }
  }

  const hubScores = new Map<string, number>();
  for (const edge of sampleDependencies) {
    hubScores.set(edge.from, (hubScores.get(edge.from) ?? 0) + 1);
    hubScores.set(edge.to, (hubScores.get(edge.to) ?? 0) + 1);
  }
  const hubFiles = [...hubScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_HUB_FILES)
    .map(([path, dependencyCount]) => ({ path, dependencyCount }));

  const topReferencedSymbols = [...repo.symbolGraph]
    .filter((n) => n.name !== "default")
    .sort(
      (a, b) =>
        b.referencedBy.length - a.referencedBy.length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MAX_TOP_SYMBOLS)
    .map((n) => ({
      name: n.name,
      kind: n.kind,
      definedIn: n.definedIn,
      referenceCount: n.referencedBy.length,
    }));

  const stats = repo.stats;
  const exportCount = stats.totalExports;
  const importCount = stats.totalImports;

  const lines = [
    `Indexed ${stats.totalFiles} source files with ${importEdges} resolved import links.`,
    `Symbols: ${stats.totalComponents} components, ${stats.totalFunctions} functions, ${stats.totalHooks} hooks, ${stats.totalInterfaces + stats.totalTypes} types/interfaces.`,
    `Imports: ${importCount} · Exports: ${exportCount}`,
  ];
  if (topReferencedSymbols.length > 0) {
    const top = topReferencedSymbols
      .slice(0, 4)
      .map((s) => `${s.name} (${s.referenceCount} refs)`)
      .join(", ");
    lines.push(`Most referenced: ${top}`);
  }
  if (hubFiles.length > 0) {
    lines.push(
      `Central files: ${hubFiles.map((h) => h.path).join(", ")}`,
    );
  }

  return {
    indexedFiles: stats.totalFiles,
    importEdges,
    exportCount,
    importCount,
    topReferencedSymbols,
    hubFiles,
    sampleDependencies,
    narrative: lines.join("\n"),
  };
}
