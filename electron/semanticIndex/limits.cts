/** Max source bytes read when building semantic chunks (matches project scanner). */
export const MAX_CHUNK_FILE_BYTES = 512 * 1024;

/** Max searchable chunks kept in memory and on disk. */
export const MAX_SEMANTIC_CHUNKS = 2_000;

/** Max TF-IDF vocabulary width — prevents huge dense matrices. */
export const MAX_TFIDF_VOCAB = 8_192;

/** Max floats in the TF-IDF matrix (chunks × vocab). ~16 MB as Float32. */
export const MAX_TFIDF_FLOATS = 4_000_000;

export function tfidfMatrixSize(chunkCount: number, vocabSize: number): number {
  return chunkCount * vocabSize;
}

export function tfidfWithinLimits(chunkCount: number, vocabSize: number): boolean {
  return (
    chunkCount <= MAX_SEMANTIC_CHUNKS &&
    vocabSize <= MAX_TFIDF_VOCAB &&
    tfidfMatrixSize(chunkCount, vocabSize) <= MAX_TFIDF_FLOATS
  );
}
