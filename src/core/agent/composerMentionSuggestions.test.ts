import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockProjectScan } from "@/core/repository/testScan";
import {
  buildMentionSuggestions,
  detectActiveMention,
  insertMentionAt,
} from "@/core/agent/composerMentionSuggestions";
import { resolveContextContentPaths } from "@/core/context/referencedFileContext";
import type { SymbolEntry } from "@/types";

const SYMBOLS: SymbolEntry[] = [
  {
    name: "Dashboard",
    kind: "component",
    path: "src/pages/Dashboard.tsx",
    absPath: "/tmp/app/src/pages/Dashboard.tsx",
    line: 4,
  },
  {
    name: "useTimer",
    kind: "hook",
    path: "src/hooks/useTimer.ts",
    absPath: "/tmp/app/src/hooks/useTimer.ts",
    line: 1,
  },
];

const SCAN = mockProjectScan(
  [
    "src/App.tsx",
    "src/main.tsx",
    "src/index.css",
    "src/pages/Dashboard.tsx",
    "src/hooks/useTimer.ts",
  ],
  { root: "/tmp/app", symbols: SYMBOLS },
);

describe("composerMentionSuggestions", () => {
  it("detects active @ token at cursor", () => {
    const text = "Update @Dash";
    assert.deepEqual(detectActiveMention(text, text.length), {
      query: "Dash",
      start: 7,
    });
    assert.equal(detectActiveMention("no mention", 10), null);
  });

  it("inserts mention token with trailing space", () => {
    const source = "Fix @Das";
    const { nextText, nextCursor } = insertMentionAt(
      source,
      source.length,
      4,
      "Dashboard",
    );
    assert.equal(nextText, "Fix @Dashboard ");
    assert.equal(nextCursor, 15);
  });

  it("ranks symbol matches for partial query", () => {
    const suggestions = buildMentionSuggestions(SCAN, "Dash");
    assert.ok(suggestions.some((s) => s.insertText === "Dashboard"));
    assert.equal(suggestions[0]?.kind, "symbol");
  });

  it("returns default file and symbol hints for empty query", () => {
    const suggestions = buildMentionSuggestions(SCAN, "");
    assert.ok(suggestions.some((s) => s.insertText === "src/App.tsx"));
    assert.ok(suggestions.some((s) => s.insertText === "Dashboard"));
  });

  it("feeds symbol mention paths into referenced context resolver", () => {
    const paths = resolveContextContentPaths("Polish @Dashboard spacing", SCAN);
    assert.ok(paths.includes("src/pages/Dashboard.tsx"));
  });
});
