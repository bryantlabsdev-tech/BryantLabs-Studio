import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AIPatchSession } from "@/core/planner/aiTypes";
import type { PlanApplySession } from "@/core/planApply/types";
import {
  deriveAiPatchReviewState,
  derivePlanApplyReviewState,
  groupPlanApplyFiles,
  planApplyChangedFiles,
} from "@/core/patch/patchReviewModel";

function aiSession(basis: string, proposed: string): AIPatchSession {
  return {
    relPath: "src/App.tsx",
    absPath: "/tmp/app/src/App.tsx",
    basisContent: basis,
    proposedAt: 1,
    patch: {
      ok: true,
      provider: "gemini",
      model: "flash",
      targetPath: "src/App.tsx",
      raw: {},
      latencyMs: 1,
      proposal: {
        newContent: proposed,
        summary: "Add feature",
        reasoning: "",
        risks: [],
      },
    },
  };
}

describe("patchReviewModel", () => {
  it("blocks apply when file is stale on disk", () => {
    const state = deriveAiPatchReviewState({
      session: aiSession("old", "new"),
      currentOnDisk: "changed on disk",
      approved: true,
      applyStatus: "idle",
    });
    assert.equal(state.stale, true);
    assert.equal(state.canApply, false);
    assert.equal(state.hasDiff, true);
  });

  it("allows approve before apply for ai patch", () => {
    const state = deriveAiPatchReviewState({
      session: aiSession("old", "new"),
      currentOnDisk: "old",
      approved: false,
      applyStatus: "idle",
    });
    assert.equal(state.canApprove, true);
    assert.equal(state.canApply, false);
  });

  it("collects changed plan apply files and groups them", () => {
    const session = {
      phase: "waiting_for_review",
      prompt: "Add history",
      planSummary: "History component",
      files: [
        {
          relPath: "src/History.tsx",
          action: "create",
          status: "ready",
          decision: "pending",
          diffStats: { changed: true, added: 40, removed: 0 },
          basisContent: "",
          proposal: { newContent: "export {}", summary: "new" },
        },
        {
          relPath: "src/App.tsx",
          action: "modify",
          status: "ready",
          decision: "pending",
          diffStats: { changed: true, added: 3, removed: 1 },
          basisContent: "a",
          proposal: { newContent: "b", summary: "wire" },
        },
      ],
    } as PlanApplySession;

    const changed = planApplyChangedFiles(session);
    assert.equal(changed.length, 2);

    const review = derivePlanApplyReviewState(session);
    assert.ok(review);
    assert.equal(review.canAcceptAll, true);
    assert.equal(review.canApplyApproved, false);

    const groups = groupPlanApplyFiles(changed);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.label, "New files");
    assert.equal(groups[1]?.label, "Modified files");
  });
});
