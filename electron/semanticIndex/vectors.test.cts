import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTfidfIndex } from "./vectors.cjs";
import type { SemanticChunkRecord } from "./chunker.cjs";
import { MAX_TFIDF_VOCAB, MAX_TFIDF_FLOATS, tfidfWithinLimits } from "./limits.cjs";

describe("semanticIndex vectors", () => {
  it("buildTfidfIndex caps vocabulary width", () => {
    const chunks: SemanticChunkRecord[] = [];
    for (let i = 0; i < 50; i++) {
      chunks.push({
        id: `f${i}`,
        path: `src/f${i}.ts`,
        startLine: 1,
        endLine: 3,
        text: `export function fn${i}() { return ${i} ${"token".repeat(20)} }`,
        symbolName: `fn${i}`,
      });
    }
    const index = buildTfidfIndex(chunks);
    assert.ok(index.dim <= MAX_TFIDF_VOCAB);
    assert.ok(tfidfWithinLimits(index.chunkCount, index.dim));
  });

  it("buildTfidfIndex trims chunk count to stay within matrix limits", () => {
    const chunks: SemanticChunkRecord[] = [];
    for (let i = 0; i < 5_000; i++) {
      chunks.push({
        id: `big-${i}`,
        path: `src/big-${i}.ts`,
        startLine: 1,
        endLine: 2,
        text: `value ${i} ${"word".repeat(30)}`,
        symbolName: null,
      });
    }
    const index = buildTfidfIndex(chunks);
    assert.ok(tfidfWithinLimits(index.chunkCount, index.dim));
    assert.ok(index.chunkCount < 5_000);
    assert.ok(index.vectors.length <= MAX_TFIDF_FLOATS);
  });
});
