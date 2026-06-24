import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appContextMemoryPatch,
  buildCurrentAppContext,
  hasEstablishedAppContext,
} from "./agentAppContext.ts";
import { emptySessionMemory, recordPrompt } from "@/core/sessionMemory/store";

describe("agentAppContext", () => {
  it("builds current app context from session prompts", () => {
    let mem = emptySessionMemory("/p", "main");
    mem = recordPrompt(mem, "Build a Sudoku game");

    const ctx = buildCurrentAppContext({
      scan: null,
      audit: null,
      sessionMemory: mem,
      chat: [],
      projectMemory: {
        projectName: "",
        architecture: "",
        userPreferences: "",
        notes: "",
        updatedAt: 0,
      },
      projectFacts: [
        { id: "timer", label: "Timer exists", present: true },
        { id: "hint", label: "Hint system", present: false },
      ],
      projectName: "sudoku-app",
    });

    assert.ok(ctx);
    assert.equal(ctx!.appName, "Sudoku");
    assert.match(ctx!.stack, /TypeScript|React/i);
    assert.ok(ctx!.features.includes("Timer"));
  });

  it("persists memory patch with features", () => {
    const patch = appContextMemoryPatch({
      appName: "Sudoku",
      stack: "React + TypeScript",
      features: ["Puzzle board", "Timer"],
      summaryLine: "Sudoku · React + TypeScript",
      updatedAt: Date.now(),
    });
    assert.equal(patch.projectName, "Sudoku");
    assert.match(patch.notes ?? "", /Puzzle board/);
  });

  it("detects established app context", () => {
    let mem = emptySessionMemory("/p", null);
    mem = recordPrompt(mem, "Build Sudoku");
    assert.equal(
      hasEstablishedAppContext(
        {
          appName: "Sudoku",
          stack: "React",
          features: [],
          summaryLine: "",
          updatedAt: 0,
        },
        mem,
      ),
      true,
    );
  });
});
