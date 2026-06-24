import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchAuthenticationDependency,
  promptRequiresAuthentication,
  promptRequiresCloudSave,
  promptRequiresLocalPersistence,
  stripInfrastructureExclusions,
} from "@/core/intelligence/authDependency";
import { analyzeFeasibility } from "@/core/intelligence/feasibility";
import { buildFeatureInventoryFromScan } from "@/core/intelligence/featureInventory";
import { mockProjectScan } from "@/core/repository/testScan";

export const SUDOKU_UPGRADE_PROMPT = `Upgrade the Sudoku app, but keep it stable.
Add Timer, Mistake counter, New Game, Difficulty levels, Hints, highlights, prevent changing original puzzle numbers, win message, mobile layout.
Do not add backend, auth, or API calls.`;

describe("authDependency", () => {
  it("does not require auth for the exact Sudoku upgrade prompt", () => {
    assert.equal(promptRequiresAuthentication(SUDOKU_UPGRADE_PROMPT), false);
    assert.equal(matchAuthenticationDependency(SUDOKU_UPGRADE_PROMPT).required, false);
  });

  it("strips negated auth/backend/api clauses before matching", () => {
    const stripped = stripInfrastructureExclusions(
      "Do not add backend, auth, or API calls.",
    );
    assert.equal(/\bauth\b/i.test(stripped), false);
    assert.equal(/\bapi\b/i.test(stripped), false);
  });

  it("does not false-positive on design upgrade (sign up substring)", () => {
    assert.equal(promptRequiresAuthentication("design upgrade"), false);
  });

  it("does not match bare negated auth mentions", () => {
    assert.equal(promptRequiresAuthentication("Do not add auth"), false);
    assert.equal(promptRequiresAuthentication("No authentication required"), false);
  });

  it("requires auth only for explicit account and identity phrases", () => {
    for (const prompt of [
      "Add login page",
      "Add sign up flow",
      "Add user accounts",
      "Add profiles",
      "Add admin roles",
      "Add OAuth login",
      "Add protected routes",
    ]) {
      assert.equal(promptRequiresAuthentication(prompt), true, prompt);
    }
    assert.equal(promptRequiresCloudSave("Add saved cloud progress"), true);
  });

  it("does not require localStorage for remembering difficulty settings", () => {
    assert.equal(
      promptRequiresLocalPersistence("Remember the last difficulty setting"),
      false,
    );
  });

  it("does not require auth for game-local feature list", () => {
    const prompt =
      "Add timer, hints, difficulty, new game, mistake counter, highlights, and win message";
    assert.equal(promptRequiresAuthentication(prompt), false);
    assert.equal(promptRequiresCloudSave(prompt), false);
  });
});

describe("feasibility auth gating", () => {
  const inv = buildFeatureInventoryFromScan(mockProjectScan(["src/App.tsx"]), "/p");

  it("does not gate the exact Sudoku upgrade prompt on authentication", () => {
    const result = analyzeFeasibility(SUDOKU_UPGRADE_PROMPT, inv);
    assert.equal(result.requiresConfirmation, false);
    assert.ok(!result.missingLabels.includes("Authentication"));
    assert.equal(result.traces?.some((t) => t.addsLabels.includes("Authentication")), false);
  });

  it("gates cloud save on auth and database", () => {
    const result = analyzeFeasibility("Add saved cloud progress", inv);
    assert.equal(result.requiresConfirmation, true);
    assert.ok(result.missingLabels.includes("Authentication"));
    assert.ok(result.missingLabels.includes("Database"));
    assert.equal(result.traces?.[0]?.ruleId, "cloud_save");
  });
});
