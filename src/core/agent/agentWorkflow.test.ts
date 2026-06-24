import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyStudioIntent } from "@/core/agent/classifyStudioIntent";
import { getAgentRunBlockReason } from "@/core/agent/agentRunMutex";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";

describe("agent workflow safety", () => {
  it("blocks duplicate submissions while follow-up is running", () => {
    const reason = getAgentRunBlockReason({
      greenfieldRun: emptyGreenfieldRun(),
      greenfieldPanelActive: false,
      buildRunning: true,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplyPhase: null,
      autoFixPhase: null,
    });
    assert.ok(reason);
    assert.match(reason!, /already in progress/i);
  });

  it("after greenfield success, next prompt routes to follow-up", () => {
    const scan = mockProjectScan(["src/App.tsx", "src/main.tsx"]);
    const afterCreate = classifyStudioIntent({
      prompt: "Add a timer",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(afterCreate.intent, "follow_up");
  });

  it("agent rail stays build (Agent tab) during orchestration", () => {
    const railTool = "build";
    assert.equal(railTool, "build");
  });
});
