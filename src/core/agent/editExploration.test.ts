import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAX_EXPLORE_FILES,
  exploreRepositoryBeforeEdit,
} from "@/core/agent/editExploration";
import { mockProjectScan } from "@/core/repository/testScan";
import { buildRepositoryIndex } from "@/core/repository";

describe("exploreRepositoryBeforeEdit", () => {
  it("reads up to DEFAULT_MAX_EXPLORE_FILES ranked paths", async () => {
    const paths = Array.from({ length: 16 }, (_, i) => `src/file-${i}.ts`);
    const scan = mockProjectScan(paths, { root: "/tmp/app" });
    const repository = buildRepositoryIndex(scan);
    const readPaths: string[] = [];

    const explored = await exploreRepositoryBeforeEdit({
      api: {
        readFile: async (absPath: string) => {
          readPaths.push(absPath);
          return { readable: true, content: `// ${absPath}\n` };
        },
        semanticSearch: async () =>
          paths.map((path, index) => ({
            path,
            score: 1 - index * 0.01,
            reason: "test",
          })),
      } as never,
      projectRoot: "/tmp/app",
      repository,
      prompt: "refactor module exports across the app",
    });

    assert.equal(explored.length, DEFAULT_MAX_EXPLORE_FILES);
    assert.equal(readPaths.length, DEFAULT_MAX_EXPLORE_FILES);
  });

  it("prioritizes semanticBoostPaths before search hits", async () => {
    const scan = mockProjectScan(
      ["src/A.tsx", "src/B.tsx", "src/C.tsx"],
      { root: "/tmp/app" },
    );
    const repository = buildRepositoryIndex(scan);

    const explored = await exploreRepositoryBeforeEdit({
      api: {
        readFile: async () => ({ readable: true, content: "export {}\n" }),
        semanticSearch: async () => [
          { path: "src/C.tsx", score: 0.99, reason: "c" },
        ],
      } as never,
      projectRoot: "/tmp/app",
      repository,
      prompt: "update layout",
      semanticBoostPaths: ["src/A.tsx"],
    });

    assert.equal(explored[0]?.path, "src/A.tsx");
  });
});
