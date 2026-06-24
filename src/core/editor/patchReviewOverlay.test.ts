import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveAiPatchReview,
  deriveSafeEditPatchReview,
  firstPatchChangeLine,
} from "@/core/editor/patchReviewOverlay";
import type { AIPatchSession } from "@/core/planner/aiTypes";

describe("patchReviewOverlay", () => {
  it("derives AI patch review for the active file", () => {
    const session: AIPatchSession = {
      basisContent: "const a = 1;\n",
      absPath: "/proj/src/App.tsx",
      relPath: "src/App.tsx",
      proposedAt: Date.now(),
      patch: {
        ok: true,
        provider: "anthropic",
        model: "claude",
        targetPath: "src/App.tsx",
        proposal: {
          summary: "update",
          newContent: "const a = 2;\n",
          reasoning: "x",
          risks: [],
        },
        raw: {},
        latencyMs: 1,
      },
    };
    const review = deriveAiPatchReview(session, "/proj/src/App.tsx");
    assert.equal(review?.after, "const a = 2;\n");
  });

  it("derives safe-edit patch review while reviewing", () => {
    const review = deriveSafeEditPatchReview(
      {
        kind: "replace-text",
        before: "old\n",
        after: "new\n",
        description: "replace",
      },
      true,
    );
    assert.equal(review?.before, "old\n");
    assert.equal(review?.after, "new\n");
  });

  it("finds the first changed line", () => {
    assert.equal(
      firstPatchChangeLine("a\nb\nc\n", "a\nB\nc\n"),
      2,
    );
  });
});
