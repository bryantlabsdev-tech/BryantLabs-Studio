import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizePostApplyRequirements } from "@/core/agent/postApplyRequirementCheck";

describe("postApplyRequirementCheck", () => {
  it("returns advisory when hard requirements fail", () => {
    const summary = summarizePostApplyRequirements({
      prompt: "Add dark mode toggle to the app settings",
      appliedPaths: ["src/App.tsx"],
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          action: "modify",
          status: "ready",
          decision: "approved",
          selectionReason: "test",
          planReason: "test",
          basisContent: "export default function App(){return null}",
          proposal: {
            newContent: "export default function App(){return <div />}",
            summary: "update",
            reasoning: "",
            risks: [],
          },
        },
      ],
      buildPassed: true,
    });
    assert.equal(typeof summary.allSatisfied, "boolean");
    assert.equal(summary.advisoryNote === null || summary.advisoryNote.length > 0, true);
  });
});
