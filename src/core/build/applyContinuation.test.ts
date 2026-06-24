import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatApplyContinuationFailure } from "@/core/build/applyContinuation";
import { shouldAutoContinueFollowUpApply } from "@/core/build/followUpPrefs";
import { buildUiAuditAdvisoryFixPrompt, recommendationsForUiAuditIssues } from "@/core/agent/uiAuditAdvisoryUx";

describe("applyContinuation", () => {
  it("auto-continues UI audit fix prompts", () => {
    const prompt = buildUiAuditAdvisoryFixPrompt({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
    });
    assert.equal(shouldAutoContinueFollowUpApply(prompt), true);
  });

  it("reports when apply never starts after planning", () => {
    const message = formatApplyContinuationFailure({
      applyResult: { validReady: 0, autoContinued: false },
      planFileCount: 2,
      autoContinue: true,
    });
    assert.match(message ?? "", /Apply did not start after planning/i);
  });

  it("returns null when waiting for review", () => {
    const message = formatApplyContinuationFailure({
      applyResult: { validReady: 2, autoContinued: false, waitingForReview: true },
      planFileCount: 2,
      autoContinue: false,
    });
    assert.equal(message, null);
  });
});
