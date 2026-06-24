import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectPlanApplyTargets } from "@/core/planApply/collectTargets";
import {
  inferCreatePathsFromPrompt,
  isFollowUpCreatableSourcePath,
  isScaffoldConfigFollowUpPath,
  resolvePlanApplyTarget,
} from "@/core/planApply/createFileTargets";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import { generatePlan } from "@/core/planner";
import { mockProjectScan } from "@/core/repository/testScan";

const CALC_HISTORY_PROMPT =
  "Add calculation history. Show last 10 calculations. Create a separate History component. Persist history in localStorage. Add clear history button.";

const CALCULATOR_PATHS = [
  "package.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
] as const;

describe("createFileTargets", () => {
  it("allows follow-up create paths under src/components, hooks, and utils", () => {
    assert.equal(isFollowUpCreatableSourcePath("src/components/History.tsx"), true);
    assert.equal(isFollowUpCreatableSourcePath("src/hooks/useHistory.ts"), true);
    assert.equal(isFollowUpCreatableSourcePath("src/utils/history.ts"), true);
    assert.equal(isFollowUpCreatableSourcePath("package.json"), false);
    assert.equal(isFollowUpCreatableSourcePath("src/main.tsx"), false);
  });

  it("blocks scaffold/config paths unless user explicitly asks", () => {
    assert.equal(
      isScaffoldConfigFollowUpPath("package.json", CALC_HISTORY_PROMPT),
      true,
    );
    assert.equal(
      isScaffoldConfigFollowUpPath("package.json", "Update package.json dependencies"),
      false,
    );
  });

  it("resolves new component paths as create targets", () => {
    const scan = mockProjectScan([...CALCULATOR_PATHS], { root: "/tmp/calculator" });
    const resolved = resolvePlanApplyTarget(
      "src/components/History.tsx",
      scan,
      CALC_HISTORY_PROMPT,
      "/tmp/calculator",
    );
    assert.equal(resolved?.kind, "create");
    if (resolved?.kind !== "create") return;
    assert.equal(resolved.relPath, "src/components/History.tsx");
    assert.equal(resolved.absPath, "/tmp/calculator/src/components/History.tsx");
  });

  it("infers History component path from calculation history prompt", () => {
    assert.deepEqual(inferCreatePathsFromPrompt(CALC_HISTORY_PROMPT), [
      "src/components/History.tsx",
    ]);
  });
});

describe("collectPlanApplyTargets create files", () => {
  const scan = mockProjectScan([...CALCULATOR_PATHS], { root: "/tmp/calculator" });

  it("accepts History.tsx create target and blocks scaffold files for calculator history", () => {
    const plan = generatePlan(CALC_HISTORY_PROMPT, scan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "gemini",
      model: "test",
      latencyMs: 1,
      raw: {},
      plan: {
        summary: "Add calculation history feature",
        files: [
          { path: "src/components/History.tsx", reason: "New History component" },
          { path: "src/App.tsx", reason: "Import and render History" },
          { path: "package.json", reason: "Should be blocked" },
          { path: "index.html", reason: "Should be blocked" },
          { path: "tsconfig.json", reason: "Should be blocked" },
          { path: "vite.config.ts", reason: "Should be blocked" },
        ],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
    };

    const { targets, skipped } = collectPlanApplyTargets(
      plan,
      aiPlan,
      scan,
      CALC_HISTORY_PROMPT,
      { projectPath: "/tmp/calculator" },
    );

    const targetPaths = targets.map((t) => t.relPath);
    const history = targets.find((t) => t.relPath === "src/components/History.tsx");
    const app = targets.find((t) => t.relPath === "src/App.tsx");

    assert.ok(history, `expected History target, got: ${targetPaths.join(", ")}`);
    assert.equal(history.action, "create");
    assert.ok(app);
    assert.equal(app.action, "modify");
    assert.match(
      app.planReason.toLowerCase(),
      /history|import/,
      "App.tsx target should reference importing History",
    );

    for (const blocked of [
      "package.json",
      "index.html",
      "tsconfig.json",
      "vite.config.ts",
    ]) {
      assert.ok(!targetPaths.includes(blocked), `should not target ${blocked}`);
      assert.ok(
        skipped.some((s) => s.includes(blocked)),
        `expected ${blocked} in skipped: ${skipped.join("; ")}`,
      );
    }
  });

  it("includes inferred History.tsx when AI plan omits it", () => {
    const plan = generatePlan(CALC_HISTORY_PROMPT, scan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "gemini",
      model: "test",
      latencyMs: 1,
      raw: {},
      plan: {
        summary: "Wire history into app",
        files: [{ path: "src/App.tsx", reason: "Import History component" }],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
    };

    const { targets } = collectPlanApplyTargets(plan, aiPlan, scan, CALC_HISTORY_PROMPT, {
      projectPath: "/tmp/calculator",
    });

    assert.ok(
      targets.some(
        (t) => t.relPath === "src/components/History.tsx" && t.action === "create",
      ),
    );
    assert.ok(targets.some((t) => t.relPath === "src/App.tsx" && t.action === "modify"));
  });
});
