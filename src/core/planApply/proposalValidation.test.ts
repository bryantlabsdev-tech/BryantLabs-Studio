import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWhitespaceOnlyChange,
  validateProposalPreservesExports,
  validateProposalQuality,
  validateProposalRelativeImports,
} from "@/core/planApply/proposalValidation";

describe("isWhitespaceOnlyChange", () => {
  it("detects whitespace-only edits", () => {
    assert.equal(isWhitespaceOnlyChange("a b", "a  b"), true);
    assert.equal(isWhitespaceOnlyChange("const x=1", "const x = 1"), true);
    assert.equal(isWhitespaceOnlyChange("const x=1", "const y=1"), false);
  });
});

describe("validateProposalQuality", () => {
  it("rejects identical content", () => {
    const r = validateProposalQuality("same", "same", "src/App.tsx");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /no changes/i);
  });

  it("rejects whitespace-only edits", () => {
    const r = validateProposalQuality("hello world", "hello  world", "src/App.tsx");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /whitespace/i);
  });

  it("accepts real edits", () => {
    const r = validateProposalQuality(
      "export function App() { return null; }",
      "export function App() { return <div />; }",
      "src/App.tsx",
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.stats.changed, true);
  });

  it("rejects invalid file targets", () => {
    const r = validateProposalQuality("a", "b", "../escape");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /Invalid file target/i);
  });

  it("rejects patches that remove exported symbols", () => {
    const before = "export function App() {}\nexport const VERSION = 1;";
    const after = "export function App() {}";
    const check = validateProposalPreservesExports(before, after);
    assert.equal(check.ok, false);
    if (!check.ok) assert.match(check.reason, /VERSION/);
    const r = validateProposalQuality(before, after, "src/App.tsx");
    assert.equal(r.ok, false);
  });

  it("rejects patches with unresolved relative imports", () => {
    const after = `import { History } from "./components/History";\nexport default function App() { return null; }`;
    const scan = {
      files: [{ path: "src/App.tsx", absPath: "/p/src/App.tsx" }],
    } as import("@/types").ProjectScan;
    const check = validateProposalRelativeImports(after, scan, "src/App.tsx");
    assert.equal(check.ok, false);
    if (!check.ok) assert.match(check.reason, /History/);
  });

  it("accepts patches with resolved relative imports", () => {
    const after = `import { AppShell } from "./components/AppShell";\nexport default function App() { return null; }`;
    const scan = {
      files: [
        { path: "src/App.tsx", absPath: "/p/src/App.tsx" },
        { path: "src/components/AppShell.tsx", absPath: "/p/src/components/AppShell.tsx" },
      ],
    } as import("@/types").ProjectScan;
    const check = validateProposalRelativeImports(after, scan, "src/App.tsx");
    assert.equal(check.ok, true);
  });
});
