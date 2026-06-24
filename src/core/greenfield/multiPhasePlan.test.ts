import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countMultiPhaseGenerationCalls,
  requiredMultiPhaseMaxAiCalls,
  splitPagesIntoBatches,
} from "@/core/greenfield/multiPhasePlan";

describe("multiPhasePlan", () => {
  it("splits seven pages into three batches of three", () => {
    const pages = ["a", "b", "c", "d", "e", "f", "g"];
    assert.deepEqual(splitPagesIntoBatches(pages), [["a", "b", "c"], ["d", "e", "f"], ["g"]]);
  });

  it("requires five generation calls for FieldFlow (7 pages)", () => {
    assert.equal(countMultiPhaseGenerationCalls(7), 5);
    assert.equal(requiredMultiPhaseMaxAiCalls(7), 5);
  });

  it("requires three calls for two pages", () => {
    assert.equal(countMultiPhaseGenerationCalls(2), 3);
  });
});
