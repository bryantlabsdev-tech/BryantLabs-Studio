import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanApplySession } from "@/core/planApply";
import {
  evaluatePlanApplyEditorSync,
  resolvePlanApplyEditorSyncTarget,
} from "@/app/workspace/planApplyEditorSync";

function session(overrides: Partial<PlanApplySession> = {}): PlanApplySession {
  return {
    applyRunId: "run-1",
    prompt: "Add a stats panel",
    planSummary: "Update App.tsx",
    planSource: "deterministic",
    applyTargetCount: 1,
    applySkippedCount: 0,
    files: [
      {
        relPath: "src/App.tsx",
        absPath: "/proj/src/App.tsx",
        selectionReason: "UI root",
        planReason: "UI root",
        status: "ready",
        decision: "pending",
        diffStats: { added: 12, removed: 2, changed: true },
      },
    ],
    phase: "waiting_for_review",
    selectedRelPath: "src/App.tsx",
    applyError: null,
    verification: null,
    totals: null,
    ...overrides,
  };
}

describe("planApplyEditorSync", () => {
  it("reveals the editor once when a review target first becomes ready", () => {
    const first = evaluatePlanApplyEditorSync(null, {
      session: session(),
      projectPath: "/proj",
    });
    assert.equal(first.reveal, true);
    assert.equal(first.target?.absPath, "/proj/src/App.tsx");
    assert.equal(first.nextKey, "run-1:/proj/src/App.tsx");

    const again = evaluatePlanApplyEditorSync(first.nextKey, {
      session: session({ files: [...session().files] }),
      projectPath: "/proj",
    });
    assert.equal(again.reveal, false);
    assert.equal(again.nextKey, first.nextKey);
  });

  it("does not steal Preview or other tabs while the same review stays active", () => {
    const revealed = evaluatePlanApplyEditorSync(null, {
      session: session(),
      projectPath: "/proj",
    });
    assert.equal(revealed.reveal, true);

    for (let i = 0; i < 8; i += 1) {
      const tick = evaluatePlanApplyEditorSync(revealed.nextKey, {
        session: session({
          files: session().files.map((file) => ({ ...file })),
        }),
        projectPath: "/proj",
      });
      assert.equal(tick.reveal, false, `tick ${i} must not re-force the review tab`);
    }
  });

  it("does not reveal while a generation is still proposing with no ready diffs", () => {
    const loadingSession = session({
      phase: "proposing",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/proj/src/App.tsx",
          selectionReason: "UI root",
          planReason: "UI root",
          status: "proposing",
          decision: "pending",
        },
      ],
    });
    const proposing = evaluatePlanApplyEditorSync(null, {
      session: loadingSession,
      projectPath: "/proj",
    });
    assert.equal(proposing.reveal, false);
    assert.equal(
      resolvePlanApplyEditorSyncTarget({
        session: loadingSession,
        projectPath: "/proj",
      }),
      null,
    );
  });

  it("reveals again only when the selected review file or run changes", () => {
    const first = evaluatePlanApplyEditorSync(null, {
      session: session(),
      projectPath: "/proj",
    });
    const otherFile = evaluatePlanApplyEditorSync(first.nextKey, {
      session: session({
        files: [
          ...session().files,
          {
            relPath: "src/index.css",
            absPath: "/proj/src/index.css",
            selectionReason: "styles",
            planReason: "styles",
            status: "ready",
            decision: "pending",
            diffStats: { added: 4, removed: 0, changed: true },
          },
        ],
        selectedRelPath: "src/index.css",
      }),
      projectPath: "/proj",
    });
    assert.equal(otherFile.reveal, true);
    assert.equal(otherFile.target?.relPath, "src/index.css");

    const nextRun = evaluatePlanApplyEditorSync(otherFile.nextKey, {
      session: session({ applyRunId: "run-2" }),
      projectPath: "/proj",
    });
    assert.equal(nextRun.reveal, true);
    assert.equal(nextRun.nextKey, "run-2:/proj/src/App.tsx");
  });

  it("clears the sync key when the session ends so a later review can reveal", () => {
    const first = evaluatePlanApplyEditorSync(null, {
      session: session(),
      projectPath: "/proj",
    });
    const cleared = evaluatePlanApplyEditorSync(first.nextKey, {
      session: null,
      projectPath: "/proj",
    });
    assert.equal(cleared.reveal, false);
    assert.equal(cleared.nextKey, null);

    const later = evaluatePlanApplyEditorSync(cleared.nextKey, {
      session: session(),
      projectPath: "/proj",
    });
    assert.equal(later.reveal, true);
  });
});
