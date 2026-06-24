import {
  validateCreateProposalQuality,
  validateProposalQuality,
} from "@/core/planApply/proposalValidation";
import { mockProjectScan } from "@/core/repository/testScan";
import { allPassed, check } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";

const APP_BEFORE = `export default function App() {
  return <main><h1>Title</h1><section>Body</section></main>;
}
`;

const EXTRACT_COMPONENT_AFTER = `import { AppShell } from "./components/AppShell";

export default function App() {
  return <AppShell title="Title">Body</AppShell>;
}
`;

const APP_SHELL_CREATE = `export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main>
      <h1>{title}</h1>
      <section>{children}</section>
    </main>
  );
}
`;

export const REFACTORING_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "refactor.preserve_exports",
    category: "refactoring",
    name: "Extract component preserves exports",
    description: "Refactor that keeps default export passes validation.",
    weight: 1,
  },
  {
    id: "refactor.create_helper",
    category: "refactoring",
    name: "New helper module validates",
    description: "Extracted AppShell component file passes create validation.",
    weight: 1,
  },
  {
    id: "refactor.reject_whitespace",
    category: "refactoring",
    name: "Whitespace reformat rejected",
    description: "Pure formatting changes fail proposal quality gate.",
    weight: 1,
  },
  {
    id: "refactor.reject_bad_import",
    category: "refactoring",
    name: "Unresolved import rejected",
    description: "Refactors must not introduce imports to missing modules.",
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

export async function runRefactoringCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  const scan = mockProjectScan(["src/App.tsx", "src/components/AppShell.tsx"], {
    root: "/tmp/app",
  });

  switch (def.id) {
    case "refactor.preserve_exports":
      return runCase(def, async () => {
        const quality = validateProposalQuality(
          APP_BEFORE,
          EXTRACT_COMPONENT_AFTER,
          "src/App.tsx",
          scan,
        );
        return [
          check("accepted", "Refactor patch accepted", quality.ok, "true", String(quality.ok)),
          check(
            "default_export",
            "Default export preserved in after content",
            /export\s+default\s+(?:function\s+)?App\b/.test(EXTRACT_COMPONENT_AFTER),
            "present",
            "checked",
          ),
        ];
      });

    case "refactor.create_helper":
      return runCase(def, async () => {
        const quality = validateCreateProposalQuality(
          APP_SHELL_CREATE,
          "src/components/AppShell.tsx",
          scan,
        );
        return [
          check("accepted", "Helper file accepted", quality.ok, "true", String(quality.ok)),
          check(
            "lines",
            "Non-empty diff stats",
            quality.ok ? quality.stats.added > 0 : false,
            ">0 added",
            quality.ok ? String(quality.stats.added) : "n/a",
          ),
        ];
      });

    case "refactor.reject_whitespace":
      return runCase(def, async () => {
        const quality = validateProposalQuality(
          "hello world",
          "hello  world",
          "src/utils.ts",
          scan,
        );
        return [
          check("rejected", "Whitespace-only rejected", !quality.ok, "false", String(quality.ok)),
        ];
      });

    case "refactor.reject_bad_import":
      return runCase(def, async () => {
        const after = `import { Missing } from "./components/Missing";
export default function App() { return <Missing />; }`;
        const narrowScan = mockProjectScan(["src/App.tsx"], { root: "/tmp/app" });
        const quality = validateProposalQuality(APP_BEFORE, after, "src/App.tsx", narrowScan);
        return [
          check("rejected", "Bad import rejected", !quality.ok, "false", String(quality.ok)),
          check(
            "reason",
            "Reason mentions missing module",
            !quality.ok && /missing module/i.test(quality.reason),
            "missing module",
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
        error: `Unknown refactoring case: ${def.id}`,
      };
  }
}

export async function runAllRefactoringCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of REFACTORING_CASES) {
    results.push(await runRefactoringCase(def));
  }
  return results;
}
