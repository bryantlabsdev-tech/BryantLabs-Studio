import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closestUnionLiteral,
  extractUnionLiterals,
  replaceLiteralOnLine,
} from "@/core/typescript/unionLiteralRepair";

describe("unionLiteralRepair", () => {
  it("extracts allowed union literals from diagnostic text", () => {
    const allowed = extractUnionLiterals('"Contract" | "Policy" | "Handbook" | "Review"');
    assert.deepEqual(allowed, ["Contract", "Policy", "Handbook", "Review"]);
  });

  it("maps a close literal to the nearest allowed value", () => {
    const closest = closestUnionLiteral('"rent increase"', [
      "rent_increase",
      "late_rent",
      "general",
    ]);
    assert.equal(closest, "rent_increase");
  });

  it("replaces a wrong literal on a source line", () => {
    const line = `  { id: "1", type: "Form", title: "Doc" },`;
    const next = replaceLiteralOnLine(line, '"Form"', "Review");
    assert.match(next!, /type: "Review"/);
  });
});
