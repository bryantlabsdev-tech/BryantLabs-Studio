import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTypeScriptLike, monacoLanguageId } from "@/monaco/language";
import { parseTsconfigCompilerOptions, stripJsonComments } from "@/monaco/tsconfig";

describe("monaco language", () => {
  it("maps tsx to typescript", () => {
    assert.equal(monacoLanguageId("tsx", "src/App.tsx"), "typescript");
  });

  it("maps by extension when language null", () => {
    assert.equal(monacoLanguageId(null, "styles/main.css"), "css");
  });

  it("detects typescript-like ids", () => {
    assert.equal(isTypeScriptLike("typescript"), true);
    assert.equal(isTypeScriptLike("css"), false);
  });
});

describe("tsconfig parse", () => {
  it("strips line comments", () => {
    const raw = `{
      // comment
      "compilerOptions": { "strict": true }
    }`;
    const parsed = parseTsconfigCompilerOptions(raw);
    assert.equal(parsed?.strict, true);
  });

  it("stripJsonComments preserves strings with slashes", () => {
    const out = stripJsonComments('{"a": "http://x"}');
    assert.ok(out.includes("http://x"));
  });
});
