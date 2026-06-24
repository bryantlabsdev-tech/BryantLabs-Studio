import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanPreviewLine } from "./planPreview.ts";

describe("planPreview", () => {
  it("builds a one-line plan preview from prompt", () => {
    const line = buildPlanPreviewLine("Add a timer");
    assert.match(line, /Adding timer/i);
    assert.match(line, /validating build/i);
  });

  it("includes UI updates for style prompts", () => {
    const line = buildPlanPreviewLine("Make it blue");
    assert.match(line, /updating UI/i);
  });
});
