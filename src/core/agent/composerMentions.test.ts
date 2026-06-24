import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockProjectScan } from "@/core/repository/testScan";
import {
  boostComposerMentionsInContext,
  parseComposerMentions,
  parseComposerSymbolMentions,
  resolveMentionToProjectPath,
  resolveSymbolMention,
  resolveSymbolMentionPaths,
} from "@/core/agent/composerMentions";
import type { SymbolEntry } from "@/types";

const SYMBOLS: SymbolEntry[] = [
  {
    name: "Dashboard",
    kind: "component",
    path: "src/pages/Dashboard.tsx",
    absPath: "/tmp/app/src/pages/Dashboard.tsx",
    line: 12,
  },
  {
    name: "useTimer",
    kind: "hook",
    path: "src/hooks/useTimer.ts",
    absPath: "/tmp/app/src/hooks/useTimer.ts",
    line: 3,
  },
];

const SCAN = mockProjectScan(
  ["src/App.tsx", "src/components/History.tsx", "src/pages/Dashboard.tsx", "package.json"],
  { root: "/tmp/app", symbols: SYMBOLS },
);

describe("composerMentions", () => {
  it("parses @file paths from prompt text", () => {
    const paths = parseComposerMentions(
      "Update @src/App.tsx styling and wire @src/components/History.tsx",
    );
    assert.deepEqual(paths, ["src/App.tsx", "src/components/History.tsx"]);
  });

  it("parses @symbol names without file extensions", () => {
    const symbols = parseComposerSymbolMentions(
      "Refactor @Dashboard layout and reuse @useTimer in @src/App.tsx",
    );
    assert.deepEqual(symbols, ["Dashboard", "useTimer"]);
  });

  it("resolves mention to project-relative path", () => {
    assert.equal(resolveMentionToProjectPath("src/App.tsx", SCAN), "src/App.tsx");
    assert.equal(resolveMentionToProjectPath("App.tsx", SCAN), "src/App.tsx");
  });

  it("resolves symbol mention to indexed symbol entry", () => {
    const symbol = resolveSymbolMention("Dashboard", SCAN);
    assert.equal(symbol?.path, "src/pages/Dashboard.tsx");
    assert.equal(resolveSymbolMention("Missing", SCAN), null);
  });

  it("resolves symbol mention paths for context injection", () => {
    assert.deepEqual(resolveSymbolMentionPaths("Wire @useTimer into @Dashboard", SCAN), [
      "src/hooks/useTimer.ts",
      "src/pages/Dashboard.tsx",
    ]);
  });

  it("boosts mentioned files in plan context", () => {
    const base = {
      framework: "react",
      language: "typescript",
      packageManager: "npm",
      totalFiles: 3,
      totalFolders: 1,
      entryPoints: ["src/main.tsx"],
      files: ["package.json"],
      symbols: [],
      relevantFiles: [{ path: "package.json", score: 10, reasons: ["default"] }],
    };
    const boosted = boostComposerMentionsInContext(
      base,
      "Refactor @src/App.tsx only",
      SCAN,
    );
    assert.equal(boosted.relevantFiles?.[0]?.path, "src/App.tsx");
    assert.equal(boosted.relevantFiles?.[0]?.score, 100);
    assert.match(boosted.repositoryPrompt ?? "", /@-mentions/);
    assert.ok(boosted.files.includes("src/App.tsx"));
  });

  it("boosts symbol mentions to their defining files", () => {
    const base = {
      framework: "react",
      language: "typescript",
      packageManager: "npm",
      totalFiles: 4,
      totalFolders: 1,
      entryPoints: ["src/main.tsx"],
      files: ["package.json"],
      symbols: [],
      relevantFiles: [{ path: "package.json", score: 10, reasons: ["default"] }],
    };
    const boosted = boostComposerMentionsInContext(
      base,
      "Update @Dashboard header and @useTimer interval",
      SCAN,
    );
    const paths = boosted.relevantFiles?.map((entry) => entry.path) ?? [];
    assert.ok(paths.includes("src/pages/Dashboard.tsx"));
    assert.ok(paths.includes("src/hooks/useTimer.ts"));
    assert.match(boosted.repositoryPrompt ?? "", /Dashboard/);
    assert.match(boosted.repositoryPrompt ?? "", /useTimer/);
  });
});
