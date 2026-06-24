import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAlignUseStateWithRelaxedMock } from "@/core/greenfield/repairConvergencePolicy";

describe("repair convergence page gates", () => {
  it("skips useState alignment on page files", () => {
    assert.equal(shouldAlignUseStateWithRelaxedMock("src/pages/Cases.tsx"), false);
    assert.equal(shouldAlignUseStateWithRelaxedMock("src/hooks/useCases.ts"), true);
  });
});
