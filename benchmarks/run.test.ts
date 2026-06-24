import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBenchmarkSuite } from "./runSuite";
import { buildScorecard } from "./reporters/scorecard";
import { APP_CREATION_CASES } from "./cases/app-creation";
import { FEATURE_ADDITION_CASES } from "./cases/feature-addition";
import { BUG_FIXING_CASES } from "./cases/bug-fixing";
import { REFACTORING_CASES } from "./cases/refactoring";
import { REQUIREMENT_SATISFACTION_CASES } from "./cases/requirement-satisfaction";
import { EDIT_PIPELINE_CASES } from "./cases/edit-pipeline";

describe("benchmark suite", () => {
  it("defines cases for all six workflow categories", () => {
    const total =
      APP_CREATION_CASES.length +
      FEATURE_ADDITION_CASES.length +
      BUG_FIXING_CASES.length +
      REFACTORING_CASES.length +
      REQUIREMENT_SATISFACTION_CASES.length +
      EDIT_PIPELINE_CASES.length;
    assert.ok(total >= 25, `expected at least 25 cases, got ${total}`);
  });

  it("buildScorecard computes weighted overall score", () => {
    const now = new Date();
    const scorecard = buildScorecard({
      suite: "test",
      startedAt: now,
      finishedAt: now,
      cases: [
        {
          id: "a",
          category: "app_creation",
          name: "A",
          description: "d",
          weight: 1,
          passed: true,
          durationMs: 1,
          checks: [],
        },
        {
          id: "b",
          category: "bug_fixing",
          name: "B",
          description: "d",
          weight: 1,
          passed: false,
          durationMs: 1,
          checks: [],
        },
      ],
    });
    assert.equal(scorecard.categories.length, 9);
    assert.ok(scorecard.overallScore >= 0 && scorecard.overallScore <= 100);
    assert.equal(scorecard.overallPass, false);
  });

  it("runs full benchmark suite without throwing", async () => {
    const { scorecard } = await runBenchmarkSuite("all");
    assert.equal(scorecard.suite, "all");
    assert.ok(scorecard.cases.length >= 25);
    assert.equal(typeof scorecard.overallScore, "number");
    for (const cat of scorecard.categories) {
      assert.ok(cat.casesTotal >= 0);
      assert.ok(cat.score >= 0 && cat.score <= 100);
    }
  });
});
