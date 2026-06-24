import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getProjectProblemsStatus,
  refreshProjectProblems,
  resetProjectProblemsState,
} from "./service.cjs";

describe("projectProblems service", () => {
  it("starts idle with no problems", () => {
    resetProjectProblemsState();
    const status = getProjectProblemsStatus();
    assert.equal(status.state, "idle");
    assert.equal(status.problems.length, 0);
  });

  it("parses diagnostics from a project with TypeScript errors", async () => {
    resetProjectProblemsState();
    const root = process.cwd();
    const status = await refreshProjectProblems(root);
    assert.ok(status.state === "ready" || status.state === "scanning");
    assert.equal(typeof status.ranAt, "number");
    assert.equal(
      status.errorCount + status.warningCount,
      status.problems.length,
    );
  });
});
