import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyApplyIntent,
  isGameplayApplyPrompt,
  isSmallUiApplyPrompt,
} from "@/core/planApply/applyIntent";
import { collectPlanApplyTargets } from "@/core/planApply/collectTargets";
import { isUiOnlyApplyPrompt } from "@/core/planApply/targetPolicy";
import { resolveComplexityRouting } from "@/core/intelligence/complexityRouting";
import { generatePlan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import {
  appendProjectContextBlock,
  resolveFollowUpPrompt,
} from "@/core/sessionMemory/followUp";
import { emptySessionMemory, recordPrompt } from "@/core/sessionMemory/store";
import { classifyContextTask } from "@/core/contextEngine/classify";
import { buildApplyPlanContextPackage } from "@/core/contextEngine/build";
import { mockProjectScan } from "@/core/repository/testScan";

function mockScan() {
  return mockProjectScan(["src/App.tsx", "src/index.css"], { root: "/Users/ferrisb/157" });
}

const settings = normalizeProviderSettings({
  provider: "gemini",
  geminiModel: "gemini-2.5-flash",
  hasGeminiKey: true,
  hasAnthropicKey: true,
  hasGroqKey: true,
  hasOpenRouterKey: true,
  ollamaModel: "qwen2.5-coder:7b",
  ollamaBaseUrl: "http://localhost:11434",
  anthropicModel: "claude-sonnet-4-6",
  groqModel: "llama-3.3-70b-versatile",
  openrouterModel: "anthropic/claude-sonnet-4",
} as import("@/core/providers/types").ProviderSettings);

describe("apply intent routing", () => {
  it('"Make it easier to play like a real Sudoku game" routes to feature_addition', () => {
    const c = classifyApplyIntent("Make it easier to play like a real Sudoku game");
    assert.equal(c.intent, "feature_addition");
    assert.equal(c.reason, "gameplay_keywords");
  });

  it('"Add notes mode" routes to feature_addition', () => {
    const c = classifyApplyIntent("Add notes mode");
    assert.equal(c.intent, "feature_addition");
    assert.equal(c.reason, "gameplay_keywords");
  });

  it('"Add hints and mistake counter" routes to feature_addition', () => {
    const c = classifyApplyIntent("Add hints and mistake counter");
    assert.equal(c.intent, "feature_addition");
    assert.equal(c.reason, "gameplay_keywords");
  });

  it('"make buttons blue" routes to small_ui', () => {
    const c = classifyApplyIntent("make buttons blue");
    assert.equal(c.intent, "small_ui");
    assert.equal(c.reason, "styling_keywords");
    assert.equal(isSmallUiApplyPrompt("make buttons blue"), true);
  });

  it("calculation history prompt routes to feature_addition via functional keywords", () => {
    const prompt =
      "Add calculation history. Last 10 calculations. Persist in localStorage. Clear history button.";
    const c = classifyApplyIntent(prompt);
    assert.equal(c.intent, "feature_addition");
    assert.equal(c.reason, "functional_keywords");
    assert.equal(isSmallUiApplyPrompt(prompt), false);
  });

  it("gameplay prompt allows App.tsx edits in collectTargets", () => {
    const prompt =
      "Upgrade Sudoku gameplay. Add notes mode, hints, mistake counter, win modal.";
    assert.equal(isUiOnlyApplyPrompt(prompt), false);
    assert.equal(isGameplayApplyPrompt(prompt), true);
    const scan = mockScan();
    const plan = generatePlan(prompt, scan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "anthropic",
      model: "claude",
      plan: {
        summary: "Gameplay",
        files: [{ path: "src/index.css", reason: "styles" }],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
      raw: null,
      latencyMs: 1,
    };
    const collected = collectPlanApplyTargets(plan, aiPlan, scan, prompt);
    assert.ok(collected.targets.some((t) => t.relPath === "src/App.tsx"));
  });

  it("complexity routing uses feature_addition for gameplay upgrades", () => {
    const decision = resolveComplexityRouting({
      prompt: "Make the current Sudoku app easier and more enjoyable to play, like a real Sudoku mobile game.",
      fileCount: 2,
      featureInventory: null,
      settings,
    });
    assert.equal(decision.tier, "feature_addition");
  });

  it("full Sudoku gameplay upgrade prompt routes to feature_addition with App.tsx allowed", () => {
    const prompt = `Upgrade Sudoku gameplay.

Add:
- Notes mode
- Hint system
- Mistake counter with 3 strikes
- Win modal
- Game over modal
- Difficulty selector
- Statistics panel
- Keyboard controls
- Highlight row, column, and 3x3 box
- Highlight matching numbers

This is gameplay work.
Modify App.tsx as needed.
Preserve current styling.
Keep TypeScript passing.
Run build and UI audit.`;

    const c = classifyApplyIntent(prompt);
    assert.equal(c.intent, "feature_addition");
    assert.equal(c.reason, "gameplay_keywords");
    assert.equal(isUiOnlyApplyPrompt(prompt), false);
    assert.equal(isGameplayApplyPrompt(prompt), true);

    const scan = mockScan();
    const plan = generatePlan(prompt, scan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "anthropic",
      model: "claude",
      plan: {
        summary: "Gameplay upgrades",
        files: [{ path: "src/index.css", reason: "modal styles" }],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
      raw: null,
      latencyMs: 1,
    };
    const collected = collectPlanApplyTargets(plan, aiPlan, scan, prompt);
    const allowed = collected.targets.map((t) => t.relPath);
    assert.ok(allowed.includes("src/App.tsx"), `expected App.tsx in ${allowed.join(",")}`);
    assert.ok(allowed.includes("src/index.css"), `expected index.css in ${allowed.join(",")}`);

    const pkg = buildApplyPlanContextPackage({
      userPrompt: prompt,
      scan,
      patchFiles: [
        { path: "src/App.tsx", content: "export default function App() { return null; }" },
        { path: "src/index.css", content: "body {}" },
      ],
      uiAuditSummary: "type=grid_layout score=80 issues=0",
      projectMemory: {
        projectName: "Sudoku",
        architecture: "React Sudoku board",
        userPreferences: "",
        notes: "notes mode pending",
        updatedAt: 0,
      },
    });
    assert.equal(classifyContextTask(prompt), "gameplay_edit");
    assert.equal(pkg.taskType, "gameplay_edit");
    assert.ok(pkg.includedFiles.includes("src/App.tsx"));
    assert.ok(pkg.includedFiles.includes("src/index.css"));
    assert.match(pkg.contextNotes, /UI audit:/);
    assert.match(pkg.contextNotes, /App memory:/);
  });
});

describe("follow-up prompt preservation", () => {
  it('"Clicking a cell selects it" is not rewritten to "the 157"', () => {
    const prompt = "Clicking a cell clearly selects it.";
    const block = appendProjectContextBlock(prompt, {
      appName: "Sudoku",
      projectPath: "/Users/ferrisb/157",
    });
    assert.match(block, /Current app: Sudoku/);
    assert.match(block, /Project path: \/Users\/ferrisb\/157/);
    assert.doesNotMatch(block, /\bthe 157\b/i);
    assert.match(block, /selects it/i);

    const mem = emptySessionMemory("/Users/ferrisb/157", "main");
    const res = resolveFollowUpPrompt(
      "Make the Sudoku app easier to play. Clicking a cell clearly selects it.",
      mem,
      { appNameHint: "157", projectPath: "/Users/ferrisb/157" },
    );
    assert.match(res.effectivePrompt, /selects it/i);
    assert.doesNotMatch(res.effectivePrompt, /\bthe 157\b/i);
  });

  it("appends project path separately for short follow-ups", () => {
    let mem = emptySessionMemory("/Users/ferrisb/157", "main");
    mem = recordPrompt(mem, "Build a Sudoku app");
    const res = resolveFollowUpPrompt("Make it premium", mem, {
      appNameHint: "157",
      projectPath: "/Users/ferrisb/157",
    });
    assert.match(res.effectivePrompt, /Make it premium/i);
    assert.match(res.effectivePrompt, /Project path: \/Users\/ferrisb\/157/);
    assert.doesNotMatch(res.effectivePrompt, /\bthe 157\b/i);
  });
});
