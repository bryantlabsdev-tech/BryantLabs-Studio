import type { CodeGraphSummary } from "@/core/repository/codeGraph";
import type {
  ProjectScan,
  RepositoryStats,
  SymbolEntry,
  SymbolGraphNode,
  SymbolKind,
} from "@/types";
import type { PlanFile } from "@/core/planner/types";

export interface RepositoryIndex {
  readonly scan: ProjectScan;
  readonly stats: RepositoryStats;
  readonly symbolGraph: readonly SymbolGraphNode[];
  readonly symbolsByName: ReadonlyMap<string, readonly SymbolEntry[]>;
  readonly graphBySymbolKey: ReadonlyMap<string, SymbolGraphNode>;
  readonly importGraph: ReadonlyMap<string, ReadonlySet<string>>;
  readonly absByPath: ReadonlyMap<string, string>;
  readonly codeGraph: CodeGraphSummary;
}

export interface RepositorySearchHit {
  readonly path: string;
  readonly absPath: string;
  readonly reason: string;
  readonly symbolName?: string;
  readonly symbolKind?: SymbolKind;
  readonly line?: number | null;
  readonly referencedBy?: readonly string[];
  readonly score: number;
}

export interface RepositoryRelevanceResult {
  readonly prompt: string;
  readonly symbols: readonly {
    name: string;
    kind: SymbolKind;
    path: string;
    line: number | null;
    reason: string;
  }[];
  readonly files: readonly PlanFile[];
  readonly graphEdges: readonly {
    symbol: string;
    definedIn: string;
    referencedBy: readonly string[];
  }[];
}

export interface SymbolReferenceInfo {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly definedIn: string;
  readonly absPath: string;
  readonly line: number | null;
  readonly usedIn: readonly string[];
}
