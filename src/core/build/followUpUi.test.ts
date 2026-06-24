import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFollowUpLogMessage,
  formatUserFacingBuildError,
  resolveFollowUpDisplayPhase,
} from "@/core/build/followUpUi";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

function log(
  stage: GreenfieldRunLogEntry["stage"],
  message: string,
  status: GreenfieldRunLogEntry["status"] = "running",
): GreenfieldRunLogEntry {
  return {
    id: "1",
    timestamp: new Date().toISOString(),
    stage,
    status,
    message,
  };
}

describe("followUpUi", () => {
  it("maps build phases to simple follow-up labels", () => {
    assert.equal(
      resolveFollowUpDisplayPhase({
        buildPhase: "planning",
        planApplyPhase: null,
        recentLogs: [],
      }),
      "thinking",
    );
    assert.equal(
      resolveFollowUpDisplayPhase({
        buildPhase: "review",
        planApplyPhase: "review",
        recentLogs: [],
      }),
      "reviewing",
    );
  });

  it("hides internal log jargon", () => {
    assert.equal(
      formatFollowUpLogMessage(log("apply_plan", "[apply_plan] proposing patches")),
      "Generating changes…",
    );
    assert.equal(
      formatFollowUpLogMessage(log("preview", "Starting preview server")),
      "Starting preview server",
    );
  });

  it("rewrites technical errors into plain English", () => {
    assert.match(
      formatUserFacingBuildError("Apply Plan produced zero valid patch proposals.", {
        provider: "gemini",
      }),
      /could not generate valid changes/i,
    );
    assert.match(
      formatUserFacingBuildError("Provider budget exceeded or run cancelled."),
      /AI call limit/i,
    );
    assert.match(
      formatUserFacingBuildError(
        "Previous app generation failed before build completed. Submit the original creation prompt again.",
      ),
      /setup did not finish/i,
    );
  });
});
