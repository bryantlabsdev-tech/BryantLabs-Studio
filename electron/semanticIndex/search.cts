import type { SemanticChunkRecord } from "./chunker.cjs";
import {
  cosineSimilarity,
  vectorizeQuery,
  type TfidfIndex,
} from "./vectors.cjs";

export interface SemanticSearchResult {
  path: string;
  score: number;
  reason: string;
  chunkId: string;
  preview: string;
  symbolName: string | null;
}

export function searchSemanticIndex(
  query: string,
  chunks: readonly SemanticChunkRecord[],
  index: TfidfIndex,
  limit = 12,
): SemanticSearchResult[] {
  const q = query.trim();
  if (!q || chunks.length === 0 || index.dim === 0) return [];

  const qVec = vectorizeQuery(index, q);
  const hits: SemanticSearchResult[] = [];

  for (let d = 0; d < chunks.length; d++) {
    const offset = d * index.dim;
    const docVec = index.vectors.subarray(offset, offset + index.dim);
    const score = cosineSimilarity(qVec, docVec);
    if (score <= 0.05) continue;
    const chunk = chunks[d]!;
    hits.push({
      path: chunk.path,
      score,
      reason: "tf-idf similarity",
      chunkId: chunk.id,
      preview: chunk.text.slice(0, 160),
      symbolName: chunk.symbolName,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
