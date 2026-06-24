import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySyntaxCorruptionRepairs } from "@/core/typescript/syntaxCorruptionRepair";

describe("syntaxCorruptionRepair", () => {
  it("removes orphan keys after a corrupted return statement", () => {
    const source = [
      "const labels: Record<string, string> = {",
      "  a: 'A',",
      "};",
      "function x() {",
      "  const labels = { a: 'A' };",
      "  return labels.a;,",
      "  orphan: '',",
      "}",
    ].join("\n");

    const fixed = applySyntaxCorruptionRepairs(source);
    assert.ok(fixed);
    assert.doesNotMatch(fixed!, /orphan:/);
    assert.match(fixed!, /return labels\.a;/);
  });

  it("fixes nullish coalescing before method calls", () => {
    const source =
      'record.vehicle ?? "".toLowerCase().includes(term) || (record.name ?? "").includes(term)';
    const fixed = applySyntaxCorruptionRepairs(source);
    assert.ok(fixed);
    assert.match(fixed!, /\(record\.vehicle \?\? ""\)\.toLowerCase\(\)/);
  });

  it("removes duplicate import lines", () => {
    const source = [
      'import { useState } from "react";',
      'import { useState } from "react";',
      "export default function X() {}",
    ].join("\n");
    const fixed = applySyntaxCorruptionRepairs(source);
    assert.ok(fixed);
    assert.equal(fixed!.split('import { useState }').length - 1, 1);
  });

  it("fixes malformed nested react import blocks", () => {
    const source = [
      "import {",
      'import { useEffect, useMemo, useState } from "react";',
      "  createContext,",
      "  useContext,",
      "} from \"react\";",
      "export default function App() {}",
    ].join("\n");
    const fixed = applySyntaxCorruptionRepairs(source);
    assert.ok(fixed);
    assert.match(fixed!, /import \{ createContext, useContext, useEffect, useMemo, useState \} from "react"/);
    assert.equal((fixed!.match(/from "react"/g) ?? []).length, 1);
  });
});
