import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { destroyAllTerminals } from "./terminal.cjs";

describe("terminal lifecycle", () => {
  it("destroyAllTerminals is safe when no sessions exist", () => {
    assert.doesNotThrow(() => destroyAllTerminals());
  });

  it("destroyAllTerminals can be called repeatedly", () => {
    destroyAllTerminals();
    assert.doesNotThrow(() => destroyAllTerminals());
  });
});
