import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNarrowedRetryTargets,
  collectPlanApplyTargets,
} from "@/core/planApply/collectTargets";
import {
  isConfigPackageTarget,
  isUiOnlyApplyPrompt,
} from "@/core/planApply/targetPolicy";
import { generatePlan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import {
  buildUiAuditAdvisoryFixPrompt,
  recommendationsForUiAuditIssues,
} from "@/core/agent/uiAuditAdvisoryUx";
import { mockProjectScan } from "@/core/repository/testScan";

function mockScan(paths: string[], root = "/project") {
  return mockProjectScan(paths, {
    root,
    index: paths.map((path) => ({
      path,
      imports: [],
      components: path.endsWith("App.tsx") ? ["App"] : [],
      functions: [],
      exports: [],
      hooks: [],
      classes: [],
      interfaces: [],
      types: [],
      referencedNames: [],
      symbolLocations: [],
    })),
  });
}

describe("plan apply target policy", () => {
  const paths = [
    "src/App.tsx",
    "src/index.css",
    "index.html",
    "package.json",
    "vite.config.ts",
    "tsconfig.json",
  ];
  const scan = mockScan(paths);
  const prompt = "Make calculator UI premium";

  it("detects UI-only prompts", () => {
    assert.equal(isUiOnlyApplyPrompt(prompt), true);
    assert.equal(isConfigPackageTarget("package.json"), true);
    assert.equal(isConfigPackageTarget("vite.config.ts"), true);
    assert.equal(isConfigPackageTarget("src/App.tsx"), false);
  });

  it("narrows Refine calculator UI prompt to App.tsx and index.css only", () => {
    const refinePrompt = "Refine the calculator UI further";
    const plan = generatePlan(refinePrompt, scan);
    const { targets } = collectPlanApplyTargets(
      plan,
      null,
      scan,
      refinePrompt,
    );
    const targetPaths = targets.map((t) => t.relPath);
    assert.ok(targetPaths.includes("src/App.tsx"));
    assert.ok(targetPaths.includes("src/index.css"));
    assert.ok(targetPaths.length >= 1 && targetPaths.length <= 3);
    assert.ok(!targetPaths.includes("package.json"));
    assert.ok(!targetPaths.includes("index.html"));
    assert.ok(!targetPaths.includes("vite.config.ts"));
    for (const p of targetPaths) {
      assert.ok(
        p === "src/App.tsx" || p === "src/index.css" || p === "src/App.css",
        `unexpected target ${p}`,
      );
    }
  });

  it("allows App.tsx and index.css and blocks config files for UI prompts", () => {
    const plan = generatePlan(prompt, scan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "ollama",
      model: "test",
      latencyMs: 1,
      raw: {},
      plan: {
        summary: "Update tooling",
        files: [
          { path: "package.json", reason: "bump deps" },
          { path: "vite.config.ts", reason: "tweak vite" },
          { path: "tsconfig.json", reason: "strict mode" },
        ],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
    };

    const { targets, skipped, prompt: resolvedPrompt } = collectPlanApplyTargets(
      plan,
      aiPlan,
      scan,
      prompt,
    );

    assert.equal(resolvedPrompt, prompt);
    const targetPaths = targets.map((t) => t.relPath);
    assert.ok(targetPaths.includes("src/App.tsx"), targetPaths.join(", "));
    assert.ok(targetPaths.includes("src/index.css"), targetPaths.join(", "));
    assert.ok(!targetPaths.includes("package.json"));
    assert.ok(!targetPaths.includes("vite.config.ts"));
    assert.ok(!targetPaths.includes("tsconfig.json"));
    assert.ok(
      skipped.some((s) => s.includes("package.json")),
      `expected package.json in skipped: ${skipped.join("; ")}`,
    );
    assert.ok(
      skipped.some((s) => s.includes("vite.config.ts")),
      `expected AI plan vite.config in skipped: ${skipped.join("; ")}`,
    );
    assert.ok(
      targets.every((t) => t.selectionReason.length > 0),
      "each target should explain why it was selected",
    );
  });

  it("buildNarrowedRetryTargets prefers top-scored deterministic plan files", () => {
    const prompt = "Add server-side logging middleware";
    const plan = generatePlan(prompt, scan);
    const narrowed = buildNarrowedRetryTargets(plan, null, scan, prompt);
    assert.ok(narrowed.length >= 1 && narrowed.length <= 3);
    for (const t of narrowed) {
      assert.match(t.selectionReason, /Retry: narrowed/i);
    }
  });

  it("UI audit fix with AI plan limits targets to planned allowlisted files only", () => {
    const uiAuditPrompt = buildUiAuditAdvisoryFixPrompt({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
    });
    const pathsWithExtras = [
      "src/App.tsx",
      "src/index.css",
      "src/main.tsx",
      ".bryantlabs/features.json",
      "package.json",
    ];
    const scanWithExtras = mockScan(pathsWithExtras);
    const deterministicPlan = generatePlan(uiAuditPrompt, scanWithExtras);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "gemini",
      model: "test",
      latencyMs: 1,
      raw: {},
      plan: {
        summary: "Fix table overflow on mobile",
        files: [
          { path: "src/App.tsx", reason: "Wrap table container" },
          { path: "src/index.css", reason: "Responsive scroll rules" },
        ],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
    };

    const { targets, skipped } = collectPlanApplyTargets(
      deterministicPlan,
      aiPlan,
      scanWithExtras,
      uiAuditPrompt,
    );

    const targetPaths = targets.map((t) => t.relPath);
    assert.equal(targetPaths.length, 2, targetPaths.join(", "));
    assert.ok(targetPaths.includes("src/App.tsx"));
    assert.ok(targetPaths.includes("src/index.css"));
    assert.ok(!targetPaths.includes("src/main.tsx"));
    assert.ok(
      !skipped.some((s) => s.includes("src/main.tsx")),
      `deterministic-only files should not appear in skipped: ${skipped.join("; ")}`,
    );
    assert.ok(
      !skipped.some((s) => s.includes("features.json")),
      `deterministic-only files should not appear in skipped: ${skipped.join("; ")}`,
    );
  });

  it("treats Sudoku gameplay UX prompts as full apply (not CSS-only)", () => {
    const gameplayPrompt = [
      "Make the Sudoku app easier and more enjoyable to play.",
      "Improve gameplay UX: notes mode, hints, game over modal, selection behavior.",
      "Wrong entries should flash red. 3 mistakes = game over modal.",
    ].join(" ");
    assert.equal(isUiOnlyApplyPrompt(gameplayPrompt), false);
    const plan = generatePlan(gameplayPrompt, scan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "anthropic",
      model: "claude",
      plan: {
        summary: "Gameplay UX in App.tsx",
        files: [
          { path: "src/App.tsx", reason: "Game logic and interaction" },
          { path: "src/index.css", reason: "Visual polish" },
        ],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
      raw: null,
      latencyMs: 1,
    };
    const collected = collectPlanApplyTargets(plan, aiPlan, scan, gameplayPrompt);
    assert.equal(collected.source, "ai");
    const paths = collected.targets.map((t) => t.relPath);
    assert.ok(paths.includes("src/App.tsx"));
    assert.ok(paths.includes("src/index.css"));
  });

  it("keeps History.tsx, App.tsx, and index.css for calculation history feature prompt", () => {
    const historyPrompt =
      "Add calculation history. Last 10 calculations. Persist in localStorage. Clear history button.";
    assert.equal(isUiOnlyApplyPrompt(historyPrompt), false);

    const historyScan = mockScan([
      "src/App.tsx",
      "src/History.tsx",
      "src/index.css",
      "package.json",
    ]);
    const plan = generatePlan(historyPrompt, historyScan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "gemini",
      model: "test",
      latencyMs: 1,
      raw: {},
      plan: {
        summary: "Add calculation history",
        files: [
          { path: "src/History.tsx", reason: "New History component" },
          { path: "src/App.tsx", reason: "Wire history into calculator" },
          { path: "src/index.css", reason: "History list styles" },
        ],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
    };

    const { targets, skipped } = collectPlanApplyTargets(
      plan,
      aiPlan,
      historyScan,
      historyPrompt,
      { projectPath: "/project" },
    );
    const paths = targets.map((t) => t.relPath);

    assert.ok(
      paths.includes("src/History.tsx"),
      `expected History.tsx, got: ${paths.join(", ")}; skipped: ${skipped.join("; ")}`,
    );
    assert.ok(paths.includes("src/App.tsx"));
    assert.ok(paths.includes("src/index.css"));
    assert.ok(!paths.includes("package.json"));
    assert.ok(
      !skipped.some((msg) => msg.includes("src/History.tsx")),
      `History.tsx should not be skipped: ${skipped.join("; ")}`,
    );
  });

  it("keeps planner tsx targets for calculator history even when calculator triggers ui keywords", () => {
    const historyPrompt =
      "Add calculation history to the calculator. Show last 10. Clear history button.";
    assert.equal(isUiOnlyApplyPrompt(historyPrompt), false);

    const historyScan = mockScan(["src/App.tsx", "src/History.tsx", "src/index.css"]);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "gemini",
      model: "test",
      latencyMs: 1,
      raw: {},
      plan: {
        summary: "History feature",
        files: [
          { path: "src/History.tsx", reason: "History component" },
          { path: "src/App.tsx", reason: "Import History" },
          { path: "src/index.css", reason: "Styles" },
        ],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
    };
    const plan = generatePlan(historyPrompt, historyScan);
    const { targets } = collectPlanApplyTargets(plan, aiPlan, historyScan, historyPrompt);
    const paths = targets.map((t) => t.relPath);
    assert.ok(paths.includes("src/History.tsx"));
    assert.ok(paths.includes("src/App.tsx"));
    assert.ok(paths.includes("src/index.css"));
  });
});
