import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explicitWaitingLabel } from "./waitingStates.ts";

describe("waitingStates", () => {
  it("shows escalation note when provided", () => {
    assert.equal(
      explicitWaitingLabel("thinking", {
        escalationNote: "Gemini Flash timed out. Retrying with Gemini Pro…",
      }),
      "Gemini Flash timed out. Retrying with Gemini Pro…",
    );
  });

  it("maps phases to explicit labels", () => {
    assert.equal(explicitWaitingLabel("auditing"), "Understanding project…");
    assert.equal(explicitWaitingLabel("typescript"), "Testing changes…");
    assert.equal(explicitWaitingLabel("building"), "Testing changes…");
    assert.equal(explicitWaitingLabel("editing"), "Updating app…");
    assert.equal(explicitWaitingLabel("reviewing"), "Updating app…");
  });
});
