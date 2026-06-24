import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentApplyPlanContext,
  buildAgentPlanContext,
} from "@/core/context/buildAgentContext";
import { emptySessionMemory } from "@/core/sessionMemory";
import { mockProjectScan } from "@/core/repository/testScan";
import type { ProjectMemory } from "@/core/projectMemory/types";

describe("buildAgentContext", () => {
  const scan = mockProjectScan(["src/App.tsx"]);

  const memory: ProjectMemory = {
    projectName: "Demo",
    architecture: "Vite + React",
    userPreferences: "Use Tailwind",
    notes: "Keep calculator in App.tsx",
    updatedAt: 1,
  };

  it("includes repository summary and project memory in AI plan context", () => {
    const { context } = buildAgentPlanContext(
      scan,
      "Improve calculator UI",
      emptySessionMemory(),
      memory,
    );
    assert.ok(context.repositorySummary?.includes("Project:"));
    assert.equal(context.bundler, "Vite");
    assert.ok((context.dependencies?.length ?? 0) > 0);
    assert.equal(context.projectMemory?.notes, memory.notes);
    assert.equal(context.repositoryPrompt, "Improve calculator UI");
    assert.ok(context.fileSelection?.selectedFiles.length !== undefined);
    assert.ok(context.fileSelection?.reasoning.length);
  });

  it("includes project memory in slim Apply Plan context", () => {
    const context = buildAgentApplyPlanContext(scan, {
      projectMemory: memory,
      slim: true,
    });
    assert.ok(context.repositorySummary);
    assert.equal(context.projectMemory?.architecture, memory.architecture);
    assert.equal(context.files.length, 0);
  });
});
