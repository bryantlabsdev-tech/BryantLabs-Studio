import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeMultiAgentPipeline, resolvePipelineResumePhase } from "@/app/multiAgentPipeline";
import type { PipelineRunnerDeps } from "@/app/multiAgentPipeline";
import { createPipelineSession } from "@/core/pipeline/stateMachine";
import { finishPipelineStage, startPipelineStage } from "@/core/pipeline/stateMachine";
import { awaitFollowUpPipelineReviewApproval } from "@/core/build/followUpPrefs";
import { PipelineReviewGates } from "@/app/orchestration/pipelineGates";

describe("resolvePipelineResumePhase", () => {
  it("starts at planner for a fresh session", () => {
    const session = createPipelineSession("build auth");
    assert.equal(resolvePipelineResumePhase(session), "planner");
  });

  it("resumes at coder after planner success", () => {
    let session = createPipelineSession("build auth");
    session = {
      ...finishPipelineStage(session, "planner", true, "Plan ready"),
      plannerOutput: {
        goal: "build auth",
        intent: "feature",
        selectedFiles: [],
        selectedSymbols: [],
        risks: [],
        verificationPlan: "",
        executionSteps: [],
        summary: "Plan ready",
      },
      status: "planning",
    };
    assert.equal(resolvePipelineResumePhase(session), "coder");
  });

  it("resumes at verify loop when verifying", () => {
    let session = createPipelineSession("build auth");
    session = finishPipelineStage(session, "planner", true, "ok");
    session = finishPipelineStage(session, "coder", true, "ok");
    session = startPipelineStage(session, "verifier", {
      provider: "local",
      model: "local",
    });
    assert.equal(resolvePipelineResumePhase(session), "verify_loop");
  });

  it("waits at review when awaiting_review", () => {
    let session = createPipelineSession("build auth");
    session = { ...session, status: "awaiting_review" };
    assert.equal(resolvePipelineResumePhase(session), "review");
  });
});

function okVerification() {
  const step = {
    command: "skipped",
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
  return { typecheck: step, build: step, ranAt: Date.now() };
}

function pipelineDeps(overrides: Partial<PipelineRunnerDeps>): PipelineRunnerDeps {
  return {
    log: () => undefined,
    onSessionUpdate: () => undefined,
    runPlanner: async () => ({
      result: {
        ok: true,
        provider: "anthropic",
        model: "mock",
        latencyMs: 1,
        raw: {},
        plan: {
          summary: "Patch App",
          files: [{ path: "src/App.tsx", reason: "edit" }],
          reasoning: "",
          risks: [],
          confidence: "High",
        },
      },
      contextSnapshotId: null,
      routing: { provider: "anthropic", model: "mock" },
    }),
    runCoderPropose: async () => ({
      ok: true,
      contextSnapshotId: null,
      routing: { provider: "anthropic", model: "mock" },
      fileCount: 1,
    }),
    runApplyAndVerify: async () => ({
      ok: true,
      verification: okVerification(),
      applied: ["src/App.tsx"],
    }),
    runRepair: async () => ({
      ok: true,
      verification: okVerification(),
      routing: { provider: "anthropic", model: "mock" },
    }),
    awaitReviewApproval: async () => true,
    awaitRepairApproval: async () => true,
    getMaxRepairAttempts: () => 0,
    ...overrides,
  };
}

describe("pipeline review pause", () => {
  it("waits for approval then applies through runApplyAndVerify", async () => {
    const gates = new PipelineReviewGates();
    let applied = 0;
    let awaiting = false;
    const run = executeMultiAgentPipeline(
      "Add a timer",
      pipelineDeps({
        onSessionUpdate: (session) => {
          if (session.status === "awaiting_review") awaiting = true;
        },
        awaitReviewApproval: () =>
          awaitFollowUpPipelineReviewApproval(() => gates.awaitReviewApproval()),
        runApplyAndVerify: async () => {
          applied += 1;
          return {
            ok: true,
            verification: okVerification(),
            applied: ["src/App.tsx"],
          };
        },
      }),
    );
    const started = Date.now();
    while (!awaiting && Date.now() - started < 2_000) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(awaiting, true);
    assert.equal(applied, 0);
    gates.continueReview();
    const session = await run;
    assert.equal(applied, 1);
    assert.equal(session.status, "completed");
  });

  it("reject/cancel writes nothing and unblocks the run", async () => {
    const gates = new PipelineReviewGates();
    let applied = 0;
    let awaiting = false;
    const run = executeMultiAgentPipeline(
      "Add a timer",
      pipelineDeps({
        onSessionUpdate: (session) => {
          if (session.status === "awaiting_review") awaiting = true;
        },
        awaitReviewApproval: () =>
          awaitFollowUpPipelineReviewApproval(() => gates.awaitReviewApproval()),
        runApplyAndVerify: async () => {
          applied += 1;
          return {
            ok: true,
            verification: okVerification(),
            applied: ["src/App.tsx"],
          };
        },
      }),
    );
    const started = Date.now();
    while (!awaiting && Date.now() - started < 2_000) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(awaiting, true);
    gates.cancel(
      () => undefined,
      () => undefined,
    );
    const session = await run;
    assert.equal(applied, 0);
    assert.equal(session.status, "cancelled");
  });
});

