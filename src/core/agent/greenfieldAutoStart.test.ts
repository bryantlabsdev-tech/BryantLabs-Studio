import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAutoStartEmbeddedGreenfield } from "@/core/agent/greenfieldAutoStart";

describe("greenfieldAutoStart after cancellation", () => {
  const ready = {
    embedded: true,
    autoStartGeneration: true,
    alreadyStarted: false,
    genStatus: "idle" as const,
    generateLocked: false,
    promptLength: 80,
    folderPresent: true,
    greenfieldRecovery: false,
  };

  it("starts a remounted generate after a cancelled snapshot", () => {
    assert.equal(
      shouldAutoStartEmbeddedGreenfield({
        ...ready,
        runResult: "cancelled",
      }),
      true,
    );
  });

  it("does not auto-start while the local generate status is still cancelled", () => {
    assert.equal(
      shouldAutoStartEmbeddedGreenfield({
        ...ready,
        genStatus: "cancelled",
        runResult: "cancelled",
      }),
      false,
    );
  });
});
