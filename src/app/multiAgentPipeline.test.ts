import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePipelineResumePhase } from "@/app/multiAgentPipeline";
import { createPipelineSession } from "@/core/pipeline/stateMachine";
import { finishPipelineStage, startPipelineStage } from "@/core/pipeline/stateMachine";

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
