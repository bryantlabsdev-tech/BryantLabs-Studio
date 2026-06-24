import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyUnusedCleanupToFile,
  applyUnusedSymbolFix,
  extractUnusedSymbol,
  removeUnusedImportLine,
} from "@/core/typescript/unusedCleanup";

describe("unusedCleanup", () => {
  it("extracts unused symbol from TS6133 message", () => {
    assert.equal(
      extractUnusedSymbol("'useMemo' is declared but its value is never read."),
      "useMemo",
    );
  });

  it("removes unused named imports", () => {
    const source = `import { useMemo, useState } from "react";\n`;
    const next = removeUnusedImportLine(source, "useMemo");
    assert.equal(next, 'import { useState } from "react";\n');
  });

  it("removes unused const declaration line", () => {
    const source = "const unused = 1;\nexport const ok = 2;\n";
    const result = applyUnusedSymbolFix(source, {
      file: "src/a.ts",
      line: 1,
      column: 7,
      message: "'unused' is declared but its value is never read.",
    });
    assert.ok(result);
    assert.match(result!.content, /^export const ok = 2;\n?$/);
  });

  it("removes unused function declarations", () => {
    const source = [
      "function solveSudoku() {",
      "  return true;",
      "}",
      "export default function App() { return null; }",
    ].join("\n");
    const repaired = applyUnusedCleanupToFile(
      source,
      [
        {
          file: "src/App.tsx",
          line: 1,
          column: 10,
          message: "'solveSudoku' is declared but its value is never read.",
        },
      ],
      "src/App.tsx",
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /export default function App/);
    assert.doesNotMatch(repaired!.content, /solveSudoku/);
  });

  it("removes unused React default import without dropping useState", () => {
    const source = [
      "import React from 'react';",
      "export default function Estimates() {",
      "  const [items, setItems] = useState([]);",
      "  return null;",
      "}",
    ].join("\n");
    const result = applyUnusedSymbolFix(source, {
      file: "src/pages/Estimates.tsx",
      line: 1,
      column: 8,
      message: "'React' is declared but its value is never read.",
    });
    assert.ok(result);
    assert.match(result!.content, /import \{ useState \} from ["']react["']/);
  });

  it("prefixes unused useState setter in array destructuring", () => {
    const source = [
      "function App() {",
      "  const [jobs, setJobs] = useLocalStorage<Job[]>('fieldflow_jobs', []);",
      "  return jobs.length;",
      "}",
    ].join("\n");
    const result = applyUnusedSymbolFix(source, {
      file: "src/App.tsx",
      line: 2,
      column: 16,
      message: "'setJobs' is declared but its value is never read.",
    });
    assert.ok(result);
    assert.match(result!.content, /\[jobs, _setJobs\]/);
    assert.doesNotMatch(result!.content, /\[jobs\]/);
  });
});
