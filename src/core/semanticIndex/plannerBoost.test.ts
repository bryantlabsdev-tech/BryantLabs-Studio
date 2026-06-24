import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchSemanticBoostPaths } from "@/core/semanticIndex/plannerBoost";

describe("plannerBoost", () => {
  it("returns empty paths when api is unavailable", async () => {
    assert.deepEqual(await fetchSemanticBoostPaths(undefined, "Add auth"), []);
  });

  it("maps semantic hits to paths", async () => {
    const paths = await fetchSemanticBoostPaths(
      {
        semanticSearch: async () => [
          { path: "src/App.tsx", score: 0.9, reason: "match", chunkId: "1", preview: "", symbolName: null },
          { path: "src/index.css", score: 0.5, reason: "match", chunkId: "2", preview: "", symbolName: null },
        ],
      } as never,
      "Style the dashboard header",
    );
    assert.deepEqual(paths, ["src/App.tsx", "src/index.css"]);
  });
});
