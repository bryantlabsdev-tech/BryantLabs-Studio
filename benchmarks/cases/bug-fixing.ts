import { validateProposalQuality } from "@/core/planApply/proposalValidation";
import { mockProjectScan } from "@/core/repository/testScan";
import { allPassed, check } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";

const BROKEN_SUDOKU_BEFORE = `import { useState } from "react";

type Grid = (number | null)[][];

const puzzle: Grid = [[5, 3, null]];

function App() {
  const [grid] = useState<Grid>(puzzle);
  return (
    <div className="sudoku-board">
      {grid.map((row, rIndex) => (
        <div key={rIndex} className="cell-row">
          {row.map((cell, cIndex) => (
            <div key={cIndex} className="cell" onClick={() => {}}>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default App;
`;

const BUG_FIX_AFTER = `import { useState } from "react";

type Grid = (number | null)[][];

const puzzle: Grid = [[5, 3, null]];

function App() {
  const [grid, setGrid] = useState<Grid>(puzzle);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const handleCellClick = (row: number, col: number) => {
    setSelected({ row, col });
  };

  return (
    <div className="sudoku-board">
      {grid.map((row, rIndex) => (
        <div key={rIndex} className="cell-row">
          {row.map((cell, cIndex) => (
            <div
              key={cIndex}
              className={selected?.row === rIndex && selected?.col === cIndex ? "cell selected" : "cell"}
              onClick={() => handleCellClick(rIndex, cIndex)}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default App;
`;

export const BUG_FIXING_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "bugfix.valid_patch",
    category: "bug_fixing",
    name: "Valid bug-fix patch accepted",
    description: "Selection handler fix produces semantic change and passes validation.",
    weight: 1,
  },
  {
    id: "bugfix.reject_identical",
    category: "bug_fixing",
    name: "Identical patch rejected",
    description: "No-op patches must not enter review.",
    weight: 1,
  },
  {
    id: "bugfix.reject_noop_whitespace",
    category: "bug_fixing",
    name: "Whitespace-only fix rejected",
    description: "Formatting-only changes are not valid bug fixes.",
    weight: 1,
  },
  {
    id: "bugfix.reject_export_removal",
    category: "bug_fixing",
    name: "Export-breaking fix rejected",
    description: "Fixes must not remove exported symbols.",
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

export async function runBugFixingCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  const scan = mockProjectScan(["src/App.tsx"], { root: "/tmp/sudoku" });

  switch (def.id) {
    case "bugfix.valid_patch":
      return runCase(def, async () => {
        const quality = validateProposalQuality(
          BROKEN_SUDOKU_BEFORE,
          BUG_FIX_AFTER,
          "src/App.tsx",
          scan,
        );
        return [
          check("accepted", "Patch accepted", quality.ok, "true", String(quality.ok)),
          check(
            "semantic",
            "Diff has line changes",
            quality.ok ? quality.stats.added + quality.stats.removed > 0 : false,
            ">0",
            quality.ok ? String(quality.stats.added + quality.stats.removed) : "n/a",
          ),
        ];
      });

    case "bugfix.reject_identical":
      return runCase(def, async () => {
        const quality = validateProposalQuality(
          BROKEN_SUDOKU_BEFORE,
          BROKEN_SUDOKU_BEFORE,
          "src/App.tsx",
          scan,
        );
        return [
          check("rejected", "Identical patch rejected", !quality.ok, "false", String(quality.ok)),
          check(
            "reason",
            "Reason mentions no changes",
            !quality.ok && /no changes/i.test(quality.reason),
            "no changes",
            quality.ok ? "ok" : quality.reason,
          ),
        ];
      });

    case "bugfix.reject_noop_whitespace":
      return runCase(def, async () => {
        const quality = validateProposalQuality(
          "const x=1",
          "const x = 1",
          "src/App.tsx",
          scan,
        );
        return [
          check("rejected", "Whitespace-only rejected", !quality.ok, "false", String(quality.ok)),
          check(
            "reason",
            "Reason mentions whitespace",
            !quality.ok && /whitespace/i.test(quality.reason),
            "whitespace",
            quality.ok ? "ok" : quality.reason,
          ),
        ];
      });

    case "bugfix.reject_export_removal":
      return runCase(def, async () => {
        const before = "export function App() {}\nexport const VERSION = 1;";
        const after = "export function App() {}";
        const quality = validateProposalQuality(before, after, "src/App.tsx", scan);
        return [
          check("rejected", "Export removal rejected", !quality.ok, "false", String(quality.ok)),
          check(
            "reason",
            "Reason mentions exported symbol",
            !quality.ok && /exported symbol/i.test(quality.reason),
            "exported symbol",
            quality.ok ? "ok" : quality.reason,
          ),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown bug fixing case: ${def.id}`,
      };
  }
}

export async function runAllBugFixingCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of BUG_FIXING_CASES) {
    results.push(await runBugFixingCase(def));
  }
  return results;
}
