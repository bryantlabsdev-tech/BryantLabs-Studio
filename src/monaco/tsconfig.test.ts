import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTsconfigCompilerOptions } from "@/monaco/tsconfig";

describe("parseTsconfigCompilerOptions", () => {
  it("reads jsx react-jsx and bundler moduleResolution", () => {
    const parsed = parseTsconfigCompilerOptions(`{
      "compilerOptions": {
        "strict": true,
        "jsx": "react-jsx",
        "moduleResolution": "bundler",
        "esModuleInterop": true
      }
    }`);
    assert.ok(parsed);
    assert.equal(parsed?.jsx, 4);
    assert.equal(parsed?.moduleResolution, 2);
    assert.equal(parsed?.esModuleInterop, true);
  });
});
