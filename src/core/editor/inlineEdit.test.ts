import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInlineEditPrompt, selectionFromMonaco } from "@/core/editor/inlineEdit";

describe("inlineEdit", () => {
  it("formats selection-scoped prompt", () => {
    const prompt = formatInlineEditPrompt("Add error handling", {
      relPath: "src/App.tsx",
      startLine: 10,
      endLine: 12,
      text: "function load() {}",
    });
    assert.match(prompt, /Add error handling/);
    assert.match(prompt, /lines 10–12/);
    assert.match(prompt, /SELECTED CODE BEGIN/);
  });

  it("rejects empty selection", () => {
    assert.equal(
      selectionFromMonaco("src/App.tsx", 1, 1, "   "),
      null,
    );
  });
});
