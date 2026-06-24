import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentTimelineEvents,
  deriveAgentRunLifecyclePhase,
  lifecyclePhaseLabel,
} from "@/core/agent/agentRunLifecycle";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

describe("agentRunLifecycle", () => {
  it("maps queued submission to lifecycle phase", () => {
    assert.equal(
      deriveAgentRunLifecyclePhase({
        submissionPending: true,
        greenfieldRun: emptyGreenfieldRun(),
        greenfieldPanelActive: false,
        buildRunning: false,
        buildPhase: "idle",
        scanStatus: "idle",
      }),
      "queued",
    );
  });

  it("builds timeline events from submission and logs", () => {
    const run = {
      ...emptyGreenfieldRun(),
      entries: [
        {
          id: "gen-1",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const events = buildAgentTimelineEvents({
      submissionAt: Date.now() - 1000,
      submissionPromptLength: 2400,
      activeRunId: "run-1",
      projectPath: "/tmp/app",
      greenfieldRun: run,
      timeline: null,
      buildError: null,
      planApplyError: null,
      pipelineError: null,
    });
    assert.ok(events.some((event) => event.label === "Prompt submitted"));
    assert.ok(events.some((event) => event.label === "Generation started"));
  });

  it("labels lifecycle phases for UI", () => {
    assert.equal(lifecyclePhaseLabel("running"), "Running");
    assert.equal(lifecyclePhaseLabel("failed"), "Failed");
  });
});
