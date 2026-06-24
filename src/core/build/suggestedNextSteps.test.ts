import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptySessionMemory, recordPrompt } from "@/core/sessionMemory/store";
import { suggestNextImprovements } from "./suggestedNextSteps.ts";

describe("suggestNextImprovements", () => {
  it("suggests domain-appropriate missing features", () => {
    const memory = recordPrompt(
      emptySessionMemory(),
      "Build a Sudoku game",
    );
    const steps = suggestNextImprovements(memory, [], [
      { id: "timer", label: "Timer", present: true },
      { id: "hint", label: "Hint system", present: false },
      { id: "stats", label: "Statistics", present: false },
    ]);
    assert.ok(steps.includes("Add hints"));
    assert.ok(steps.includes("Add statistics"));
  });

  it("suggests comparison features for cosmetics apps", () => {
    const memory = recordPrompt(
      emptySessionMemory(),
      "Compare quality, price, and user friendliness of cosmetics",
    );
    const steps = suggestNextImprovements(memory, [], [
      { id: "product_comparison", label: "Product comparison", present: true },
      { id: "filters", label: "Search and filters", present: false },
    ]);
    assert.ok(steps.includes("Add search and filters"));
    assert.ok(!steps.some((s) => /timer|hint|difficulty/i.test(s)));
  });
});
