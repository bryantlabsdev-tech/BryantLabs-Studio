import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActiveEditorReferencedContent,
  mergeActiveEditorPath,
  mergeActiveEditorReferencedContents,
  promptMentionsPath,
} from "@/core/context/activeEditorContext";

describe("activeEditorContext", () => {
  it("prepends active file path when not @mentioned", () => {
    const paths = mergeActiveEditorPath(["src/other.ts"], "src/App.tsx", "fix layout");
    assert.deepEqual(paths, ["src/App.tsx", "src/other.ts"]);
  });

  it("skips duplicate when prompt already @mentions file", () => {
    assert.equal(promptMentionsPath("update @src/App.tsx layout", "src/App.tsx"), true);
    const paths = mergeActiveEditorPath(["src/other.ts"], "src/App.tsx", "update @src/App.tsx");
    assert.deepEqual(paths, ["src/other.ts"]);
  });

  it("merges active editor content ahead of exploration results", () => {
    const merged = mergeActiveEditorReferencedContents(
      [{ path: "src/other.ts", content: "other" }],
      {
        relPath: "src/App.tsx",
        absPath: "/proj/src/App.tsx",
        content: "export function App() {}",
        selection: {
          relPath: "src/App.tsx",
          startLine: 2,
          endLine: 2,
          text: "return null",
        },
        updatedAt: Date.now(),
      },
      "fix layout",
    );
    assert.equal(merged[0]?.path, "src/App.tsx");
    assert.match(merged[0]?.content ?? "", /Active selection/);
    assert.equal(merged[1]?.path, "src/other.ts");
  });

  it("buildActiveEditorReferencedContent truncates large buffers", () => {
    const active = buildActiveEditorReferencedContent({
      relPath: "src/big.ts",
      absPath: "/proj/src/big.ts",
      content: "x".repeat(20_000),
      selection: null,
      updatedAt: Date.now(),
    });
    assert.ok(active);
    assert.ok(active!.content.length < 20_000);
  });
});
