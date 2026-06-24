import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiCallTracker } from "@/core/providers/costControls";
import {
  formatApplyPatchBudgetFailureMessage,
  formatAiCallBudgetDiagnostics,
  parseAiCallBudgetFromLogDetails,
  readAiCallBudgetDiagnostics,
} from "@/core/providers/aiCallBudgetDiagnostics";
import { normalizeProviderSettings } from "@/core/providers/orchestration";

function settingsWithMaxCalls(maxAiCalls: number) {
  return normalizeProviderSettings({
    provider: "ollama",
    ollamaModel: "test",
    ollamaBaseUrl: "http://localhost:11434",
    maxAiCalls,
  } as import("@/core/providers/types").ProviderSettings);
}

describe("aiCallBudgetDiagnostics", () => {
  it("reads budget after planner consumed one call", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(3);
    tracker.recordCall();

    const diagnostics = readAiCallBudgetDiagnostics(tracker, settings, 1);
    assert.equal(diagnostics.maxCalls, 3);
    assert.equal(diagnostics.usedCalls, 1);
    assert.equal(diagnostics.remainingCalls, 2);
    assert.equal(diagnostics.budgetRequired, 1);
    assert.equal(diagnostics.budgetExceeded, false);
    assert.equal(diagnostics.budgetExceededReason, null);
  });

  it("flags budget exceeded when no calls remain", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(1);
    tracker.recordCall();

    const diagnostics = readAiCallBudgetDiagnostics(tracker, settings, 1);
    assert.equal(diagnostics.budgetExceeded, true);
    assert.match(
      diagnostics.budgetExceededReason ?? "",
      /Max AI calls reached/i,
    );
    const message = formatApplyPatchBudgetFailureMessage(diagnostics);
    assert.match(message, /Max AI calls reached/i);
  });

  it("round-trips formatted diagnostics through log parser", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(3);
    tracker.recordCall();
    tracker.recordCall();
    const diagnostics = readAiCallBudgetDiagnostics(tracker, settings, 1);
    const formatted = formatAiCallBudgetDiagnostics(diagnostics);
    const parsed = parseAiCallBudgetFromLogDetails(formatted);
    assert.ok(parsed);
    assert.equal(parsed?.maxCalls, 3);
    assert.equal(parsed?.usedCalls, 2);
    assert.equal(parsed?.remainingCalls, 1);
    assert.equal(parsed?.budgetRequired, 1);
    assert.equal(parsed?.budgetExceeded, false);
  });

  it("does not flag budget exceeded after the final successful call at cap", () => {
    const tracker = new AiCallTracker();
    const settings = settingsWithMaxCalls(5);
    for (let i = 0; i < 5; i += 1) tracker.recordCall();

    const diagnostics = readAiCallBudgetDiagnostics(tracker, settings, 1, {
      afterSuccessfulCall: true,
    });
    assert.equal(diagnostics.usedCalls, 5);
    assert.equal(diagnostics.remainingCalls, 0);
    assert.equal(diagnostics.budgetExceeded, false);
    assert.equal(diagnostics.budgetExceededReason, null);
  });
});
