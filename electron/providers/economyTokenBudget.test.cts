import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePatchMaxOutputTokens } from "./economyTokenBudget.cjs";

describe("resolvePatchMaxOutputTokens", () => {
  it("uses the standard cap outside economy mode", () => {
    assert.equal(resolvePatchMaxOutputTokens({ costMode: "standard" }, 1), 16384);
    assert.equal(resolvePatchMaxOutputTokens({ costMode: "standard" }, 8), 16384);
  });

  it("lowers the cap for economy single-file patches", () => {
    assert.equal(resolvePatchMaxOutputTokens({ costMode: "economy" }, 1), 8192);
  });

  it("uses a higher economy cap for multi-file patches", () => {
    assert.equal(resolvePatchMaxOutputTokens({ costMode: "economy" }, 3), 12288);
  });
});
