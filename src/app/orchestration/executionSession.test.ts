import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cancelMultiFileExecutionOrchestration,
  resetExecutionStepState,
} from "@/app/orchestration/executionSession";
import type { ExecutionSession } from "@/core/execution/types";

function minimalSession(): ExecutionSession {
  return {
    prompt: "test",
    planSummary: "summary",
    planSource: "ai",
    phase: "paused",
    currentStepId: null,
    pausedAtStepId: "step-1",
    applyError: "boom",
    steps: [
      {
        id: "step-1",
        index: 0,
        title: "Edit",
        description: "edit files",
        status: "failed",
        filePaths: ["src/A.tsx"],
        dependsOn: [],
        error: "failed",
      },
    ],
    files: [
      {
        relPath: "src/A.tsx",
        absPath: "/p/src/A.tsx",
        stepId: "step-1",
        planReason: "ui",
        selectionReason: "ai",
        isNewFile: false,
        status: "proposed",
        proposal: {
          summary: "ui",
          newContent: "after",
          reasoning: "test",
          risks: [],
        },
        basisContent: "before",
      },
      {
        relPath: "src/B.tsx",
        absPath: "/p/src/B.tsx",
        stepId: "step-1",
        planReason: "ui",
        selectionReason: "ai",
        isNewFile: false,
        status: "applied",
      },
    ],
    diagnostics: {
      executionPlanLines: [],
      completedSteps: 0,
      totalSteps: 1,
      filesModified: [],
      validationSummary: null,
    },
    verification: null,
  };
}

describe("resetExecutionStepState", () => {
  it("resets failed step and keeps proposals when clearProposals is false", () => {
    const updated = resetExecutionStepState(minimalSession(), "step-1", false);
    assert.equal(updated.phase, "ready");
    assert.equal(updated.steps[0]?.status, "pending");
    assert.equal(updated.files[0]?.status, "pending");
    assert.equal(updated.files[0]?.proposal?.newContent, "after");
    assert.equal(updated.files[1]?.status, "applied");
  });

  it("clears proposals when clearProposals is true", () => {
    const updated = resetExecutionStepState(minimalSession(), "step-1", true);
    assert.equal(updated.files[0]?.proposal, undefined);
    assert.equal(updated.files[0]?.status, "pending");
  });
});

describe("cancelMultiFileExecutionOrchestration", () => {
  it("clears session and error", () => {
    let session: ExecutionSession | null = minimalSession();
    let error: string | null = "err";
    cancelMultiFileExecutionOrchestration({
      setExecutionSession: (s) => {
        session = typeof s === "function" ? s(session) : s;
      },
      setExecutionError: (e) => {
        error = typeof e === "function" ? e(error) : e;
      },
    } as import("@/app/orchestration/executionTypes").ExecutionOrchestrationHost);
    assert.equal(session, null);
    assert.equal(error, null);
  });
});
