import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLatestAction } from "@/core/greenfield/runLog";
import { partitionSummaryErrors } from "@/core/studioRun/summaryErrors";

describe("partitionSummaryErrors", () => {
  it("moves prior failures to previous attempts when latest action succeeded", () => {
    const partitioned = partitionSummaryErrors({
      latestAction: createLatestAction(
        "success",
        "Apply Plan completed",
      ),
      runResult: "success",
      rawErrors: [
        "[apply_plan] Apply Plan — no proposals generated",
        "[apply_plan] Apply Plan produced zero valid patch proposals",
      ],
    });
    assert.deepEqual(partitioned.errors, []);
    assert.equal(partitioned.previousAttemptErrors.length, 2);
  });

  it("keeps errors current when latest action failed", () => {
    const partitioned = partitionSummaryErrors({
      latestAction: createLatestAction(
        "failed",
        "Apply Plan — no proposals generated",
      ),
      runResult: "failed",
      rawErrors: ["[apply_plan] Apply Plan — no proposals generated"],
    });
    assert.equal(partitioned.errors.length, 1);
    assert.deepEqual(partitioned.previousAttemptErrors, []);
  });

  it("moves repaired TypeScript failures to previous repaired issues", () => {
    const partitioned = partitionSummaryErrors({
      latestAction: createLatestAction("failed", "UI audit failed", {
        stage: "ui_audit",
      }),
      runResult: "failed",
      rawErrors: [
        "[typescript] TypeScript check failed",
        "[ui_audit] UI audit failed",
      ],
      typescriptPassed: true,
      buildPassed: true,
    });
    assert.deepEqual(partitioned.errors, ["[ui_audit] UI audit failed"]);
    assert.ok(partitioned.previousAttemptErrors.some((line) => /typescript/i.test(line)));
  });
});
