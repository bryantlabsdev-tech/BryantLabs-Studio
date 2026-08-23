import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveAiPatchReview,
  derivePlanApplyPatchReview,
} from "@/core/editor/patchReviewOverlay";
import type {
  PlanApplyFileEntry,
  PlanApplySession,
} from "@/core/planApply/types";

function createMockPlanApplySession(
  overrides: Partial<PlanApplySession> & {
    readonly files?: PlanApplyFileEntry[];
  } = {},
): PlanApplySession {
  const files = overrides.files ?? [];
  return {
    applyRunId: "test-run",
    prompt: "Test prompt",
    planSummary: "Test summary",
    planSource: "deterministic",
    applyTargetCount: files.length,
    applySkippedCount: 0,
    files,
    phase: "review",
    selectedRelPath: files[0]?.relPath ?? null,
    applyError: null,
    verification: null,
    totals: {
      filesChanged: files.filter((f) => f.diffStats?.changed).length,
      linesAdded: files.reduce((sum, f) => sum + (f.diffStats?.added ?? 0), 0),
      linesRemoved: files.reduce((sum, f) => sum + (f.diffStats?.removed ?? 0), 0),
      filesApproved: files.filter((f) => f.decision === "approved").length,
      filesApplied: 0,
    },
    ...overrides,
  };
}

function createReadyPlanApplyFile(
  overrides: Partial<PlanApplyFileEntry> = {},
): PlanApplyFileEntry {
  return {
    relPath: "src/App.tsx",
    absPath: "/proj/src/App.tsx",
    selectionReason: "plan target",
    planReason: "plan target",
    status: "ready",
    decision: "pending",
    basisContent: "before",
    proposal: {
      summary: "Update App",
      newContent: "after",
      reasoning: "Test change",
      risks: [],
    },
    diffStats: { added: 1, removed: 1, changed: true },
    ...overrides,
  };
}

describe("derivePlanApplyPatchReview", () => {
  it("returns inline review when active tab matches a ready proposal", () => {
    const session = createMockPlanApplySession({
      files: [createReadyPlanApplyFile()],
      selectedRelPath: "src/App.tsx",
    });

    const review = derivePlanApplyPatchReview(session, "/proj/src/App.tsx");
    assert.ok(review);
    assert.equal(review?.before, "before");
    assert.equal(review?.after, "after");
  });

  it("returns null when ai patch review takes precedence on other paths", () => {
    const aiReview = deriveAiPatchReview(null, "/proj/src/App.tsx");
    assert.equal(aiReview, null);
  });
});
