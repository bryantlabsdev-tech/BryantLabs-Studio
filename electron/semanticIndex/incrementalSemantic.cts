import type { ProjectScan, SymbolEntry, FileEntry } from "../projectScanner.cjs";
import type { SemanticChunkRecord } from "./chunker.cjs";
import { MAX_SEMANTIC_CHUNKS } from "./limits.cjs";

const MAX_CHUNK_CHARS = 1200;

function lineSlice(text: string, startLine: number, endLine: number): string {
  const lines = text.split("\n");
  return lines.slice(startLine - 1, endLine).join("\n").trim();
}

function chunksForFile(
  file: FileEntry,
  text: string,
  symbols: readonly SymbolEntry[],
  budget: number,
): SemanticChunkRecord[] {
  const chunks: SemanticChunkRecord[] = [];
  if (!text || text.length === 0 || budget <= 0) return chunks;

  if (symbols.length === 0) {
    for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) {
      if (chunks.length >= budget) break;
      const slice = text.slice(i, i + MAX_CHUNK_CHARS).trim();
      if (!slice) continue;
      chunks.push({
        id: `${file.path}#${i}`,
        path: file.path,
        startLine: 1,
        endLine: Math.max(1, slice.split("\n").length),
        text: slice,
        symbolName: null,
      });
    }
    return chunks;
  }

  for (const sym of symbols) {
    if (chunks.length >= budget) break;
    const start = sym.line ?? 1;
    const end = start + 40;
    const slice = lineSlice(text, start, end);
    if (!slice) continue;
    chunks.push({
      id: `${file.path}#${sym.name}@${start}`,
      path: file.path,
      startLine: start,
      endLine: end,
      text: slice.slice(0, MAX_CHUNK_CHARS),
      symbolName: sym.name,
    });
  }
  return chunks;
}

export interface SemanticDelta {
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

/** Drop all chunks belonging to the given project-relative paths. */
export function removeChunksForPaths(
  chunks: readonly SemanticChunkRecord[],
  paths: readonly string[],
): SemanticChunkRecord[] {
  if (paths.length === 0) return [...chunks];
  const drop = new Set(paths);
  return chunks.filter((chunk) => !drop.has(chunk.path));
}

/** Build semantic chunks for specific paths using the current scan snapshot. */
export async function buildChunksForPaths(
  scan: ProjectScan,
  paths: readonly string[],
  readText: (absPath: string) => Promise<string | null>,
  existingChunkCount = 0,
): Promise<SemanticChunkRecord[]> {
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return [];

  const filesByPath = new Map(scan.files.map((f) => [f.path, f]));
  const symbolsByPath = new Map<string, SymbolEntry[]>();
  for (const sym of scan.symbols) {
    const list = symbolsByPath.get(sym.path) ?? [];
    list.push(sym);
    symbolsByPath.set(sym.path, list);
  }

  const chunks: SemanticChunkRecord[] = [];
  let budget = Math.max(0, MAX_SEMANTIC_CHUNKS - existingChunkCount);

  for (const relPath of unique) {
    if (budget <= 0) break;
    const file = filesByPath.get(relPath);
    if (!file) continue;
    const text = await readText(file.absPath);
    if (!text) continue;
    const fileChunks = chunksForFile(
      file,
      text,
      symbolsByPath.get(relPath) ?? [],
      budget,
    );
    chunks.push(...fileChunks);
    budget = Math.max(0, MAX_SEMANTIC_CHUNKS - existingChunkCount - chunks.length);
  }

  return chunks;
}

/** Patch chunk list for file add/change/delete without re-reading the whole repo. */
export async function patchSemanticChunks(
  existing: readonly SemanticChunkRecord[],
  scan: ProjectScan,
  delta: SemanticDelta,
  readText: (absPath: string) => Promise<string | null>,
): Promise<SemanticChunkRecord[]> {
  const touched = [...new Set([...delta.changed, ...delta.added, ...delta.deleted])];
  let next = removeChunksForPaths(existing, touched);
  const upsert = [...new Set([...delta.changed, ...delta.added])];
  const added = await buildChunksForPaths(scan, upsert, readText, next.length);
  next = [...next, ...added];
  if (next.length > MAX_SEMANTIC_CHUNKS) {
    next = next.slice(0, MAX_SEMANTIC_CHUNKS);
  }
  return next;
}
