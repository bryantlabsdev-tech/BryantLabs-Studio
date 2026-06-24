import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outcomeLabel } from "@/core/agent/runOutcome";
import { runHistoryOutcomeLabel } from "@/core/agent/runHistoryOutcome";

describe("runHistoryOutcomeLabel", () => {
  it("maps terminal outcomes to display labels", () => {
    assert.equal(runHistoryOutcomeLabel("success"), "Complete");
    assert.equal(runHistoryOutcomeLabel("cancelled"), "Cancelled");
    assert.equal(runHistoryOutcomeLabel("failed"), "Failed");
    assert.equal(runHistoryOutcomeLabel("aborted"), "Aborted");
    assert.equal(runHistoryOutcomeLabel("interrupted"), "Interrupted");
    assert.equal(outcomeLabel("aborted"), "Aborted");
  });
});
