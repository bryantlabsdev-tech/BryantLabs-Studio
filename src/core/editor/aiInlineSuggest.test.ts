import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInlineSuggestPrompt,
  parseInlineSuggestResponse,
} from "@/core/editor/aiInlineSuggest";

describe("buildInlineSuggestPrompt", () => {
  it("includes cursor context", () => {
    const prompt = buildInlineSuggestPrompt({
      relPath: "src/App.tsx",
      languageId: "typescriptreact",
      linePrefix: "const elapsed = ",
      lineSuffix: "",
    });
    assert.match(prompt, /src\/App\.tsx/);
    assert.match(prompt, /const elapsed = /);
  });
});

describe("parseInlineSuggestResponse", () => {
  it("returns first-line suffix", () => {
    assert.equal(
      parseInlineSuggestResponse("Date.now()", "const elapsed = "),
      "Date.now()",
    );
  });

  it("strips wrapping quotes", () => {
    assert.equal(
      parseInlineSuggestResponse('"useState(0)"', "const [t, setT] = "),
      "useState(0)",
    );
  });

  it("rejects empty or overlong responses", () => {
    assert.equal(parseInlineSuggestResponse("", "const x = "), null);
    assert.equal(
      parseInlineSuggestResponse("x".repeat(130), "const x = "),
      null,
    );
  });
});
