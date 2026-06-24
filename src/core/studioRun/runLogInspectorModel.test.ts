import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractLatestBudget,
  filterRunLogEntries,
  formatRunLogSummaryCompact,
  parsePlannerDiagnosticsFromDetails,
  parseRunLogEntryDetails,
  readRunLogSummaryOpenPreference,
} from "@/core/studioRun/runLogInspectorModel";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import type { StudioRunSummary } from "@/core/studioRun/summary";

const baseSummary = {
  provider: "gemini",
  model: "gemini-2.0-flash",
} as StudioRunSummary;

describe("runLogInspectorModel", () => {
  it("parses planner diagnostics from ai_plan failure details", () => {
    const diag = parsePlannerDiagnosticsFromDetails(
      "parseFailReason: no_json\nparseError: No JSON object found\nrawResponse: {\"summary\":\"x\"}",
      "gemini",
      "gemini-2.0-flash",
    );
    assert.equal(diag?.parseFailReason, "no_json");
    assert.equal(diag?.rawOutput, "{\"summary\":\"x\"}");
  });

  it("parses token budget diagnostics from planner failure details", () => {
    const diag = parsePlannerDiagnosticsFromDetails(
      [
        "parseFailReason: empty_response",
        "maxOutputTokens: 1024",
        "thoughtsTokenCount: 1024",
        "tokenStarvationLikely: true",
        "tokenBudgetHint: Gemini may have exhausted output tokens during reasoning. Consider increasing planner max output tokens.",
      ].join("\n"),
      "gemini",
      "gemini-2.5-pro",
    );
    assert.equal(diag?.maxOutputTokens, 1024);
    assert.equal(diag?.thoughtsTokenCount, 1024);
    assert.equal(diag?.tokenStarvationLikely, true);
    assert.match(diag?.tokenBudgetHint ?? "", /exhausted output tokens/i);
  });

  it("extracts budget from log details", () => {
    const entries = [
      createRunLogEntry("ai_call", "success", "call", "budgetMax: 3\nbudgetUsed: 2\nbudgetRemaining: 1"),
    ];
    const budget = extractLatestBudget(entries);
    assert.equal(budget.max, 3);
    assert.equal(budget.used, 2);
    assert.equal(budget.remaining, 1);
  });

  it("filters failed entries only", () => {
    const entries = [
      createRunLogEntry("pipeline", "success", "ok"),
      createRunLogEntry("ai_plan", "failed", "no json"),
    ];
    const failed = filterRunLogEntries(entries, "failed", "");
    assert.equal(failed.length, 1);
    assert.equal(failed[0]?.stage, "ai_plan");
  });

  it("marks ai_plan failures as planner diagnostics", () => {
    const entry = createRunLogEntry(
      "ai_plan",
      "failed",
      "Provider returned no JSON plan.",
      "parseFailReason: no_json\nparseError: bad\nrawResponse: not-json",
    );
    const parsed = parseRunLogEntryDetails(entry, baseSummary);
    assert.ok(parsed.planner);
    assert.equal(parsed.planner?.parseFailReason, "no_json");
  });

  it("formats compact run summary line", () => {
    const line = formatRunLogSummaryCompact({
      prompt: "Create a React TypeScript Vite app called FieldFlow with many pages and requirements",
      filesProposed: 7,
      filesModified: null,
      filesWritten: 7,
      commandsRun: [],
      buildResult: "ok",
      previewResult: "success",
      typescriptResult: "ok",
      totalAiCalls: 1,
      budget: { max: 3, used: 1, remaining: 2 },
    });
    assert.match(line, /Prompt: Create a React/);
    assert.match(line, /Files written: 7/);
    assert.match(line, /TS: ok/);
    assert.match(line, /Build: ok/);
    assert.match(line, /AI calls: 1/);
    assert.match(line, /Budget: 1\/3 \(2 left\)/);
  });

  it("defaults summary collapsed while run is active", () => {
    assert.equal(readRunLogSummaryOpenPreference(true), false);
    assert.equal(readRunLogSummaryOpenPreference(false), true);
  });
});
