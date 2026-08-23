import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  planApplySessionAwaitsUserReview,
  resolvePlanApplySessionForApply,
  withAllReadyFilesApproved,
  applyContentForWrite,
  selectWritablePlanApplyFiles,
  type PlanApplySession,
} from "@/core/planApply";

function session(
  patch: Partial<PlanApplySession> &
    Pick<PlanApplySession, "phase" | "files">,
): PlanApplySession {
  return {
    applyRunId: "run-1",
    prompt: "Add filters",
    planSummary: "Add filters",
    planSource: "ai",
    applyTargetCount: patch.files.length,
    applySkippedCount: 0,
    selectedRelPath: null,
    applyError: null,
    verification: null,
    totals: null,
    ...patch,
  };
}

describe("planApplySessionAwaitsUserReview", () => {
  it("does not lock the composer after a zero-proposal failure", () => {
    const failed = session({
      phase: "failed",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "error",
          decision: "pending",
        },
      ],
    });
    assert.equal(planApplySessionAwaitsUserReview(failed), false);
  });

  it("does not treat an empty leftover review session as awaiting review", () => {
    const emptyReview = session({
      phase: "review",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "error",
          decision: "pending",
        },
      ],
    });
    assert.equal(planApplySessionAwaitsUserReview(emptyReview), false);
  });

  it("awaits review when a ready diff is present", () => {
    const ready = session({
      phase: "waiting_for_review",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "pending",
          diffStats: { added: 12, removed: 2, changed: true },
        },
      ],
    });
    assert.equal(planApplySessionAwaitsUserReview(ready), true);
  });
});

describe("resolvePlanApplySessionForApply", () => {
  it("approves ready diffs synchronously for Accept all", () => {
    const pending = session({
      phase: "waiting_for_review",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "pending",
          diffStats: { added: 12, removed: 2, changed: true },
        },
        {
          relPath: "src/index.css",
          absPath: "/tmp/src/index.css",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "pending",
          diffStats: { added: 0, removed: 0, changed: false },
        },
      ],
    });
    const approved = resolvePlanApplySessionForApply(pending, {
      approveReadyFiles: true,
    });
    assert.equal(approved.files[0]?.decision, "approved");
    assert.equal(approved.files[1]?.decision, "rejected");
    assert.equal(withAllReadyFilesApproved(pending).files[0]?.decision, "approved");
    assert.equal(pending.files[0]?.decision, "pending");
  });

  it("approves only named files for single-file accept", () => {
    const pending = session({
      phase: "waiting_for_review",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "pending",
          diffStats: { added: 1, removed: 0, changed: true },
        },
        {
          relPath: "src/main.tsx",
          absPath: "/tmp/src/main.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "pending",
          diffStats: { added: 1, removed: 0, changed: true },
        },
      ],
    });
    const approved = resolvePlanApplySessionForApply(pending, {
      approveRelPaths: ["src/App.tsx"],
    });
    assert.equal(approved.files[0]?.decision, "approved");
    assert.equal(approved.files[1]?.decision, "pending");
  });
});

describe("applyContentForWrite", () => {
  it("uses the full proposal on Accept all even if hunks were partially merged", () => {
    const ready = session({
      phase: "waiting_for_review",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "approved",
          basisContent: "old",
          appliedNewContent: "old",
          proposal: {
            summary: "edit",
            newContent: "new app",
            reasoning: "",
            risks: [],
          },
          diffStats: { added: 4, removed: 1, changed: true },
        },
      ],
    });
    assert.equal(applyContentForWrite(ready.files[0]!, { useFullProposal: true }), "new app");
    assert.equal(applyContentForWrite(ready.files[0]!), "old");
  });
});

describe("selectWritablePlanApplyFiles", () => {
  it("falls back to every ready diff when nothing is approved yet", () => {
    const pending = session({
      phase: "waiting_for_review",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "pending",
          basisContent: "old",
          proposal: {
            summary: "edit",
            newContent: "new app",
            reasoning: "",
            risks: [],
          },
          diffStats: { added: 4, removed: 1, changed: true },
        },
      ],
    });
    const files = selectWritablePlanApplyFiles(pending);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.relPath, "src/App.tsx");
  });
});
