import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyAgentWorkspaceSession } from "@/core/agentWorkspace/store";
import { createAgentLoopSession } from "@/core/agentLoop/state";
import type { ExecutionSession } from "@/core/execution/types";
import {
  agentWorkspaceAfterApplyPlanSuccess,
  completeExecutionStepAsNoOp,
  agentLoopSessionAfterApplyPlanSuccess,
  executionSessionAfterApplyPlanSuccess,
  formatApplyPlanSuccessLatestAction,
  isApplyPlanOrchestrationComplete,
  isNoOpExecutionError,
  recordNoChangeFailure,
  shouldStopNoChangeRetry,
} from "@/core/orchestration/applyPlanSuccess";

const OUTCOME = {
  prompt: "Refine calculator UI",
  filesWritten: ["src/App.tsx", "src/index.css"],
  typecheckPassed: true,
  buildPassed: true,
  previewOk: true,
} as const;

function minimalExecutionSession(): ExecutionSession {
  return {
    prompt: OUTCOME.prompt,
    planSummary: "Polish UI",
    planSource: "ai",
    phase: "running",
    currentStepId: "step-1",
    pausedAtStepId: null,
    applyError: null,
    verification: null,
    steps: [
      {
        id: "step-1",
        index: 0,
        title: "Apply UI",
        description: "Patch UI files",
        status: "running",
        filePaths: ["src/App.tsx", "src/index.css"],
        dependsOn: [],
      },
    ],
    files: [
      {
        relPath: "src/App.tsx",
        absPath: "/p/src/App.tsx",
        stepId: "step-1",
        planReason: "UI",
        selectionReason: "entry",
        status: "proposing",
        isNewFile: false,
      },
      {
        relPath: "src/index.css",
        absPath: "/p/src/index.css",
        stepId: "step-1",
        planReason: "styles",
        selectionReason: "css",
        status: "pending",
        isNewFile: false,
      },
    ],
    diagnostics: {
      filesModified: [],
      executionPlanLines: ["1. Apply UI"],
      completedSteps: 0,
      totalSteps: 1,
      validationSummary: null,
    },
  };
}

describe("applyPlanSuccess orchestration", () => {
  it("detects complete apply plan success", () => {
    assert.equal(isApplyPlanOrchestrationComplete(OUTCOME), true);
    assert.equal(
      isApplyPlanOrchestrationComplete({ ...OUTCOME, typecheckPassed: false }),
      false,
    );
  });

  it("formats latest action for Apply Plan success", () => {
    const { summary, detail } = formatApplyPlanSuccessLatestAction(OUTCOME);
    assert.equal(summary, "Apply Plan completed");
    assert.match(detail, /Files written: src\/App\.tsx, src\/index\.css/);
    assert.match(detail, /TypeScript: passed/);
    assert.match(detail, /Build: passed/);
    assert.match(detail, /Preview: success/);
  });

  it("marks execution session done after apply plan", () => {
    const done = executionSessionAfterApplyPlanSuccess(
      minimalExecutionSession(),
      OUTCOME.filesWritten,
    );
    assert.equal(done.phase, "done");
    assert.equal(done.steps[0]?.status, "completed");
    assert.equal(done.files.every((f) => f.status === "applied"), true);
  });

  it("completes studio agent and dynamic plan steps", () => {
    const agent = agentLoopSessionAfterApplyPlanSuccess(
      createAgentLoopSession(OUTCOME.prompt),
      OUTCOME,
    );
    assert.equal(agent.status, "completed");
    assert.equal(agent.flags.executionDone, true);
    assert.equal(agent.flags.lastVerificationOk, true);
    const applyTask = agent.dynamicTasks.find((t) =>
      t.title.includes("Apply changes"),
    );
    const verifyTask = agent.dynamicTasks.find((t) =>
      t.title.includes("Verify and repair"),
    );
    assert.equal(applyTask?.status, "done");
    assert.equal(verifyTask?.status, "done");
  });

  it("marks agent workspace completed", () => {
    const ws = agentWorkspaceAfterApplyPlanSuccess(
      emptyAgentWorkspaceSession(),
      OUTCOME,
    );
    assert.equal(ws.status, "completed");
    const completeStage = ws.timeline.find((t) => t.id === "complete");
    assert.equal(completeStage?.status, "done");
  });

  it("detects no-op execution errors and stops after two", () => {
    assert.equal(
      isNoOpExecutionError("The edit produces no changes."),
      true,
    );
    const guard = new Map<string, number>();
    assert.equal(recordNoChangeFailure(guard, "s1"), 1);
    assert.equal(shouldStopNoChangeRetry(guard, "s1"), false);
    assert.equal(recordNoChangeFailure(guard, "s1"), 2);
    assert.equal(shouldStopNoChangeRetry(guard, "s1"), true);
  });

  it("marks execution step as no-op when changes already applied", () => {
    const session = completeExecutionStepAsNoOp(
      minimalExecutionSession(),
      "step-1",
      "Already applied via Apply Plan",
    );
    assert.equal(session.steps[0]?.status, "completed");
    assert.equal(session.files[0]?.status, "applied");
  });
});

describe("Apply Plan success stops execution retries (scenario)", () => {
  it("after success, execution session is terminal and agent is completed", () => {
    const exec = executionSessionAfterApplyPlanSuccess(
      minimalExecutionSession(),
      OUTCOME.filesWritten,
    );
    const agent = agentLoopSessionAfterApplyPlanSuccess(
      createAgentLoopSession(OUTCOME.prompt),
      OUTCOME,
    );
    assert.equal(exec.phase, "done");
    assert.equal(agent.status, "completed");
    assert.equal(agent.flags.executionDone, true);
    assert.equal(
      shouldStopNoChangeRetry(new Map([["step-1", 2]]), "step-1"),
      true,
    );
  });
});
