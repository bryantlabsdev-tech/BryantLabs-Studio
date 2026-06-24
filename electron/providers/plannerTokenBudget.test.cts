import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzePlannerTokenBudget,
  coercePlannerMaxOutputTokens,
  comparePlannerTokenBudgetScenarios,
  DEFAULT_PLANNER_MAX_OUTPUT_TOKENS,
  LEGACY_PLANNER_MAX_OUTPUT_TOKENS,
  PLANNER_TOKEN_BUDGET_INCREASE_HINT,
  resolvePlannerMaxOutputTokens,
  resolvePlannerRetryMaxOutputTokens,
} from "./plannerTokenBudget.cjs";

describe("coercePlannerMaxOutputTokens", () => {
  it("defaults invalid values to 8192", () => {
    assert.equal(coercePlannerMaxOutputTokens(undefined), DEFAULT_PLANNER_MAX_OUTPUT_TOKENS);
    assert.equal(coercePlannerMaxOutputTokens("nope"), DEFAULT_PLANNER_MAX_OUTPUT_TOKENS);
  });

  it("clamps to supported range", () => {
    assert.equal(coercePlannerMaxOutputTokens(512), 1024);
    assert.equal(coercePlannerMaxOutputTokens(99999), 16384);
    assert.equal(coercePlannerMaxOutputTokens(4096), 4096);
  });
});

describe("resolvePlannerRetryMaxOutputTokens", () => {
  it("doubles planner budget up to max", () => {
    assert.equal(resolvePlannerRetryMaxOutputTokens(4096), 8192);
    assert.equal(resolvePlannerRetryMaxOutputTokens(8192), 16384);
    assert.equal(resolvePlannerRetryMaxOutputTokens(12000), 16384);
  });
});

describe("analyzePlannerTokenBudget", () => {
  it("flags token starvation when thoughts consume legacy budget", () => {
    const analysis = analyzePlannerTokenBudget({
      maxOutputTokens: LEGACY_PLANNER_MAX_OUTPUT_TOKENS,
      usage: { thoughtsTokenCount: 1024, candidatesTokenCount: 0, totalTokenCount: 1024 },
      responseEmpty: true,
      finishReason: "MAX_TOKENS",
      model: "gemini-2.5-pro",
    });
    assert.equal(analysis.tokenStarvationLikely, true);
    assert.match(analysis.tokenBudgetHint ?? "", new RegExp(PLANNER_TOKEN_BUDGET_INCREASE_HINT));
    assert.equal(analysis.thoughtsTokenCount, 1024);
  });

  it("does not flag starvation when budget has headroom", () => {
    const analysis = analyzePlannerTokenBudget({
      maxOutputTokens: 8192,
      usage: { thoughtsTokenCount: 900, candidatesTokenCount: 120, totalTokenCount: 1020 },
      responseEmpty: false,
      finishReason: "STOP",
      model: "gemini-2.5-pro",
    });
    assert.equal(analysis.tokenStarvationLikely, false);
    assert.equal(analysis.tokenBudgetHint, null);
  });
});

describe("comparePlannerTokenBudgetScenarios", () => {
  it("shows starvation only at low budgets for heavy thinking usage", () => {
    const scenarios = comparePlannerTokenBudgetScenarios(1000);
    const byBudget = Object.fromEntries(
      scenarios.map((s) => [s.maxOutputTokens, s.tokenStarvationLikely]),
    );
    assert.equal(byBudget[1024], true);
    assert.equal(byBudget[4096], false);
    assert.equal(byBudget[8192], false);
    assert.equal(byBudget[16384], false);
  });

  it("flags near-budget thinking usage at 4096 but not 8192", () => {
    const scenarios = comparePlannerTokenBudgetScenarios(3800);
    const byBudget = Object.fromEntries(
      scenarios.map((s) => [s.maxOutputTokens, s.tokenStarvationLikely]),
    );
    assert.equal(byBudget[1024], true);
    assert.equal(byBudget[4096], true);
    assert.equal(byBudget[8192], false);
    assert.equal(byBudget[16384], false);
  });
});

describe("resolvePlannerMaxOutputTokens", () => {
  it("reads configured planner budget from settings", () => {
    assert.equal(
      resolvePlannerMaxOutputTokens({ plannerMaxOutputTokens: 4096 }),
      4096,
    );
  });
});
