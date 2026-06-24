import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCompletionProperties,
  isUnsafeObjectLiteralCompletionTarget,
} from "@/core/greenfield/repairConvergencePolicy";

describe("object literal completion guards", () => {
  it("blocks React and icon internal types", () => {
    assert.equal(isUnsafeObjectLiteralCompletionTarget("ForwardRefExoticComponent"), true);
    assert.equal(isUnsafeObjectLiteralCompletionTarget("LucideProps"), true);
    assert.equal(isUnsafeObjectLiteralCompletionTarget("Case"), false);
    assert.equal(isUnsafeObjectLiteralCompletionTarget("StudentProfile"), false);
  });

  it("filters internal react props", () => {
    assert.deepEqual(filterCompletionProperties(["id", "$$typeof", "ref", "name"]), [
      "id",
      "name",
    ]);
  });
});
