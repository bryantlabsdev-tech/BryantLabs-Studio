import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareContextSnapshot } from "@/core/contextInspector/prepare";
import { estimateTokens } from "@/core/contextInspector/tokens";
import { emptySessionMemory } from "@/core/sessionMemory";
import { EMPTY_PROJECT_MEMORY } from "@/core/projectMemory/types";
import { mockProjectScan } from "@/core/repository/testScan";

describe("context inspector", () => {
  it("estimates tokens from text length", () => {
    assert.ok(estimateTokens("hello world") > 0);
  });

  it("builds snapshot with repository and payload", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const snap = prepareContextSnapshot({
      operation: "ai_plan",
      provider: "ollama",
      model: "qwen2.5-coder:7b",
      originalPrompt: "Improve dashboard UI",
      scan,
      projectPath: "/project",
      sessionMemory: emptySessionMemory(),
      projectMemory: EMPTY_PROJECT_MEMORY,
    });
    assert.equal(snap.operation, "ai_plan");
    assert.ok(snap.repository.framework.length > 0);
    assert.ok(snap.finalPayload.framework);
    assert.ok(snap.requestPreview.includes("Improve"));
    assert.ok(snap.metrics.estimatedTotalTokens > 0);
    assert.ok(Array.isArray(snap.fileSelection.selectedFiles));
  });
});
