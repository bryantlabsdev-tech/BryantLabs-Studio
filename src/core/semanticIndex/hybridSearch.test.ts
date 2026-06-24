import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeRepositoryAndSemanticHits } from "@/core/semanticIndex/hybridSearch";

describe("mergeRepositoryAndSemanticHits", () => {
  it("boosts overlapping lexical hits with semantic scores", () => {
    const merged = mergeRepositoryAndSemanticHits(
      [
        {
          path: "src/App.tsx",
          absPath: "/p/src/App.tsx",
          reason: "React component",
          score: 40,
          symbolName: "App",
        },
      ],
      [
        {
          path: "src/App.tsx",
          chunkId: "c1",
          score: 0.82,
          reason: "calculator layout",
          preview: "function App()",
          symbolName: "App",
        },
      ],
    );
    assert.equal(merged.length, 1);
    assert.ok(merged[0]!.score > 40);
    assert.match(merged[0]!.reason, /semantic/i);
  });

  it("adds semantic-only paths", () => {
    const merged = mergeRepositoryAndSemanticHits(
      [],
      [
        {
          path: "src/utils/math.ts",
          chunkId: "c2",
          score: 0.55,
          reason: "token overlap",
          preview: "export function add",
          symbolName: "add",
        },
      ],
    );
    assert.equal(merged[0]?.path, "src/utils/math.ts");
    assert.ok(merged[0]!.score > 0);
  });
});
