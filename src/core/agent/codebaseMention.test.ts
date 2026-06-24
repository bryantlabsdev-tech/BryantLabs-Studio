import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasCodebaseMention,
  promptForCodebaseSearch,
} from "@/core/agent/codebaseMention";
import { boostComposerMentionsInContext } from "@/core/agent/composerMentions";
import { buildMentionSuggestions } from "@/core/agent/composerMentionSuggestions";
import { suggestInlineTabSuffix } from "@/core/editor/inlineTabSuggest";
import { mockProjectScan } from "@/core/repository/testScan";
import type { SymbolEntry } from "@/types";

const SYMBOLS: SymbolEntry[] = [
  {
    name: "Dashboard",
    kind: "component",
    path: "src/pages/Dashboard.tsx",
    absPath: "/tmp/app/src/pages/Dashboard.tsx",
    line: 4,
  },
];

const SCAN = mockProjectScan(
  ["src/App.tsx", "src/pages/Dashboard.tsx", "src/components/Timer.tsx"],
  { root: "/tmp/app", symbols: SYMBOLS },
);

describe("codebaseMention", () => {
  it("detects @codebase token", () => {
    assert.equal(hasCodebaseMention("Fix layout @codebase"), true);
    assert.equal(hasCodebaseMention("Fix layout"), false);
  });

  it("strips @codebase for search prompt", () => {
    assert.equal(
      promptForCodebaseSearch("Improve @codebase dashboard spacing"),
      "Improve dashboard spacing",
    );
  });

  it("boosts relevant files when @codebase is present", () => {
    const boosted = boostComposerMentionsInContext(
      {
        framework: "react",
        language: "typescript",
        packageManager: "npm",
        totalFiles: 3,
        totalFolders: 1,
        entryPoints: ["src/main.tsx"],
        files: [],
        symbols: [],
        relevantFiles: [],
      },
      "Improve dashboard header @codebase",
      SCAN,
    );
    assert.ok(boosted.relevantFiles && boosted.relevantFiles.length > 0);
    assert.match(boosted.repositoryPrompt ?? "", /@codebase/);
  });

  it("suggests @codebase in composer autocomplete", () => {
    const suggestions = buildMentionSuggestions(SCAN, "cod");
    assert.ok(suggestions.some((s) => s.insertText === "codebase"));
  });
});

describe("inlineTabSuggest", () => {
  it("completes partial symbol names", () => {
    assert.equal(suggestInlineTabSuffix("const dash", SYMBOLS), "board");
  });

  it("completes JSX component tags", () => {
    assert.equal(suggestInlineTabSuffix("return <Dash", SYMBOLS), "board");
  });

  it("returns null when no match", () => {
    assert.equal(suggestInlineTabSuffix("const x = 1", SYMBOLS), null);
  });
});
