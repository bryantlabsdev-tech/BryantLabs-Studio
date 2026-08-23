import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countMultiPhaseGenerationCalls,
  MULTI_PHASE_PAGES_BATCH_SIZE,
  requiredMultiPhaseMaxAiCalls,
  splitPagesIntoBatches,
} from "@/core/greenfield/multiPhasePlan";

describe("multiPhasePlan", () => {
  it("uses one page per batch to stay within generation budgets", () => {
    assert.equal(MULTI_PHASE_PAGES_BATCH_SIZE, 1);
    const pages = ["a", "b", "c", "d", "e", "f", "g"];
    assert.deepEqual(splitPagesIntoBatches(pages), [
      ["a"],
      ["b"],
      ["c"],
      ["d"],
      ["e"],
      ["f"],
      ["g"],
    ]);
  });

  it("requires nine generation calls for FieldFlow (7 pages)", () => {
    assert.equal(countMultiPhaseGenerationCalls(7), 9);
    assert.equal(requiredMultiPhaseMaxAiCalls(7), 9);
  });

  it("requires four calls for two pages", () => {
    assert.equal(countMultiPhaseGenerationCalls(2), 4);
  });
});
