import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  clearPatchGeneratedWatchdog,
  notifyPatchApplyStageReached,
  startPatchApplyWatchdog,
} from "./patchApplyWatchdog.ts";

describe("patchApplyWatchdog", () => {
  it("fires after 30 seconds without apply stage", () => {
    mock.timers.enable({ apis: ["setInterval", "Date"] });
    try {
      const messages: string[] = [];
      startPatchApplyWatchdog((message) => messages.push(message));

      mock.timers.tick(31_000);
      clearPatchGeneratedWatchdog();

      assert.equal(messages.length, 1);
      assert.match(messages[0] ?? "", /Patch generated but not applied/);
    } finally {
      mock.timers.reset();
    }
  });

  it("clears when review stage is reached", () => {
    mock.timers.enable({ apis: ["setInterval", "Date"] });
    try {
      const messages: string[] = [];
      startPatchApplyWatchdog((message) => messages.push(message));
      notifyPatchApplyStageReached("waiting_for_review");

      mock.timers.tick(31_000);

      assert.equal(messages.length, 0);
    } finally {
      mock.timers.reset();
    }
  });
});
