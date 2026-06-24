import type { RepositoryIndex } from "@/core/repository/types";
import type { ProjectScan, SymbolEntry } from "@/types";

export interface RepoMapFileDetail {
  readonly path: string;
  readonly absPath: string;
  readonly imports: readonly string[];
  readonly exports: readonly string[];
  readonly symbols: readonly SymbolEntry[];
  readonly referrers: readonly string[];
}

export function buildRepoMapFileDetail(
  repository: RepositoryIndex,
  relPath: string,
): RepoMapFileDetail | null {
  const entry = repository.scan.index.find((file) => file.path === relPath);
  if (!entry) return null;
  const absPath = repository.absByPath.get(relPath) ?? relPath;
  const symbols = repository.scan.symbols.filter((symbol) => symbol.path === relPath);
  const imports = [...(repository.importGraph.get(relPath) ?? [])].sort();
  const exports = entry.exports ?? [];
  const referrers = repository.symbolGraph
    .filter((node) => node.definedIn === relPath)
    .flatMap((node) => node.referencedBy)
    .filter((path, index, all) => all.indexOf(path) === index)
    .sort();
  return { path: relPath, absPath, imports, exports, symbols, referrers };
}

export function indexedFilePaths(scan: ProjectScan | null): readonly string[] {
  if (!scan) return [];
  return scan.index.map((file) => file.path).sort();
}
