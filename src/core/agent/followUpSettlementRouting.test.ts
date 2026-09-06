import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeFollowUpSubmitAction,
  resolveFollowUpSubmitAction,
} from "@/core/agent/followUpExecution";
import {
  acquireSubmitOperation,
  canAcceptGreenfieldCompletion,
  canStartGreenfieldGenerate,
  createSubmitOperationId,
  markFollowUpAccepted,
  releaseSubmitOperation,
  type SubmitOperationGate,
} from "@/core/agent/followUpSubmitGate";
import {
  shouldAutoStartEmbeddedGreenfield,
  shouldResetGreenfieldAutoStartLatch,
} from "@/core/agent/greenfieldAutoStart";
import {
  incrementApplyPlanInvocations,
  incrementGenerateInvocations,
  recordSubmitRoutingDiagnostic,
  resetFollowUpSettlementDiagnostic,
  getFollowUpSettlementDiagnostic,
} from "@/core/agent/followUpSettlementDiagnostics";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";
import {
  evaluateIncompleteCoordinatedApply,
} from "@/core/planApply/coordinatedEditCompletion";
import {
  resolveApplyPlanSettlement,
  settleIncompleteCoordinatedApply,
} from "@/core/planApply/applyPlanSettlement";
import type { PlanApplyFileEntry, PlanApplySession } from "@/core/planApply/types";

const CREATE_PROMPT = "Build a simple calculator app";
const FOLLOW_UP_PROMPT = "Add a dark mode toggle to the calculator.";
const GAMEPLAY_PROMPT = "Upgrade Sudoku gameplay. Add notes mode and hints.";
const INCOMPLETE_GAMEPLAY =
  "Add priority and due dates to each task, with priority filtering and overdue highlighting.";

const WRITTEN = [
  "package.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
] as const;

function successfulCreateRun(projectPath: string) {
  return {
    ...emptyGreenfieldRun(),
    runResult: "success" as const,
    filesWritten: [...WRITTEN],
    targetFolder: projectPath,
    projectPath,
    actionType: "greenfield" as const,
  };
}

function readyFile(relPath: string, changed = true): PlanApplyFileEntry {
  return {
    relPath,
    absPath: `/p/${relPath}`,
    selectionReason: "test",
    planReason: "test",
    status: "ready",
    decision: "pending",
    diffStats: { added: changed ? 3 : 0, removed: 0, changed },
  };
}

function errorFile(relPath: string, error: string): PlanApplyFileEntry {
  return {
    relPath,
    absPath: `/p/${relPath}`,
    selectionReason: "test",
    planReason: "test",
    status: "error",
    decision: "rejected",
    error,
    diffStats: { added: 0, removed: 0, changed: false },
  };
}

