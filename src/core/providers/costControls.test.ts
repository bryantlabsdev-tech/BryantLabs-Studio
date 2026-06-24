import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AiCallTracker } from "@/core/providers/costControls";
import type { ProviderSettings } from "@/core/providers/types";

function settings(maxAiCalls: number): ProviderSettings {
  return {
    provider: "gemini",
    geminiModel: "gemini-2.0-flash",
    maxAiCalls,
  } as ProviderSettings;
}

describe("AiCallTracker.tryRecordCall", () => {
  it("never allows used calls to exceed maxAiCalls", () => {
    const tracker = new AiCallTracker();
    const cfg = settings(3);

    assert.equal(tracker.tryRecordCall(cfg).ok, true);
    assert.equal(tracker.tryRecordCall(cfg).ok, true);
    assert.equal(tracker.tryRecordCall(cfg).ok, true);
    const fourth = tracker.tryRecordCall(cfg);
    assert.equal(fourth.ok, false);
    if (!fourth.ok) {
      assert.match(fourth.reason, /Max AI calls reached \(3 per run\)/);
    }
    assert.equal(tracker.budget(cfg).usedCalls, 3);
    assert.equal(tracker.budget(cfg).remainingCalls, 0);
  });

  it("allows repair purpose to use the reserved greenfield call slot", () => {
    const tracker = new AiCallTracker();
    const cfg = settings(3);
    tracker.configureReservations({ repairReserve: 1, multiPhaseGreenfield: false });
    assert.equal(tracker.tryRecordCall(cfg, { purpose: "primary", stage: "greenfield" }).ok, true);
    assert.equal(tracker.tryRecordCall(cfg, { purpose: "retry", stage: "greenfield" }).ok, true);
    const blockedPrimary = tracker.canMakeCall(cfg, {
      purpose: "primary",
      stage: "greenfield",
    });
    assert.equal(blockedPrimary.ok, false);
    const allowedRepair = tracker.canMakeCall(cfg, {
      purpose: "repair",
      stage: "greenfield",
    });
    assert.equal(allowedRepair.ok, true);
  });

  it("skips greenfield repair holdback when multi-phase flag is set", () => {
    const tracker = new AiCallTracker();
    const cfg = settings(3);
    tracker.configureReservations({ repairReserve: 1, multiPhaseGreenfield: true });
    tracker.recordCall();
    tracker.recordCall();
    assert.equal(
      tracker.canMakeCall(cfg, { purpose: "primary", stage: "greenfield" }).ok,
      true,
    );
  });

  it("blocks multi-phase provider retry when one call remains for App phase", () => {
    const tracker = new AiCallTracker();
    const cfg = settings(3);
    tracker.configureReservations({ repairReserve: 0, multiPhaseGreenfield: true });
    tracker.recordCall();
    tracker.recordCall();
    const blocked = tracker.canMakeCall(cfg, { purpose: "retry", stage: "greenfield" });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.match(blocked.reason, /reserve 1 call for App integration/i);
    }
    assert.equal(
      tracker.canMakeCall(cfg, { purpose: "primary", stage: "greenfield" }).ok,
      true,
    );
  });
});
