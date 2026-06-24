import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { isFollowUpEditSubmitAction, resolveFollowUpSubmitAction } from "@/core/agent/followUpExecution";
import { generatePlan } from "@/core/planner";
import { mockProjectScan } from "@/core/repository/testScan";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { normalizeProjectMemory } from "@/core/projectMemory/store";
import { validateCreateProposalQuality } from "@/core/planApply/proposalValidation";
import { allPassed, check } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";

const SUDOKU_PATHS = [
  "package.json",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
];

export const FEATURE_ADDITION_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "feature.gameplay_routing",
    category: "feature_addition",
    name: "Gameplay prompt routes to follow-up edit",
    description: "Sudoku gameplay upgrades should route to agent follow-up, not greenfield.",
    weight: 1,
  },
  {
    id: "feature.planner_selects_app",
    category: "feature_addition",
    name: "Planner selects App.tsx for gameplay prompt",
    description: "Deterministic planner ranks primary app surface for gameplay features.",
    weight: 1,
  },
  {
    id: "feature.create_component_file",
    category: "feature_addition",
    name: "New component proposal validates",
    description: "Creating History.tsx for calc history feature passes create validation.",
    weight: 1,
  },
  {
    id: "feature.calc_history_route",
    category: "feature_addition",
    name: "Calculator history prompt routes correctly",
    description: "Calc history feature routes to follow-up with feature_addition intent.",
    weight: 1,
  },
];

async function runCase(
  def: BenchmarkCaseDefinition,
  run: () => Promise<BenchmarkCaseResult["checks"]>,
): Promise<BenchmarkCaseResult> {
  const started = performance.now();
  try {
    const checks = await run();
    return {
      ...def,
      passed: allPassed(checks),
      durationMs: Math.round(performance.now() - started),
      checks,
    };
  } catch (err) {
    return {
      ...def,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runFeatureAdditionCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  const scan = mockProjectScan(SUDOKU_PATHS, { root: "/tmp/sudoku" });

  switch (def.id) {
    case "feature.gameplay_routing":
      return runCase(def, async () => {
        const prompt = "Upgrade Sudoku gameplay. Add notes mode and hints.";
        const route = routeAgentPrompt({
          prompt,
          projectOpen: true,
          projectPath: "/tmp/sudoku",
          scan,
          scanStatus: "done",
        });
        return [
          check("execution", "Routes to build loop edit", route.execution === "build_loop", "build_loop", route.execution),
          check("not_greenfield", "Does not start greenfield", route.execution !== "greenfield", "not greenfield", route.execution),
          check("intent", "Intent targets follow-up edit", route.intent === "follow_up" || route.intent === "feature_addition", "follow_up|feature_addition", route.intent),
        ];
      });

    case "feature.planner_selects_app":
      return runCase(def, async () => {
        const prompt = "Upgrade Sudoku gameplay. Add notes mode and hints.";
        const plan = generatePlan(prompt, scan, {
          projectPath: "/tmp/sudoku",
          projectMemory: normalizeProjectMemory(null),
          sessionMemory: emptySessionMemory(),
        });
        const paths = plan.files.map((f) => f.path);
        return [
          check("has_plan", "Planner returns files", plan.files.length > 0, ">0", String(plan.files.length)),
          check("includes_app", "Plan includes src/App.tsx", paths.includes("src/App.tsx"), "src/App.tsx", paths.join(", ")),
          check("confidence", "Confidence is not Low", plan.confidence !== "Low", "Medium|High", plan.confidence),
        ];
      });

    case "feature.create_component_file":
      return runCase(def, async () => {
        const content = `import { useEffect, useState } from "react";

export function History({ entries }: { entries: string[] }) {
  return <ul>{entries.map((e) => <li key={e}>{e}</li>)}</ul>;
}

export default History;
`;
        const quality = validateCreateProposalQuality(
          content,
          "src/components/History.tsx",
          scan,
        );
        return [
          check("valid", "Create proposal accepted", quality.ok, "true", String(quality.ok)),
          check(
            "stats",
            "Diff stats recorded",
            quality.ok ? quality.stats.changed : false,
            "changed=true",
            quality.ok ? String(quality.stats.changed) : "n/a",
          ),
        ];
      });

    case "feature.calc_history_route":
      return runCase(def, async () => {
        const prompt =
          "Add calculation history. Show last 10 calculations. Create a separate History component. Persist history in localStorage. Add clear history button.";
        const route = routeAgentPrompt({
          prompt,
          projectOpen: true,
          projectPath: "/tmp/calc",
          scan,
          scanStatus: "done",
        });
        const action = resolveFollowUpSubmitAction({
          hasProject: true,
          routeExecution: route.execution,
          emptyProjectFolder: false,
          scan,
          scanStatus: "done",
        });
        return [
          check("build_loop", "Submit action is edit pipeline", isFollowUpEditSubmitAction(action), "build_loop|agent_loop", action.kind),
          check(
            "route_execution",
            "Route execution is build loop",
            route.execution === "build_loop",
            "build_loop",
            route.execution,
          ),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown feature addition case: ${def.id}`,
      };
  }
}

export async function runAllFeatureAdditionCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of FEATURE_ADDITION_CASES) {
    results.push(await runFeatureAdditionCase(def));
  }
  return results;
}
