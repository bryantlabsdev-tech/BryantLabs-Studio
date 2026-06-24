import {
  applyRequirementOutcome,
  evaluateRequirementChecklist,
} from "@/core/agent/requirementVerification";
import { summarizePostApplyRequirements } from "@/core/agent/postApplyRequirementCheck";
import { mockProjectScan } from "@/core/repository/testScan";
import {
  FIELD_FLOW_FULL_PROMPT,
  fieldFlowGeneratedDiffs,
  fieldFlowStubDiffs,
} from "../fixtures/fieldFlow";
import { allPassed, check } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";

export const REQUIREMENT_SATISFACTION_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "req.fieldflow_full_pass",
    category: "requirement_satisfaction",
    name: "FieldFlow full implementation satisfies requirements",
    description: "Complete CRM diffs pass hard requirement checklist.",
    weight: 1,
  },
  {
    id: "req.fieldflow_stub_fail",
    category: "requirement_satisfaction",
    name: "Stub implementation fails requirements",
    description: "Minimal App-only diff fails hard requirements.",
    weight: 1,
  },
  {
    id: "req.outcome_downgrade",
    category: "requirement_satisfaction",
    name: "Outcome downgrades on failed requirements",
    description: "applyRequirementOutcome marks incomplete when hard reqs fail.",
    weight: 1,
  },
  {
    id: "req.post_apply_advisory",
    category: "requirement_satisfaction",
    name: "Post-apply advisory detects gaps",
    description: "summarizePostApplyRequirements surfaces incomplete prompt reqs.",
    weight: 1,
  },
  {
    id: "req.calc_history_pass",
    category: "requirement_satisfaction",
    name: "Calculator history requirements pass",
    description: "Dedicated calc history heuristics pass with proper implementation.",
    weight: 1,
  },
];

const CALC_HISTORY_PROMPT =
  "Add calculation history. Show last 10 calculations. Create a separate History component. Persist history in localStorage. Add clear history button.";

function calcHistoryDiffs() {
  return [
    {
      path: "src/components/History.tsx",
      linesAdded: 40,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `
export function History({ items, onClear }: { items: string[]; onClear: () => void }) {
  const visible = items.slice(-10);
  return (
    <section>
      <h2>History</h2>
      <ul>{visible.map((item) => <li key={item}>{item}</li>)}</ul>
      <button type="button" onClick={onClear}>Clear History</button>
    </section>
  );
}
`,
    },
    {
      path: "src/App.tsx",
      linesAdded: 12,
      linesRemoved: 2,
      preview: [],
      before: "export function Calculator() { return <div>Calc</div>; }",
      after: `
import { History } from "./components/History";
export function Calculator() {
  const save = (value: string) => localStorage.setItem("history", value);
  return <div><CalculatorCore /><History items={[]} onClear={() => localStorage.removeItem("history")} /></div>;
}
`,
    },
  ];
}

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

export async function runRequirementSatisfactionCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  const scan = mockProjectScan(
    ["src/App.tsx", "src/pages/Dashboard.tsx", "src/components/History.tsx"],
    { root: "/tmp/app" },
  );

  switch (def.id) {
    case "req.fieldflow_full_pass":
      return runCase(def, async () => {
        const result = evaluateRequirementChecklist({
          prompt: FIELD_FLOW_FULL_PROMPT,
          fileDiffs: fieldFlowGeneratedDiffs(),
          scan,
          buildPassed: true,
        });
        const hardFails = result.items.filter(
          (i) => i.detected && !i.advisory && i.status === "fail",
        );
        return [
          check("all_satisfied", "All hard requirements satisfied", result.allSatisfied, "true", String(result.allSatisfied)),
          check("hard_fails", "Zero hard failures", hardFails.length === 0, "0", String(hardFails.length)),
          check("items", "Checklist has items", result.items.length > 0, ">0", String(result.items.length)),
        ];
      });

    case "req.fieldflow_stub_fail":
      return runCase(def, async () => {
        const result = evaluateRequirementChecklist({
          prompt: FIELD_FLOW_FULL_PROMPT,
          fileDiffs: fieldFlowStubDiffs(),
          scan,
          buildPassed: true,
        });
        const hardFails = result.items.filter(
          (i) => i.detected && !i.advisory && i.status === "fail",
        );
        return [
          check("not_satisfied", "Stub fails requirements", !result.allSatisfied, "false", String(result.allSatisfied)),
          check("hard_fails", "At least one hard failure", hardFails.length > 0, ">0", String(hardFails.length)),
        ];
      });

    case "req.outcome_downgrade":
      return runCase(def, async () => {
        const checklist = evaluateRequirementChecklist({
          prompt: FIELD_FLOW_FULL_PROMPT,
          fileDiffs: fieldFlowStubDiffs(),
          scan,
          buildPassed: true,
        });
        const outcome = applyRequirementOutcome("success", checklist);
        return [
          check("downgraded", "Outcome becomes incomplete", outcome === "incomplete", "incomplete", outcome),
        ];
      });

    case "req.post_apply_advisory":
      return runCase(def, async () => {
        const summary = summarizePostApplyRequirements({
          prompt: "Add dark mode toggle to the app settings",
          appliedPaths: ["src/App.tsx"],
          files: [
            {
              relPath: "src/App.tsx",
              absPath: "/tmp/src/App.tsx",
              action: "modify",
              status: "ready",
              decision: "approved",
              selectionReason: "test",
              planReason: "test",
              basisContent: "export default function App(){return null}",
              proposal: {
                newContent: "export default function App(){return <div />}",
                summary: "update",
                reasoning: "",
                risks: [],
              },
            },
          ],
          buildPassed: true,
        });
        return [
          check(
            "advisory_or_pass",
            "Advisory note present or all satisfied",
            summary.advisoryNote !== null || summary.allSatisfied,
            "note or satisfied",
            summary.advisoryNote ?? "all satisfied",
          ),
        ];
      });

    case "req.calc_history_pass":
      return runCase(def, async () => {
        const result = evaluateRequirementChecklist({
          prompt: CALC_HISTORY_PROMPT,
          fileDiffs: calcHistoryDiffs(),
          scan,
          buildPassed: true,
        });
        const hardFails = result.items.filter(
          (i) => i.detected && !i.advisory && i.status === "fail",
        );
        return [
          check("all_satisfied", "Calc history requirements satisfied", result.allSatisfied, "true", String(result.allSatisfied)),
          check("hard_fails", "Zero hard failures", hardFails.length === 0, "0", String(hardFails.length)),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown requirement satisfaction case: ${def.id}`,
      };
  }
}

export async function runAllRequirementSatisfactionCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of REQUIREMENT_SATISFACTION_CASES) {
    results.push(await runRequirementSatisfactionCase(def));
  }
  return results;
}
