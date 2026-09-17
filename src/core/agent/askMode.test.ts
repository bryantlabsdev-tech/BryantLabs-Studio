import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASK_MODE_READONLY_EXPLANATION,
  buildAskModeRoute,
  composerModeFromOverride,
  isAskComposerOverride,
  isMutationCapableExecution,
  overrideFromComposerMode,
  resolvePendingEditConfirmation,
} from "@/core/agent/askMode";
import { AUTO_APPLY_FOLLOW_UP_PATCHES } from "@/core/build/followUpPrefs";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";

const existingScan = mockProjectScan(["package.json", "src/App.tsx"]);
const emptyDecision = {
  candidates: ["consultation"],
  scannedSourceCount: 1,
  sourceCountUsed: 1,
  fallbackSourceCount: 0,
  greenfieldRejected: true,
  greenfieldRejectReason: null,
  selectedRoute: "pending",
  selectionReason: "pending",
};

describe("hard Ask mode", () => {
  it("maps composer Ask to a dedicated override, never auto", () => {
    assert.equal(overrideFromComposerMode("ask"), "ask");
    assert.notEqual(overrideFromComposerMode("ask"), "auto");
    assert.equal(composerModeFromOverride("ask"), "ask");
    assert.equal(composerModeFromOverride("auto"), "auto");
    assert.equal(overrideFromComposerMode("refactor"), "edit");
    assert.equal(overrideFromComposerMode("edit"), "edit");
    assert.equal(isAskComposerOverride("ask"), true);
    assert.equal(isAskComposerOverride("auto"), false);
  });

  it("routes Ask plus an explicit mutation prompt to consultation only", () => {
    const route = routeAgentPrompt({
      prompt: "Edit src/App.tsx and add a timer",
      projectOpen: true,
      scan: existingScan,
      scanStatus: "done",
      modeOverride: "ask",
    });
    assert.equal(route.execution, "consultation");
    assert.equal(route.mixedEdit, false);
    assert.equal(isMutationCapableExecution(route.execution), false);
    assert.match(route.activityNote ?? "", /read-only/i);
    assert.equal(route.reason, "override_ask_readonly");
  });

  it("does not start greenfield from Ask on an empty folder", () => {
    const route = routeAgentPrompt({
      prompt: "Build a Sudoku app",
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
      modeOverride: "ask",
    });
    assert.equal(route.execution, "consultation");
    assert.notEqual(route.execution, "greenfield");
    assert.equal(route.needsEmptyFolder, false);
  });

  it("does not route Ask terminal or run prompts to run_command", () => {
    for (const prompt of ["Run the build", "Run npm test in the terminal"]) {
      const route = routeAgentPrompt({
        prompt,
        projectOpen: true,
        scan: existingScan,
        scanStatus: "done",
        modeOverride: "ask",
      });
      assert.equal(route.execution, "consultation", prompt);
      assert.notEqual(route.execution, "run_command", prompt);
    }
  });

  it("does not apply a pending edit from confirmation while Ask is selected", () => {
    const decision = resolvePendingEditConfirmation({
      modeOverride: "ask",
      prompt: "Apply",
      pendingPrompt: "Add a timer",
      hasPendingReview: true,
    });
    assert.equal(decision.action, "keep_pending_explain_ask");
    const route = routeAgentPrompt({
      prompt: "Apply",
      projectOpen: true,
      scan: existingScan,
      scanStatus: "done",
      modeOverride: "ask",
    });
    assert.equal(route.execution, "consultation");
    assert.equal(route.reason, "override_ask_blocks_pending_apply");
  });

  it("does not treat Auto confirmation text as apply_pending", () => {
    const decision = resolvePendingEditConfirmation({
      modeOverride: "auto",
      prompt: "yes",
      pendingPrompt: "Add a timer",
      hasPendingReview: true,
    });
    assert.equal(decision.action, "ignore");
  });

  it("restores edit routing after leaving Ask", () => {
    const ask = routeAgentPrompt({
      prompt: "Add a timer to the board",
      projectOpen: true,
      scan: existingScan,
      scanStatus: "done",
      modeOverride: "ask",
    });
    assert.equal(ask.execution, "consultation");

    const auto = routeAgentPrompt({
      prompt: "Add a timer to the board",
      projectOpen: true,
      scan: existingScan,
      scanStatus: "done",
      modeOverride: "auto",
    });
    assert.equal(auto.execution, "build_loop");

    const edit = routeAgentPrompt({
      prompt: "Add a timer to the board",
      projectOpen: true,
      scan: existingScan,
      scanStatus: "done",
      modeOverride: "edit",
    });
    assert.equal(edit.execution, "build_loop");
  });

  it("does not change Refactor override mapping or auto routing", () => {
    assert.equal(overrideFromComposerMode("refactor"), "edit");
    const refactor = routeAgentPrompt({
      prompt: "Refactor the auth module",
      projectOpen: true,
      scan: existingScan,
      scanStatus: "done",
      modeOverride: "edit",
    });
    assert.equal(refactor.execution, "build_loop");

    const autoQuestion = routeAgentPrompt({
      prompt: "What does App.tsx do?",
      projectOpen: true,
      scan: existingScan,
      scanStatus: "done",
    });
    assert.equal(autoQuestion.execution, "consultation");
  });

  it("keeps review-first emergency auto-apply off", () => {
    assert.equal(AUTO_APPLY_FOLLOW_UP_PATCHES, false);
  });

  it("buildAskModeRoute never returns mixed_confirm", () => {
    const route = buildAskModeRoute({
      prompt: "Explain this code and simplify it",
      decision: emptyDecision,
    });
    assert.equal(route.execution, "consultation");
    assert.equal(route.mixedEdit, false);
    assert.ok(route.activityNote?.includes("read-only"));
    assert.equal(ASK_MODE_READONLY_EXPLANATION.includes("read-only"), true);
  });
});
