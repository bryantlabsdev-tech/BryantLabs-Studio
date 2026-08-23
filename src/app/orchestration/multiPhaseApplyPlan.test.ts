import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildApplyPlanEditPhases,
  chunkTargetsForPhases,
  shouldUseMultiPhaseEdit,
} from "@/app/orchestration/multiPhaseApplyPlan";

describe("multiPhaseApplyPlan", () => {
  it("enables multi-phase for eight-file edits", () => {
    assert.equal(
      shouldUseMultiPhaseEdit({ prompt: "Add a timer", targetCount: 8 }),
      true,
    );
    assert.equal(
      shouldUseMultiPhaseEdit({ prompt: "Add a timer", targetCount: 2 }),
      false,
    );
  });

  it("chunks targets by phase plan", () => {
    const paths = [
      "src/types.ts",
      "src/hooks/useX.ts",
      "src/components/A.tsx",
      "src/components/B.tsx",
      "src/App.tsx",
      "src/index.css",
    ];
    const plan = buildApplyPlanEditPhases({
      prompt: "Kanban expansion",
      targetPaths: paths,
    });
    const targets = paths.map((relPath) => ({ relPath }));
    const chunks = chunkTargetsForPhases(targets, plan);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.targets.length <= 3));
  });
});
