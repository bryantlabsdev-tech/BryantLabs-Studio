import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAppDomain, isPuzzleGridSource } from "./classify.ts";
import { deriveProjectFacts } from "./capabilities.ts";
import { suggestNextSteps } from "./suggestions.ts";
import { emptySessionMemory, recordPrompt } from "@/core/sessionMemory/store";

describe("classifyAppDomain", () => {
  it("classifies cosmetics comparison prompts", () => {
    const profile = classifyAppDomain({
      prompt:
        "Compare quality, price, and user friendliness of cosmetics products",
    });
    assert.equal(profile.domain, "comparison");
    assert.equal(profile.displayName, "Cosmetics comparison");
  });

  it("classifies Sudoku as game_puzzle", () => {
    const profile = classifyAppDomain({ prompt: "Build a Sudoku game" });
    assert.equal(profile.domain, "game_puzzle");
    assert.equal(profile.displayName, "Sudoku");
  });

  it("classifies CRM dashboard", () => {
    const profile = classifyAppDomain({ prompt: "Build a CRM dashboard" });
    assert.equal(profile.domain, "crm");
  });
});

describe("isPuzzleGridSource", () => {
  it("detects sudoku board sources", () => {
    assert.equal(
      isPuzzleGridSource('className="sudoku-board"', ".sudoku-board { display: grid }"),
      true,
    );
  });

  it("rejects comparison table sources", () => {
    assert.equal(
      isPuzzleGridSource(
        "function ProductComparison() { return <table className=\"compare\">",
        ".compare { display: grid }",
      ),
      false,
    );
  });
});

describe("suggestNextSteps", () => {
  it("does not suggest timer or hints for cosmetics comparison", () => {
    const steps = suggestNextSteps({
      prompt: "Compare quality, price, and user friendliness of cosmetics",
      runOutcome: "created",
    });
    assert.ok(!steps.some((s) => /timer|hint|difficulty/i.test(s)));
    assert.ok(steps.some((s) => /filter|sort|comparison|detail/i.test(s)));
  });

  it("suggests hints for Sudoku games", () => {
    const steps = suggestNextSteps({
      prompt: "Build a Sudoku game",
      runOutcome: "created",
    });
    assert.ok(steps.some((s) => /hint/i.test(s)));
  });
});

describe("deriveProjectFacts", () => {
  it("tracks timer for productivity domain only when mentioned", () => {
    const memory = recordPrompt(emptySessionMemory(), "Build a task manager with a timer");
    const facts = deriveProjectFacts(memory, []);
    assert.ok(facts.some((f) => f.id === "timer"));
  });
});
