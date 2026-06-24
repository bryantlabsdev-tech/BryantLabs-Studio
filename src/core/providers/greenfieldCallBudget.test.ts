import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiCallTracker } from "@/core/providers/costControls";
import {
  configureGreenfieldCallReservations,
  configureMultiPhaseGreenfieldCallReservations,
  greenfieldRepairReserve,
  stageLabelForAiCall,
} from "@/core/providers/greenfieldCallBudget";
import { normalizeProviderSettings } from "@/core/providers/orchestration";

function settingsWithMaxCalls(maxAiCalls: number) {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    hasGeminiKey: true,
    maxAiCalls,
  } as import("@/core/providers/types").ProviderSettings);
}

describe("greenfieldCallBudget", () => {
  it("reserves one repair call when max is at least 2", () => {
    assert.equal(greenfieldRepairReserve(1), 0);
    assert.equal(greenfieldRepairReserve(2), 1);
    assert.equal(greenfieldRepairReserve(3), 1);
  });

  it("blocks greenfield primary when only setup-repair reserve remains", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(3);
    configureGreenfieldCallReservations(tracker, settings);

    tracker.recordCall();
    tracker.recordCall();
    assert.equal(tracker.canMakeCall(settings, { purpose: "primary", stage: "greenfield" }).ok, false);
    assert.equal(tracker.canMakeCall(settings, { purpose: "repair", stage: "greenfield" }).ok, true);
    assert.equal(tracker.canMakeCall(settings, { purpose: "primary", stage: "repair" }).ok, true);
  });

  it("blocks retries once only repair reserve remains", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(3);
    configureGreenfieldCallReservations(tracker, settings);

    assert.equal(tracker.canMakeCall(settings, { purpose: "primary" }).ok, true);
    tracker.recordCall();
    assert.equal(tracker.canMakeCall(settings, { purpose: "retry" }).ok, true);
    tracker.recordCall();
    assert.equal(tracker.canMakeCall(settings, { purpose: "retry" }).ok, false);
    assert.equal(tracker.canMakeCall(settings, { purpose: "repair" }).ok, true);
  });

  it("bumps max calls to seven for nine-page FleetOps when user limit is three", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(3);
    configureMultiPhaseGreenfieldCallReservations(tracker, settings, 9);

    assert.equal(tracker.getMaxCallsOverride(), 7);
    for (let i = 0; i < 7; i++) {
      assert.equal(tracker.canMakeCall(settings, { purpose: "primary", stage: "greenfield" }).ok, true);
      tracker.recordCall();
    }
    assert.equal(tracker.canMakeCall(settings, { purpose: "primary", stage: "greenfield" }).ok, false);
  });

  it("reserves repair budget during multi-phase generation", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(8);
    const { repairReserve } = configureMultiPhaseGreenfieldCallReservations(
      tracker,
      settings,
      2,
    );
    assert.equal(repairReserve, 2);
  });

  it("allows five greenfield primary calls for two-page multi-phase after budget bump", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(3);
    configureMultiPhaseGreenfieldCallReservations(tracker, settings, 2);

    assert.equal(tracker.getMaxCallsOverride(), 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(tracker.canMakeCall(settings, { purpose: "primary", stage: "greenfield" }).ok, true);
      tracker.recordCall();
    }
    assert.equal(tracker.canMakeCall(settings, { purpose: "primary", stage: "greenfield" }).ok, false);
  });

  it("multi-phase flag bypasses accidental repair reserve holdback", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(3);
    configureMultiPhaseGreenfieldCallReservations(tracker, settings, 2);
    tracker.recordCall();
    tracker.recordCall();
    tracker.configureReservations({ repairReserve: 1 });
    assert.equal(
      tracker.canMakeCall(settings, { purpose: "primary", stage: "greenfield" }).ok,
      true,
    );
  });

  it("labels stages for run inspector usage", () => {
    assert.equal(stageLabelForAiCall("greenfield"), "Generation");
    assert.equal(stageLabelForAiCall("planner"), "Planner");
    assert.equal(stageLabelForAiCall("repair"), "Repair");
  });
});
