import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PipelineReviewGates } from "@/app/orchestration/pipelineGates";
import { createApplyPlanRunController } from "@/app/orchestration/applyPlanRun";
import { publishFailureReportOrchestration } from "@/app/orchestration/failureReportOrchestration";
import { createPipelineSession } from "@/core/pipeline/stateMachine";
import { deriveBuildPhase } from "@/core/build/types";
import {
  emptyGreenfieldRun,
  type GreenfieldRunSnapshot,
} from "@/core/greenfield/runState";

describe("build loop phase derivation", () => {
  it("marks pipeline as planning while pipeline session runs", () => {
    const phase = deriveBuildPhase({
      mode: "pipeline",
      buildRunning: false,
      pipelineRunning: true,
      pipelineStatus: "planning",
      aiPlanStatus: "idle",
      planApplyPhase: null,
      autoFixPhase: null,
    });
    assert.equal(phase, "planning");
  });
});

describe("apply plan run controller", () => {
  it("tracks active and completed run ids", () => {
    const active = { current: null as string | null };
    const completed = { current: null as string | null };
    const logs: string[] = [];
    const ctrl = createApplyPlanRunController(
      active,
      completed,
      (_stage, _status, message) => {
        logs.push(message);
      },
    );
    const runId = ctrl.beginApplyPlanRun();
    assert.equal(active.current, runId);
    assert.equal(ctrl.isStaleApplyPlanRun(runId), false);
    ctrl.completeApplyPlanRun(runId);
    assert.equal(active.current, null);
    assert.equal(completed.current, runId);
    const staleId = ctrl.beginApplyPlanRun();
    ctrl.ignoreStaleApplyPlanResult(staleId, "late response");
    assert.match(logs.at(-1) ?? "", /stale/i);
  });
});

describe("failure report orchestration", () => {
  it("appends log entries and stores report on host", () => {
    const logs: Array<{ message: string; status: string }> = [];
    let snapshot: GreenfieldRunSnapshot = emptyGreenfieldRun();
    const host = {
      appendGreenfieldRunLog: (
        _stage: string,
        status: string,
        message: string,
      ) => {
        logs.push({ message, status });
      },
      updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => {
        snapshot = { ...snapshot, ...patch };
      },
    };

    publishFailureReportOrchestration(host, {
      rootStage: "typescript",
      rootCauseLine: "TypeScript failed in src/App.tsx",
      stages: [
        {
          stage: "typescript",
          outcome: "failed",
          role: "root",
          headline: "TS2304 cannot find name",
        },
      ],
    });

    assert.ok(logs.length > 0);
    assert.equal(
      (snapshot.failureReport as { rootCauseLine: string }).rootCauseLine,
      "TypeScript failed in src/App.tsx",
    );
    assert.equal(
      (snapshot.latestAction as { status: string }).status,
      "failed",
    );
  });
});

describe("pipeline review gates", () => {
  it("resolves review approval when continued", async () => {
    const gates = new PipelineReviewGates();
    const pending = gates.awaitReviewApproval();
    gates.continueReview();
    assert.equal(await pending, true);
  });

  it("rejects review when cancelled", async () => {
    const gates = new PipelineReviewGates();
    const pending = gates.awaitReviewApproval();
    gates.cancel(
      (updater) => {
        updater(createPipelineSession("goal"));
      },
      () => undefined,
    );
    assert.equal(await pending, false);
  });

  it("resolves repair approval when continued", async () => {
    const gates = new PipelineReviewGates();
    const pending = gates.awaitRepairApproval();
    gates.continueRepair();
    assert.equal(await pending, true);
  });
});
