import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePlan } from "@/core/planner";
import {
  getAgentStartGate,
  getAgentStartDisabledState,
  looksLikeGreenfieldNewAppPrompt,
  NO_PROJECT_FILES_MESSAGE,
} from "@/core/agent/agentReadiness";
import { mockProjectScan } from "@/core/repository/testScan";
import { buildRepositoryIndex } from "@/core/repository";

describe("empty project agent safety", () => {
  const emptyScan = mockProjectScan([]);

  it("generatePlan does not throw when scan has no files", () => {
    assert.doesNotThrow(() => {
      const plan = generatePlan("Build a calculator app", emptyScan);
      assert.equal(plan.files.length, 0);
      assert.match(plan.summary, /No project files found/i);
      assert.ok(
        plan.proposedChanges.some((c) => c.includes("No project files found")),
      );
    });
  });

  it("blocks agent start on empty folder with clear message", () => {
    const gate = getAgentStartGate({
      projectOpen: true,
      scan: emptyScan,
      scanStatus: "done",
      repository: buildRepositoryIndex(emptyScan),
      goalPrompt: "Improve the dashboard layout",
    });
    assert.equal(gate.blocked, true);
    assert.match(gate.reason ?? "", /No project files found/i);
    assert.equal(gate.suggestGreenfield, false);
  });

  it("routes new-app prompts to greenfield when folder is empty", () => {
    const gate = getAgentStartGate({
      projectOpen: true,
      scan: emptyScan,
      scanStatus: "done",
      repository: buildRepositoryIndex(emptyScan),
      goalPrompt: "Create a new calculator app from scratch",
    });
    assert.equal(gate.blocked, true);
    assert.equal(gate.suggestGreenfield, true);
    assert.match(gate.reason ?? "", /New App/i);
  });

  it("disables start agent while scan is in progress", () => {
    const disabled = getAgentStartDisabledState({
      projectOpen: true,
      scan: null,
      scanStatus: "scanning",
      repository: null,
    });
    assert.equal(disabled.blocked, true);
    assert.match(disabled.reason ?? "", /scan/i);
  });

  it("detects greenfield-style prompts", () => {
    assert.equal(
      looksLikeGreenfieldNewAppPrompt("Generate a todo app in this empty folder"),
      true,
    );
    assert.equal(
      looksLikeGreenfieldNewAppPrompt("Fix button alignment in App.tsx"),
      false,
    );
  });

  it("exposes the required empty-project message constant", () => {
    assert.match(NO_PROJECT_FILES_MESSAGE, /New App generation/i);
  });
});
