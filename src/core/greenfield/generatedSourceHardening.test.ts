import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hardenGreenfieldProjectFiles,
  lineIsTruncated,
  repairTruncatedLines,
  repairTruncatedPageSource,
} from "@/core/greenfield/generatedSourceHardening";

describe("generatedSourceHardening", () => {
  it("detects truncated mock literals", () => {
    assert.equal(lineIsTruncated('  { id:...'), true);
    assert.equal(lineIsTruncated("export default function X() {}"), false);
  });

  it("removes truncated lines", () => {
    const source = `const rows = [
  { id: "1", name: "ok" },
  { id:...
];
export default function Page() { return null; }`;
    const result = repairTruncatedLines(source);
    assert.equal(result.removedLines, 1);
    assert.doesNotMatch(result.content, /\{ id:\.\.\./);
  });

  it("rewrites lucide imports to IconStub and scaffolds stub module", () => {
    const { files, fixes } = hardenGreenfieldProjectFiles([
      {
        path: "src/pages/Dashboard.tsx",
        content: `import { Truck } from "lucide-react";
export default function Dashboard() { return <Truck />; }`,
      },
    ]);
    assert.ok(fixes.some((f) => /icon/i.test(f)));
    const dash = files.find((f) => f.path === "src/pages/Dashboard.tsx")!;
    assert.doesNotMatch(dash.content, /lucide-react/);
    assert.match(dash.content, /IconStub/);
    assert.ok(files.some((f) => f.path === "src/components/IconStub.tsx"));
  });

  it("normalizes Layout and Sidebar to named exports", () => {
    const { files } = hardenGreenfieldProjectFiles([
      {
        path: "src/components/Layout.tsx",
        content: `import Sidebar from "./Sidebar";
export default function Layout() { return <Sidebar />; }`,
      },
      {
        path: "src/components/Sidebar.tsx",
        content: "export default function Sidebar() { return <nav />; }",
      },
    ]);
    const layout = files.find((f) => f.path === "src/components/Layout.tsx")!;
    const sidebar = files.find((f) => f.path === "src/components/Sidebar.tsx")!;
    assert.match(layout.content, /import \{ Sidebar \}/);
    assert.match(sidebar.content, /export function Sidebar/);
  });

  it("closes unclosed mock arrays when file ends mid-generation", () => {
    const source = [
      'import { useState } from "react";',
      "const mockInspections: Inspection[] = [",
      '  { id: "1", status: "Passed" },',
      "  { id:...",
    ].join("\n");
    const result = repairTruncatedPageSource(source, "src/pages/Inspections.tsx");
    assert.match(result.content, /\];\s*\nexport default function Inspections/);
    assert.doesNotMatch(result.content, /\{ id:\.\.\./);
  });
});
