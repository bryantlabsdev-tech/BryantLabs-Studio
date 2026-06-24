import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearLastRoutingIntent,
  getLastRoutingIntent,
  isStudioTestMode,
  setLastRoutingIntent,
} from "./index";

describe("workspace hooks", () => {
  it("isStudioTestMode returns boolean", () => {
    assert.equal(typeof isStudioTestMode(), "boolean");
  });

  it("routing intent store round-trips", () => {
    clearLastRoutingIntent();
    assert.equal(getLastRoutingIntent(), null);
    setLastRoutingIntent({
      intent: "feature_addition",
      reason: "gameplay keywords",
      files_allowed: ["src/App.tsx"],
    });
    const stored = getLastRoutingIntent();
    assert.equal(stored?.intent, "feature_addition");
    assert.deepEqual(stored?.files_allowed, ["src/App.tsx"]);
    clearLastRoutingIntent();
  });
});
