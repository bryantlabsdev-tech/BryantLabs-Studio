import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeNamedComponentExport, parseTs2614Error } from "@/core/typescript/exportImportRepair";

describe("exportImportRepair", () => {
  it("parses TS2614 diagnostics", () => {
    const parsed = parseTs2614Error(
      `Module '"./components/Layout"' has no exported member 'Layout'. Did you mean to use 'import Layout from "./components/Layout"' instead?`,
    );
    assert.equal(parsed?.member, "Layout");
    assert.equal(parsed?.suggestDefaultImport, true);
  });

  it("converts const arrow Layout to named export function", () => {
    const source = `import { Outlet } from 'react-router-dom';\nconst Layout = () => {\n  return <div />;\n};\n`;
    const next = normalizeNamedComponentExport(source, "Layout");
    assert.match(next ?? "", /export function Layout\(\)/);
  });
});
