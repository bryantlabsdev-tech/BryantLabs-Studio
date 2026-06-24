import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STRESS_PROMPTS_FAST_IDS,
  resolveStressPromptSelection,
  stressSuiteTarget,
} from "./promptSelection";
import { STRESS_PROMPTS } from "./prompts";

describe("promptSelection", () => {
  it("defines the curated fast 5-prompt set", () => {
    assert.deepEqual(STRESS_PROMPTS_FAST_IDS, [
      "fleetops-pro",
      "medtrack-clinic",
      "legalcase-vault",
      "inventory-command",
      "schoolops-portal",
    ]);
  });

  it("resolves --fast to five curated prompts", () => {
    const { suiteId, prompts } = resolveStressPromptSelection({ fast: true });
    assert.equal(suiteId, "fast");
    assert.equal(prompts.length, 5);
    assert.deepEqual(
      prompts.map((p) => p.id),
      [...STRESS_PROMPTS_FAST_IDS],
    );
  });

  it("resolves --limit 5 to the fast curated set", () => {
    const { suiteId, prompts } = resolveStressPromptSelection({ limit: 5 });
    assert.equal(suiteId, "fast");
    assert.equal(prompts.length, 5);
  });

  it("resolves full suite by default", () => {
    const { suiteId, prompts } = resolveStressPromptSelection({});
    assert.equal(suiteId, "full");
    assert.equal(prompts.length, STRESS_PROMPTS.length);
  });

  it("uses 4/5 pass target for fast suite", () => {
    const target = stressSuiteTarget("fast", 5);
    assert.equal(target.passTarget, 4);
    assert.equal(target.successRateTarget, 0.8);
  });
});
