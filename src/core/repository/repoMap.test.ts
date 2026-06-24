import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { buildRepoMapFileDetail } from "@/core/repository/repoMap";
import { mockProjectScan } from "@/core/repository/testScan";

describe("repoMap", () => {
  it("builds file drill-down from repository index", () => {
    const scan = mockProjectScan(["src/a.ts", "src/b.ts"], {
      index: [
        {
          path: "src/a.ts",
          imports: ["./b"],
          exports: ["foo"],
          components: [],
          functions: ["foo"],
          hooks: [],
          classes: [],
          interfaces: [],
          types: [],
          referencedNames: [],
        },
        {
          path: "src/b.ts",
          imports: [],
          exports: ["bar"],
          components: [],
          functions: ["bar"],
          hooks: [],
          classes: [],
          interfaces: [],
          types: [],
          referencedNames: ["foo"],
        },
      ],
      symbols: [
        {
          name: "foo",
          kind: "function",
          path: "src/a.ts",
          absPath: "/project/src/a.ts",
          line: 1,
        },
      ],
    });
    const repository = buildRepositoryIndex(scan);
    const detail = buildRepoMapFileDetail(repository, "src/a.ts");
    assert.ok(detail);
    assert.equal(detail?.symbols.length, 1);
    assert.ok(detail?.referrers.includes("src/b.ts"));
  });
});
