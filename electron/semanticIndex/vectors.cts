import { tokenize } from "./tokenize.cjs";
import type { SemanticChunkRecord } from "./chunker.cjs";
import {
  MAX_SEMANTIC_CHUNKS,
  MAX_TFIDF_VOCAB,
  MAX_TFIDF_FLOATS,
  tfidfWithinLimits,
} from "./limits.cjs";

export interface TfidfIndex {
  readonly vocabulary: string[];
  readonly idf: Float32Array;
  readonly vectors: Float32Array;
  readonly chunkCount: number;
  readonly dim: number;
}

function termFreq(tokens: readonly string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

function l2Normalize(vec: Float32Array): void {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i]! * vec[i]!;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / norm;
}

export class SemanticIndexTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticIndexTooLargeError";
  }
}

function documentFrequency(
  docTokens: readonly (readonly string[])[],
): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return df;
}

function topVocabularyByDf(
  df: Map<string, number>,
  maxTerms: number,
): string[] {
  return [...df.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map(([term]) => term)
    .sort();
}

export function buildTfidfIndex(chunks: readonly SemanticChunkRecord[]): TfidfIndex {
  let limitedChunks = chunks.slice(0, MAX_SEMANTIC_CHUNKS);
  let docTokens = limitedChunks.map((c) => tokenize(c.text));
  let df = documentFrequency(docTokens);
  let vocabulary = topVocabularyByDf(df, MAX_TFIDF_VOCAB);
  let dim = vocabulary.length;
  let chunkCount = limitedChunks.length;

  const maxChunksForMatrix = Math.max(
    1,
    Math.floor(MAX_TFIDF_FLOATS / Math.max(1, dim)),
  );
  if (chunkCount > maxChunksForMatrix) {
    chunkCount = maxChunksForMatrix;
    limitedChunks = limitedChunks.slice(0, chunkCount);
    docTokens = limitedChunks.map((c) => tokenize(c.text));
    df = documentFrequency(docTokens);
    vocabulary = topVocabularyByDf(df, MAX_TFIDF_VOCAB);
    dim = vocabulary.length;
    chunkCount = limitedChunks.length;
  }

  if (!tfidfWithinLimits(chunkCount, dim)) {
    throw new SemanticIndexTooLargeError(
      `Semantic index exceeds safe limits (${chunkCount} chunks × ${dim} terms).`,
    );
  }

  const idf = new Float32Array(dim);
  const n = Math.max(1, chunkCount);
  for (let i = 0; i < dim; i++) {
    const term = vocabulary[i]!;
    const dfi = df.get(term) ?? 1;
    idf[i] = Math.log((1 + n) / (1 + dfi)) + 1;
  }

  let vectors: Float32Array;
  try {
    vectors = new Float32Array(chunkCount * dim);
  } catch {
    throw new SemanticIndexTooLargeError(
      `Could not allocate TF-IDF matrix (${chunkCount} × ${dim}).`,
    );
  }
  if (vectors.length > MAX_TFIDF_FLOATS) {
    throw new SemanticIndexTooLargeError(
      `TF-IDF matrix too large (${vectors.length} floats).`,
    );
  }
  for (let d = 0; d < chunkCount; d++) {
    const tf = termFreq(docTokens[d] ?? []);
    const maxTf = Math.max(1, ...tf.values());
    const offset = d * dim;
    for (let i = 0; i < dim; i++) {
      const term = vocabulary[i]!;
      const tfVal = (tf.get(term) ?? 0) / maxTf;
      vectors[offset + i] = tfVal * idf[i]!;
    }
    const slice = vectors.subarray(offset, offset + dim);
    l2Normalize(slice);
  }

  return { vocabulary, idf, vectors, chunkCount, dim };
}

export function vectorizeQuery(
  index: TfidfIndex,
  query: string,
): Float32Array {
  const tokens = tokenize(query);
  const tf = termFreq(tokens);
  const maxTf = Math.max(1, ...tf.values());
  const vec = new Float32Array(index.dim);
  for (let i = 0; i < index.dim; i++) {
    const term = index.vocabulary[i]!;
    const tfVal = (tf.get(term) ?? 0) / maxTf;
    vec[i] = tfVal * index.idf[i]!;
  }
  l2Normalize(vec);
  return vec;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i]! * b[i]!;
  return dot;
}
