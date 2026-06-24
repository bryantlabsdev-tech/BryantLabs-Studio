import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessPromptClarity } from "./promptConfidence.ts";

describe("promptConfidence", () => {
  it("asks one clarifying question when prompt is vague without context", () => {
    const result = assessPromptClarity("hints", {
      hasAppContext: false,
      hasProject: false,
    });
    assert.equal(result.confidence, "low");
    assert.ok(result.question);
  });

  it("auto-executes short edits when app context exists", () => {
    const result = assessPromptClarity("Add a timer", {
      hasAppContext: true,
      hasProject: true,
    });
    assert.equal(result.confidence, "high");
  });
});
