import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOptionalAccessFix } from "@/core/typescript/optionalAccessRepair";

describe("optionalAccessRepair", () => {
  it("adds nullish fallback for possibly undefined property access", () => {
    const source = "const label = part.partNumber.toUpperCase();\n";
    const fixed = applyOptionalAccessFix(source, {
      code: "TS18048",
      message: "'part.partNumber' is possibly 'undefined'.",
      file: "src/pages/PartsInventory.tsx",
      line: 1,
      column: 15,
      category: "error",
      raw: "",
    });
    assert.ok(fixed);
    assert.match(fixed!.content, /part\.partNumber \?\?/);
  });
});
