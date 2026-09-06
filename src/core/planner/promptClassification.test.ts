import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUiAuditAdvisoryFixPrompt } from "@/core/agent/uiAuditAdvisoryUx";
import { recommendationsForUiAuditIssues } from "@/core/agent/uiAuditAdvisoryUx";
import {
  hasFunctionalBehaviorRequest,
  hasVisualStylingRequest,
  isFunctionalFeaturePrompt,
  isGameplayOrLogicPrompt,
  isMixedFunctionalUiPrompt,
  isUiLayoutPrompt,
  isUiOnlyStylingPrompt,
} from "@/core/planner/fallback";
import {
  classifyFollowUpPromptType,
  isUiOnlyFollowUpPrompt,
} from "@/core/planner/promptClassification";

function uiAuditFixPrompt(): string {
  return buildUiAuditAdvisoryFixPrompt({
    layoutType: "table_layout",
    score: 86,
    issues: ["rows_overflow"],
    recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
  });
}

describe("promptClassification", () => {
  it("does not classify UI audit fix Score: 86 as gameplay", () => {
    const prompt = uiAuditFixPrompt();
    const lower = prompt.toLowerCase();

    assert.match(prompt, /Score: 86/);
    assert.equal(isGameplayOrLogicPrompt(lower), false);
    assert.equal(isUiOnlyStylingPrompt(prompt), true);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), true);
    assert.equal(classifyFollowUpPromptType(prompt), "ui_audit_fix");
  });

  it("still classifies gameplay score prompts with game context", () => {
    const prompt = "Update the player score on the leaderboard after each level.";
    const lower = prompt.toLowerCase();

    assert.equal(isGameplayOrLogicPrompt(lower), true);
    assert.equal(classifyFollowUpPromptType(prompt), "gameplay");
  });

  it("classifies calculation history as functional not ui_layout", () => {
    const prompt =
      "Add calculation history. Last 10 calculations. Persist in localStorage. Clear history button.";
    const lower = prompt.toLowerCase();

    assert.equal(isFunctionalFeaturePrompt(lower), true);
    assert.equal(isUiLayoutPrompt(lower), false);
    assert.equal(isUiOnlyStylingPrompt(prompt), false);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), false);
    assert.equal(classifyFollowUpPromptType(prompt), "functional");
  });

  it("does not classify calculator history feature as ui_layout when calculator is mentioned", () => {
    const prompt =
      "Add calculation history to the calculator. Show last 10. Clear history button.";
    const lower = prompt.toLowerCase();

    assert.equal(isFunctionalFeaturePrompt(lower), true);
    assert.equal(isUiLayoutPrompt(lower), false);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), false);
    assert.equal(classifyFollowUpPromptType(prompt), "functional");
  });

  it("still classifies pure calculator UI polish as ui_layout", () => {
    const prompt = "Refine the calculator UI further";
    const lower = prompt.toLowerCase();

    assert.equal(isFunctionalFeaturePrompt(lower), false);
    assert.equal(isUiLayoutPrompt(lower), true);
    assert.equal(classifyFollowUpPromptType(prompt), "ui_layout");
  });

  it("classifies mixed filter + overdue highlight as functional, not styling-only", () => {
    const prompt =
      "Add a high-priority-only filter and visually highlight overdue tasks";
    const lower = prompt.toLowerCase();
    assert.equal(hasFunctionalBehaviorRequest(lower), true);
    assert.equal(hasVisualStylingRequest(lower), true);
    assert.equal(isMixedFunctionalUiPrompt(prompt), true);
    assert.equal(isFunctionalFeaturePrompt(lower), true);
    assert.equal(isUiOnlyStylingPrompt(prompt), false);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), false);
    assert.equal(classifyFollowUpPromptType(prompt), "functional");
  });

  it("classifies search box plus yellow matches as mixed/functional", () => {
    const prompt = "Add a search box and make matches yellow";
    assert.equal(isMixedFunctionalUiPrompt(prompt), true);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), false);
    assert.equal(classifyFollowUpPromptType(prompt), "functional");
  });

  it("classifies a behavior button plus red styling as mixed/functional", () => {
    const prompt = "Add a button that clears completed tasks and style it red";
    assert.equal(isMixedFunctionalUiPrompt(prompt), true);
    assert.equal(isUiOnlyStylingPrompt(prompt), false);
    assert.equal(classifyFollowUpPromptType(prompt), "functional");
  });

  it("classifies restyling an existing button as styling-only", () => {
    const prompt = "Make the existing button red";
    assert.equal(isFunctionalFeaturePrompt(prompt.toLowerCase()), false);
    assert.equal(isMixedFunctionalUiPrompt(prompt), false);
    assert.equal(isUiOnlyStylingPrompt(prompt), true);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), true);
  });

  it("classifies spacing/typography polish as styling-only", () => {
    const prompt = "Increase spacing and improve typography";
    assert.equal(isFunctionalFeaturePrompt(prompt.toLowerCase()), false);
    assert.equal(isUiOnlyStylingPrompt(prompt), true);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), true);
  });

  it("classifies filter-by-priority as functional", () => {
    const prompt = "Filter tasks by priority";
    assert.equal(isFunctionalFeaturePrompt(prompt.toLowerCase()), true);
    assert.equal(isMixedFunctionalUiPrompt(prompt), false);
    assert.equal(isUiOnlyFollowUpPrompt(prompt), false);
    assert.equal(classifyFollowUpPromptType(prompt), "functional");
  });

  it("does not let styling words override functional verbs", () => {
    const prompt =
      "Add a high-priority-only filter and visually highlight overdue incomplete tasks.";
    assert.equal(isUiOnlyStylingPrompt(prompt), false);
    assert.equal(isFunctionalFeaturePrompt(prompt.toLowerCase()), true);
  });
});
