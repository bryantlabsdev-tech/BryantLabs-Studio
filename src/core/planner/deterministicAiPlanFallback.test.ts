import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUiAuditAdvisoryFixPrompt, recommendationsForUiAuditIssues } from "@/core/agent/uiAuditAdvisoryUx";
import { generatePlan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import { mockProjectScan } from "@/core/repository/testScan";
import {
  buildDeterministicAiPlanFallback,
  canUseDeterministicPlanFallback,
} from "@/core/planner/deterministicAiPlanFallback";

const SUDOKU_REPAIR_PROMPT = `Audit and repair the generated Sudoku UI.
The game board layout is broken. Fix layout using CSS Grid with 9 columns and 9 rows.
If UI audit fails, patch layout, rebuild, and re-preview.`;

function failedPlannerResult(
  parseError: string,
  parseFailReason: AIPlanResult["parseFailReason"] = "no_json",
): AIPlanResult {
  return {
    ok: false,
    provider: "gemini",
    model: "gemini-2.5-pro",
    raw: null,
    latencyMs: 10_000,
    parseError,
    parseFailReason,
  };
}

function uiAuditFixPrompt(): string {
  return buildUiAuditAdvisoryFixPrompt({
    layoutType: "table_layout",
    score: 86,
    issues: ["rows_overflow"],
    recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
  });
}

describe("deterministicAiPlanFallback", () => {
  const scan = mockProjectScan(["src/App.tsx", "src/index.css"]);
  const plan = generatePlan(SUDOKU_REPAIR_PROMPT, scan);

  it("allows fallback for UI layout repair when planner returns no JSON", () => {
    assert.equal(
      canUseDeterministicPlanFallback(
        SUDOKU_REPAIR_PROMPT,
        plan,
        failedPlannerResult("No JSON Returned"),
      ),
      true,
    );
  });

  it("allows fallback for UI audit fix when provider returns production no_json", () => {
    const fixPrompt = uiAuditFixPrompt();
    const fixPlan = generatePlan(fixPrompt, scan);
    assert.equal(
      canUseDeterministicPlanFallback(
        fixPrompt,
        fixPlan,
        failedPlannerResult("No JSON object found in model output."),
      ),
      true,
    );
  });

  it("builds deterministic fallback for UI audit fix no-json failures", () => {
    const fixPrompt = uiAuditFixPrompt();
    const fixPlan = generatePlan(fixPrompt, scan);
    const failed = failedPlannerResult("No JSON object found in model output.");
    const fallback = buildDeterministicAiPlanFallback(
      fixPrompt,
      fixPlan,
      "gemini",
      "gemini-2.5-pro",
      failed,
    );
    assert.equal(fallback.ok, true);
    assert.ok(fallback.plan);
    assert.ok(fallback.plan!.files.length > 0);
  });

  it("builds a synthetic ok plan from the deterministic plan", () => {
    const failed = failedPlannerResult("No JSON Returned");
    const fallback = buildDeterministicAiPlanFallback(
      SUDOKU_REPAIR_PROMPT,
      plan,
      "gemini",
      "gemini-2.5-pro",
      failed,
    );
    assert.equal(fallback.ok, true);
    assert.ok(fallback.plan);
    assert.ok(fallback.plan!.files.length > 0);
    assert.match(fallback.plan!.reasoning, /deterministic plan fallback/i);
  });

  it("rejects fallback for non-UI prompts", () => {
    const authPrompt = "Add login and database tables";
    const authPlan = generatePlan(authPrompt, scan);
    assert.equal(
      canUseDeterministicPlanFallback(
        authPrompt,
        authPlan,
        failedPlannerResult("No JSON Returned"),
      ),
      false,
    );
  });
});