describe("create-then-edit routing and settlement", () => {
  it("1. successful create then one edit: generate once, apply once, follow-up identity preserved", () => {
    resetFollowUpSettlementDiagnostic();
    const projectPath = "/tmp/calculator";
    const run = successfulCreateRun(projectPath);
    const staleScan = mockProjectScan([], { packageJson: false });

    incrementGenerateInvocations();
    assert.equal(getFollowUpSettlementDiagnostic().generateInvocations, 1);

    const followUpRoute = routeAgentPrompt({
      prompt: FOLLOW_UP_PROMPT,
      projectOpen: true,
      projectPath,
      scan: staleScan,
      scanStatus: "done",
      filesWritten: run.filesWritten,
      previousSuccessfulRun: true,
      fallbackSourceFileCount: run.filesWritten.length,
      projectSourceFilesExistOnDisk: true,
    });

    assert.notEqual(followUpRoute.execution, "greenfield");
    assert.equal(followUpRoute.execution, "build_loop");
    assert.equal(FOLLOW_UP_PROMPT.length, 41);
    assert.equal(CREATE_PROMPT.length, 29);
    assert.notEqual(FOLLOW_UP_PROMPT, CREATE_PROMPT);

    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: followUpRoute.execution,
      emptyProjectFolder: true,
      scan: staleScan,
      scanStatus: "done",
      fallbackSourceFileCount: run.filesWritten.length,
      filesWritten: run.filesWritten,
      previousSuccessfulRun: true,
      projectSourceFilesExistOnDisk: true,
      useAgentLoopForEdits: false,
    });
    assert.equal(action.kind, "build_loop");

    let generateCalls = 0;
    let applyCalls = 0;
    let executedPrompt = "";
    executeFollowUpSubmitAction(action, FOLLOW_UP_PROMPT, {
      startGreenfield: () => {
        generateCalls += 1;
      },
      startBuildLoop: (prompt) => {
        applyCalls += 1;
        executedPrompt = prompt;
        incrementApplyPlanInvocations();
      },
      startAgent: () => undefined,
      requestRescan: () => undefined,
      block: () => undefined,
    });

    assert.equal(generateCalls, 0);
    assert.equal(applyCalls, 1);
    assert.equal(executedPrompt, FOLLOW_UP_PROMPT);
    assert.equal(getFollowUpSettlementDiagnostic().generateInvocations, 1);
    assert.equal(getFollowUpSettlementDiagnostic().applyPlanInvocations, 1);

    recordSubmitRoutingDiagnostic({
      projectPath,
      indexedSourceFileCount: 0,
      promptLength: FOLLOW_UP_PROMPT.length,
      isFollowUp: true,
      submitEventId: "submit-follow-up",
      activeRunId: "run-2",
      greenfieldStatus: run.runResult,
      currentActionType: run.actionType,
      selectedRoutingDecision: followUpRoute.decision.selectedRoute,
      routingReason: followUpRoute.reason,
      scanStatus: "done",
      effectiveProjectScanSourceCount: run.filesWritten.length,
      projectFilesExistOnDisk: true,
    });
    const diag = getFollowUpSettlementDiagnostic();
    assert.equal(diag.followUpPromptLength, FOLLOW_UP_PROMPT.length);
    assert.equal(diag.selectedRoutingDecision, "build_loop");
    assert.notEqual(diag.selectedRoutingDecision, "greenfield");
  });

  it("2. follow-up while post-create rescan is pending waits, then routes to edit", () => {
    const projectPath = "/tmp/calculator";

    const pendingRoute = routeAgentPrompt({
      prompt: FOLLOW_UP_PROMPT,
      projectOpen: true,
      projectPath,
      scan: null,
      scanStatus: "scanning",
      previousSuccessfulRun: true,
      projectSourceFilesExistOnDisk: true,
    });
    assert.equal(pendingRoute.execution, "blocked");
    assert.match(pendingRoute.blockedReason ?? "", /scan/i);
    assert.notEqual(pendingRoute.execution, "greenfield");

    const pendingAction = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: pendingRoute.execution,
      emptyProjectFolder: true,
      scan: null,
      scanStatus: "scanning",
      previousSuccessfulRun: true,
      projectSourceFilesExistOnDisk: true,
      useAgentLoopForEdits: false,
    });
    assert.equal(pendingAction.kind, "wait_for_rescan");

    let rescans = 0;
    let greenfieldStarts = 0;
    executeFollowUpSubmitAction(pendingAction, FOLLOW_UP_PROMPT, {
      startGreenfield: () => {
        greenfieldStarts += 1;
      },
      startBuildLoop: () => undefined,
      startAgent: () => undefined,
      requestRescan: () => {
        rescans += 1;
      },
      block: () => undefined,
    });
    assert.equal(rescans, 1);
    assert.equal(greenfieldStarts, 0);

    const afterScan = routeAgentPrompt({
      prompt: FOLLOW_UP_PROMPT,
      projectOpen: true,
      projectPath,
      scan: mockProjectScan([...WRITTEN], { packageJson: true }),
      scanStatus: "done",
      filesWritten: [...WRITTEN],
      previousSuccessfulRun: true,
      fallbackSourceFileCount: WRITTEN.length,
      projectSourceFilesExistOnDisk: true,
    });
    assert.equal(afterScan.execution, "build_loop");
    assert.notEqual(afterScan.execution, "greenfield");
  });

  it("3. duplicate submit with the same operation ID executes once", () => {
    const gate: SubmitOperationGate = {
      inFlightOperationId: null,
      followUpAccepted: false,
    };
    const operationId = createSubmitOperationId("submit");
    const first = acquireSubmitOperation(gate, operationId);
    const second = acquireSubmitOperation(gate, operationId);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, "duplicate");

    const other = acquireSubmitOperation(gate, createSubmitOperationId("submit"));
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.reason, "in_flight");

    releaseSubmitOperation(gate, operationId);
    const afterRelease = acquireSubmitOperation(gate, createSubmitOperationId("submit"));
    assert.equal(afterRelease.ok, true);
  });

  it("4. late completion from an old create cannot restart generate or overwrite follow-up", () => {
    const gate: SubmitOperationGate = {
      inFlightOperationId: "submit-create",
      followUpAccepted: false,
    };
    markFollowUpAccepted(gate);
    gate.inFlightOperationId = "submit-follow-up";

    assert.equal(
      canAcceptGreenfieldCompletion({
        completingOperationId: "submit-create",
        activeOperationId: "submit-follow-up",
        followUpAccepted: gate.followUpAccepted,
      }),
      false,
    );
    assert.equal(
      canStartGreenfieldGenerate({
        followUpAccepted: true,
        alreadyGeneratedForOperation: true,
      }),
      false,
    );
    assert.equal(
      shouldAutoStartEmbeddedGreenfield({
        embedded: true,
        autoStartGeneration: true,
        alreadyStarted: true,
        genStatus: "done",
        generateLocked: false,
        promptLength: CREATE_PROMPT.length,
        folderPresent: true,
        greenfieldRecovery: false,
        runResult: "success",
        followUpAccepted: true,
      }),
      false,
    );
    assert.equal(
      shouldResetGreenfieldAutoStartLatch({
        alreadyStarted: true,
        genStatus: "done",
        runResult: "success",
      }),
      false,
    );
  });

  it("5. valid gameplay follow-up reaches waiting_for_review", () => {
    const files = [readyFile("src/App.tsx"), readyFile("src/index.css")];
    const incomplete = evaluateIncompleteCoordinatedApply({
      prompt: GAMEPLAY_PROMPT,
      targetPaths: ["src/App.tsx", "src/index.css"],
      files,
    });
    assert.equal(incomplete.incomplete, false);

    const terminal = resolveApplyPlanSettlement({
      phase: "waiting_for_review",
      validReady: 2,
      incomplete,
    });
    assert.equal(terminal.kind, "waiting_for_review");
    assert.equal(terminal.clearSession, false);
  });

  it("6. incomplete gameplay follow-up reaches a typed failure with no partial writes", () => {
    const files = [
      readyFile("src/index.css"),
      errorFile("src/App.tsx", "unexpected end of data"),
    ];
    const incomplete = evaluateIncompleteCoordinatedApply({
      prompt: INCOMPLETE_GAMEPLAY,
      targetPaths: ["src/App.tsx", "src/index.css"],
      files,
    });
    assert.equal(incomplete.incomplete, true);
    assert.ok(incomplete.missing.includes("src/App.tsx"));

    const proposing: PlanApplySession = {
      applyRunId: "apply-1",
      prompt: INCOMPLETE_GAMEPLAY,
      planSummary: "gameplay",
      planSource: "deterministic",
      applyTargetCount: 2,
      applySkippedCount: 0,
      files,
      phase: "proposing",
      selectedRelPath: "src/App.tsx",
      applyError: null,
      verification: null,
      totals: null,
    };
    let session: PlanApplySession | null = proposing;
    let error: string | null = null;
    let writes = 0;
    const terminal = settleIncompleteCoordinatedApply(
      {
        planApplySession: session,
        setPlanApplySession: (next) => {
          session = next;
        },
        setPlanApplyError: (next) => {
          error = next;
        },
        releaseBuildRunForReview: () => undefined,
      },
      incomplete,
    );

    assert.equal(terminal.kind, "failed");
    assert.ok(terminal.reason);
    assert.deepEqual([...terminal.missingTargets], ["src/App.tsx"]);
    assert.equal(session, null);
    assert.match(String(error), /Incomplete patch batch/);
    assert.equal(writes, 0);
    assert.notEqual(terminal.kind, "waiting_for_review");
  });
});
