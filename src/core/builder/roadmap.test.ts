import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoadmap,
  extractGoalTitle,
  inferAppKind,
} from "@/core/builder/roadmap";

describe("builder roadmap", () => {
  it("infers task manager and builds 5 phases", () => {
    assert.equal(inferAppKind("Build a task manager app"), "task_manager");
    const goal = {
      rawPrompt: "Build a task manager app",
      title: extractGoalTitle("Build a task manager app"),
      createdAt: Date.now(),
    };
    const phases = buildRoadmap(goal);
    assert.equal(phases.length, 5);
    assert.match(phases[0]!.title, /Core UI/i);
  });

  it("infers calculator with fewer phases", () => {
    assert.equal(inferAppKind("Build a calculator"), "calculator");
    const phases = buildRoadmap({
      rawPrompt: "Build a calculator",
      title: "Calculator",
      createdAt: Date.now(),
    });
    assert.equal(phases.length, 3);
  });
});
