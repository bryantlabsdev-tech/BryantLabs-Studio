import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasCodebaseMention } from "@/core/agent/codebaseMention";
import { resolvePlannerSemanticBoostPaths } from "@/core/context/plannerSemanticBoost";
import { suggestLineContinuation } from "@/core/editor/lineContinuation";
import { mockProjectScan } from "@/core/repository/testScan";
import type { SymbolEntry } from "@/types";

const SYMBOLS: SymbolEntry[] = [
  {
    name: "Dashboard",
    kind: "component",
    path: "src/pages/Dashboard.tsx",
    absPath: "/tmp/app/src/pages/Dashboard.tsx",
    line: 1,
  },
];

describe("plannerSemanticBoost", () => {
  it("merges lexical and semantic paths for @codebase prompts", async () => {
    const scan = mockProjectScan(["src/App.tsx", "src/pages/Dashboard.tsx"], {
      root: "/tmp/app",
      symbols: SYMBOLS,
    });
    const paths = await resolvePlannerSemanticBoostPaths(
      {
        semanticSearch: async () => [
          { path: "src/pages/Dashboard.tsx", score: 0.9, reason: "dashboard" },
        ],
      } as never,
      "Fix dashboard header @codebase",
      scan,
    );
    assert.ok(hasCodebaseMention("Fix dashboard header @codebase"));
    assert.ok(paths.includes("src/pages/Dashboard.tsx"));
  });
});

describe("lineContinuation", () => {
  it("closes unmatched braces", () => {
    assert.equal(suggestLineContinuation("function x() {", SYMBOLS), "}");
  });

  it("completes import lists", () => {
    assert.equal(suggestLineContinuation("import { Dash", SYMBOLS), "board");
  });
});
