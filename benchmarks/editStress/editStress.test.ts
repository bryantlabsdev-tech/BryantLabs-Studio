import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EDIT_STRESS_PROMPTS } from "./prompts";
import { runEditStressDryCase, runEditStressSuite } from "./runEditStressSuite";

describe("edit stress dry-run", () => {
  it("runs all defined brownfield edit scenarios", () => {
    assert.equal(EDIT_STRESS_PROMPTS.length, 11);
    const suite = runEditStressSuite();
    assert.equal(suite.total, 11);
    assert.equal(suite.targetMet, true, suite.runs.filter((r) => !r.ok).map((r) => `${r.id}: ${r.reason}`).join("; "));
  });

  it("routes sudoku gameplay to build_loop with App.tsx in plan", () => {
    const run = runEditStressDryCase(EDIT_STRESS_PROMPTS[0]!);
    assert.equal(run.ok, true);
    assert.equal(run.submitAction, "build_loop");
    assert.ok(run.planPaths.includes("src/App.tsx"));
  });
});

describe("edit stress live mock", () => {
  it("validates mock patches for all scenarios", async () => {
    const { runEditStressLiveSuite } = await import("./runEditStressLive");
    const suite = await runEditStressLiveSuite();
    assert.equal(suite.liveTargetMet, true, suite.runs.filter((r) => !r.liveOk).map((r) => `${r.id}: ${r.liveReason}`).join("; "));
  });
});

describe("edit stress provider pipeline", () => {
  it("proposes and applies sudoku gameplay via mock provider", async () => {
    const { runEditStressProviderCase } = await import("./runEditStressProvider");
    const run = await runEditStressProviderCase(EDIT_STRESS_PROMPTS[0]!, { skipVerify: true });
    assert.equal(run.providerOk, true, run.providerReason);
    assert.ok(run.validReady > 0);
    assert.equal(run.applyOk, true);
  });
});
