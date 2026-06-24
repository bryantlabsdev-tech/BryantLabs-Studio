import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptySessionMemory, recordPrompt } from "@/core/sessionMemory/store";
import { resolveFollowUpPrompt } from "@/core/sessionMemory/followUp";
import { effectivePlanPrompt } from "@/core/sessionMemory/promptContext";

describe("resolveFollowUpPrompt", () => {
  it('preserves "it" and prefixes app context from session history', () => {
    let mem = emptySessionMemory("/p", "main");
    mem = recordPrompt(mem, "Build calculator");
    const res = resolveFollowUpPrompt("Make it premium", mem);
    assert.match(res.effectivePrompt, /Make it premium/i);
    assert.match(res.effectivePrompt, /Current app: Calculator/i);
    assert.doesNotMatch(res.effectivePrompt, /Make the calculator premium/i);
  });

  it("uses project memory app name when session prompts are empty", () => {
    const mem = emptySessionMemory("/p", "main");
    const res = resolveFollowUpPrompt("Add a timer", mem, {
      appNameHint: "Sudoku",
      projectPath: "/Users/ferrisb/sudoku-app",
    });
    assert.match(res.effectivePrompt, /Sudoku/i);
    assert.match(res.effectivePrompt, /Add a timer/i);
    assert.match(res.effectivePrompt, /Project path:/i);
  });

  it("continues Sudoku edits without rewriting pronouns", () => {
    let mem = emptySessionMemory("/p", "main");
    mem = recordPrompt(mem, "Build a Sudoku app");
    const res = resolveFollowUpPrompt("Add a timer", mem);
    assert.match(res.effectivePrompt, /Current app: Sudoku/i);
    assert.match(res.effectivePrompt, /Add a timer/i);
  });

  it("connects history feature across prompts", () => {
    let mem = emptySessionMemory("/p", null);
    mem = recordPrompt(mem, "Add history panel to the app");
    const res = resolveFollowUpPrompt("Move history to the right side", mem);
    assert.match(
      effectivePlanPrompt("Move history to the right side", mem),
      /history/i,
    );
    assert.ok(res.inferredSubject === "history panel" || /history/i.test(res.reason));
  });

  it("does not replace pronouns when prompt already names the app", () => {
    const mem = emptySessionMemory("/p", "main");
    const prompt = [
      "Make the current Sudoku app easier to play.",
      "Clicking a cell clearly selects it.",
      "When a number is selected, entering it should feel instant.",
    ].join(" ");
    const res = resolveFollowUpPrompt(prompt, mem, { appNameHint: "157" });
    assert.match(res.effectivePrompt, /selects it/i);
    assert.match(res.effectivePrompt, /entering it should/i);
    assert.doesNotMatch(res.effectivePrompt, /\bthe 157\b/i);
  });

  it("rejects numeric folder names as follow-up subjects", () => {
    let mem = emptySessionMemory("/p", "main");
    mem = recordPrompt(mem, "Build app");
    const res = resolveFollowUpPrompt("Make it premium", mem, {
      appNameHint: "157",
      projectPath: "/Users/ferrisb/157",
    });
    assert.match(res.effectivePrompt, /premium/i);
    assert.doesNotMatch(res.effectivePrompt, /\bthe 157\b/i);
    assert.match(res.effectivePrompt, /Project path:/i);
  });
});
