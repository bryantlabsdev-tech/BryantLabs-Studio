import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockProjectScan } from "@/core/repository/testScan";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { buildAgentPlanContext } from "@/core/context/buildAgentContext";
import { normalizeProjectMemory } from "@/core/projectMemory/store";

describe("buildAgentPlanContext project rules", () => {
  it("injects projectRules into plan context", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const { context } = buildAgentPlanContext(
      scan,
      "Add dark mode toggle",
      emptySessionMemory(),
      normalizeProjectMemory(null),
      "/tmp/app",
      null,
      null,
      null,
      null,
      "Always use Tailwind utility classes.",
    );

    assert.equal(context.projectRules, "Always use Tailwind utility classes.");
    assert.match(context.repositoryPrompt ?? "", /Project rules \(must follow/);
    assert.match(context.repositoryPrompt ?? "", /Tailwind utility classes/);
  });
});
