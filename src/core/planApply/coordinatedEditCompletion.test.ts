import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateIncompleteCoordinatedApply,
  promptRequiresAppImplementation,
  promptRequiresCoordinatedTsxAndCss,
} from "@/core/planApply/coordinatedEditCompletion";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

function file(
  relPath: string,
  status: PlanApplyFileEntry["status"],
  changed = status === "ready",
  error?: string,
): PlanApplyFileEntry {
  return {
    relPath,
    absPath: `/p/${relPath}`,
    selectionReason: "test",
    planReason: "test",
    status,
    decision: status === "ready" ? "pending" : "rejected",
    ...(error ? { error } : {}),
    diffStats: { added: changed ? 4 : 0, removed: 0, changed },
  };
}

describe("coordinated follow-up completion", () => {
  const priorityPrompt =
    "Add priority and due dates to each task, with priority filtering and overdue highlighting.";

  it("treats priority/due-date requests as App.tsx implementation work", () => {
    assert.equal(promptRequiresAppImplementation(priorityPrompt), true);
    assert.equal(promptRequiresCoordinatedTsxAndCss(priorityPrompt), true);
  });

  it("fails when CSS applied but App.tsx produced no proposal", () => {
    const result = evaluateIncompleteCoordinatedApply({
      prompt: priorityPrompt,
      targetPaths: ["src/App.tsx", "src/index.css"],
      files: [
        file("src/index.css", "ready", true),
        file(
          "src/App.tsx",
          "error",
          false,
          "The request body is not valid JSON: unexpected end of data: line 1 column 8242 (char 8241)",
        ),
      ],
    });
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.missing, ["src/App.tsx"]);
    assert.match(result.message ?? "", /Incomplete patch batch/);
    assert.match(result.message ?? "", /src\/App\.tsx/);
    assert.match(result.message ?? "", /src\/index\.css/);
  });

  it("passes when both App.tsx and CSS have valid proposals", () => {
    const result = evaluateIncompleteCoordinatedApply({
      prompt: priorityPrompt,
      targetPaths: ["src/App.tsx", "src/index.css"],
      files: [file("src/App.tsx", "ready", true), file("src/index.css", "ready", true)],
    });
    assert.equal(result.incomplete, false);
    assert.equal(result.message, null);
  });

  it("does not require CSS for a logic-only follow-up", () => {
    const result = evaluateIncompleteCoordinatedApply({
      prompt: "Add a Clear Completed button with a confirmation step.",
      targetPaths: ["src/App.tsx"],
      files: [file("src/App.tsx", "ready", true)],
    });
    assert.equal(result.incomplete, false);
  });

  it("does not fail a batch when an optional unchanged target has no diff", () => {
    const result = evaluateIncompleteCoordinatedApply({
      prompt: "Add a Clear Completed button with a confirmation step.",
      targetPaths: ["src/App.tsx", "src/index.css"],
      files: [
        file("src/App.tsx", "ready", true),
        file("src/index.css", "ready", false),
      ],
    });
    assert.equal(result.incomplete, false);
    assert.deepEqual(result.missing, []);
  });

  it("requires App.tsx for a hint-under-field follow-up even when CSS applied", () => {
    const prompt =
      "Add a small hint under the add-task field that says Press Enter to add a task.";
    assert.equal(promptRequiresAppImplementation(prompt), true);
    const result = evaluateIncompleteCoordinatedApply({
      prompt,
      targetPaths: ["src/App.tsx", "src/index.css"],
      files: [
        file("src/index.css", "ready", true),
        file("src/App.tsx", "error", false, "Missing @@FILE block for src/App.tsx"),
      ],
    });
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.missing, ["src/App.tsx"]);
  });

  it("requires App.tsx for a footer copy follow-up", () => {
    const prompt = "Add a small footer that says Made with BryantLabs Studio.";
    assert.equal(promptRequiresAppImplementation(prompt), true);
    const result = evaluateIncompleteCoordinatedApply({
      prompt,
      targetPaths: ["src/App.tsx", "src/index.css"],
      files: [file("src/index.css", "ready", true), file("src/App.tsx", "error", false)],
    });
    assert.equal(result.incomplete, true);
  });

  it("fails when App/types applied but Tasks.tsx stayed in error", () => {
    const result = evaluateIncompleteCoordinatedApply({
      prompt:
        "Expand Northstar with a complete Kanban and planning system with milestones.",
      targetPaths: [
        "src/App.tsx",
        "src/types.ts",
        "src/pages/Tasks.tsx",
        "src/pages/Projects.tsx",
      ],
      files: [
        file("src/App.tsx", "ready"),
        file("src/types.ts", "ready"),
        file("src/pages/Tasks.tsx", "error", false, "Missing @@FILE block"),
        file("src/pages/Projects.tsx", "error", false, "Missing @@FILE block"),
      ],
    });
    assert.equal(result.incomplete, true);
    assert.ok(result.missing.includes("src/pages/Tasks.tsx"));
    assert.ok(result.missing.includes("src/pages/Projects.tsx"));
  });

  it("never treats main.tsx or .gitkeep as required incomplete targets", () => {
    const result = evaluateIncompleteCoordinatedApply({
      prompt: "Add priorities and due dates to tasks.",
      targetPaths: [
        "src/App.tsx",
        "src/main.tsx",
        "src/index.css",
        ".gitkeep",
        "src/types.ts",
      ],
      files: [
        file("src/App.tsx", "ready", true),
        file("src/index.css", "ready", true),
        file("src/types.ts", "ready", true),
        file("src/main.tsx", "error", false, "Missing @@FILE block for src/main.tsx"),
        file(".gitkeep", "ready", true),
      ],
    });
    assert.equal(result.incomplete, false);
    assert.ok(!result.missing.includes("src/main.tsx"));
    assert.ok(!result.missing.includes(".gitkeep"));
    assert.ok(!(result.message ?? "").includes("main.tsx"));
  });

  it("refuses CSS-only patches for mixed filter + overdue highlight", () => {
    const prompt =
      "Add a high-priority-only filter and visually highlight overdue incomplete tasks.";
    assert.equal(promptRequiresAppImplementation(prompt), true);
    assert.equal(promptRequiresCoordinatedTsxAndCss(prompt), true);
    const incomplete = evaluateIncompleteCoordinatedApply({
      prompt,
      targetPaths: ["src/App.tsx", "src/index.css", "src/main.tsx"],
      files: [
        file("src/index.css", "ready", true),
        file("src/App.tsx", "error", false, "Missing @@FILE block for src/App.tsx"),
      ],
    });
    assert.equal(incomplete.incomplete, true);
    assert.deepEqual(incomplete.missing, ["src/App.tsx"]);
    const complete = evaluateIncompleteCoordinatedApply({
      prompt,
      targetPaths: ["src/App.tsx", "src/index.css"],
      files: [file("src/App.tsx", "ready", true), file("src/index.css", "ready", true)],
    });
    assert.equal(complete.incomplete, false);
  });
});
