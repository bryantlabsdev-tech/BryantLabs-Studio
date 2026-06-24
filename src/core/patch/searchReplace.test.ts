import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySearchReplaceBlocks } from "@/core/patch/searchReplace";

describe("searchReplace", () => {
  it("applies a single search/replace block", () => {
    const source = `export function App() {
  return <div>Hello</div>;
}
`;
    const patch = `<<<< SEARCH
  return <div>Hello</div>;
=======
  return <div>Hello FleetOps</div>;
>>>> REPLACE`;
    const result = applySearchReplaceBlocks(source, patch);
    assert.equal(result.ok, true);
    assert.match(result.content ?? "", /Hello FleetOps/);
  });

  it("fails when search block is missing", () => {
    const result = applySearchReplaceBlocks("const x = 1;", "<<<< SEARCH\nmissing\n=======\ny\n>>>> REPLACE");
    assert.equal(result.ok, false);
  });
});
