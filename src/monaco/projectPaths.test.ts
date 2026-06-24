import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTypeScriptLikePath,
  joinProjectPath,
} from "@/monaco/projectPaths";

describe("monaco projectPaths", () => {
  it("joinProjectPath normalizes slashes", () => {
    assert.equal(joinProjectPath("/tmp/app", "src/App.tsx"), "/tmp/app/src/App.tsx");
    assert.equal(joinProjectPath("/tmp/app/", "src/App.tsx"), "/tmp/app/src/App.tsx");
    assert.equal(joinProjectPath("/tmp/app", "src\\App.tsx"), "/tmp/app/src/App.tsx");
  });

  it("isTypeScriptLikePath matches TS/JS extensions", () => {
    assert.equal(isTypeScriptLikePath("src/App.tsx"), true);
    assert.equal(isTypeScriptLikePath("src/App.ts"), true);
    assert.equal(isTypeScriptLikePath("readme.md"), false);
    assert.equal(isTypeScriptLikePath("styles.css"), false);
  });
});
