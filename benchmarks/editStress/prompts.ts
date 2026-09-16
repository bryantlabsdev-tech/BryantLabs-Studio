/** Brownfield edit scenarios — routing + planner dry-run corpus. */

export interface EditStressPrompt {
  readonly id: string;
  readonly fixtureId: string;
  readonly name: string;
  readonly prompt: string;
  /** Planner must include at least one of these paths. */
  readonly expectedPaths: readonly string[];
}

export const EDIT_STRESS_PROMPTS: readonly EditStressPrompt[] = [
  {
    id: "sudoku-gameplay",
    fixtureId: "sudoku-vite",
    name: "Sudoku gameplay upgrade",
    prompt: "Upgrade Sudoku gameplay. Add notes mode and hints.",
    expectedPaths: ["src/App.tsx"],
  },
  {
    id: "sudoku-hints",
    fixtureId: "sudoku-vite",
    name: "Sudoku add hints",
    prompt: "add hints",
    expectedPaths: ["src/App.tsx"],
  },
  {
    id: "sudoku-timer",
    fixtureId: "sudoku-vite",
    name: "Sudoku timer",
    prompt: "Add a visible elapsed timer to the Sudoku board.",
    expectedPaths: ["src/App.tsx"],
  },
  {
    id: "sudoku-mobile",
    fixtureId: "sudoku-vite",
    name: "Sudoku responsive layout",
    prompt: "Make the Sudoku UI mobile friendly with a responsive layout.",
    expectedPaths: ["src/App.tsx", "src/index.css"],
  },
  {
    id: "sudoku-fix-build",
    fixtureId: "sudoku-vite",
    name: "Sudoku fix build",
    prompt: "Fix the TypeScript build error in this project.",
    expectedPaths: ["src/App.tsx"],
  },
  {
    id: "fleetops-kpi",
    fixtureId: "fleetops-pro",
    name: "FleetOps dashboard KPIs",
    prompt: "Add fleet utilization KPI cards to the dashboard.",
    expectedPaths: ["src/pages/Dashboard.tsx"],
  },
  {
    id: "fleetops-dispatch-filter",
    fixtureId: "fleetops-pro",
    name: "FleetOps dispatch filters",
    prompt: "Add status filters to the dispatch board.",
    expectedPaths: ["src/pages/Dispatch.tsx"],
  },
  {
    id: "inventory-low-stock",
    fixtureId: "inventory-command",
    name: "Inventory low-stock alert",
    prompt: "Highlight low-stock products on the products page.",
    expectedPaths: ["src/pages/Products.tsx"],
  },
  {
    id: "inventory-reports-export",
    fixtureId: "inventory-command",
    name: "Inventory reports export",
    prompt: "Add CSV export to the reports page.",
    expectedPaths: ["src/pages/Reports.tsx"],
  },
  {
    id: "legalcase-case-search",
    fixtureId: "legalcase-vault",
    name: "Legal case search",
    prompt: "Add search and filter by status on the cases page.",
    expectedPaths: ["src/pages/Cases.tsx"],
  },
  {
    id: "calc-history",
    fixtureId: "calculator-app",
    name: "Calculator history panel",
    prompt:
      "Add calculation history. Show last 10 calculations. Create a separate History component. Persist history in localStorage.",
    expectedPaths: ["src/App.tsx", "src/components/Display.tsx"],
  },
] as const;

export const EDIT_STRESS_TARGET = EDIT_STRESS_PROMPTS.length;

export function editStressPromptById(id: string): EditStressPrompt | undefined {
  return EDIT_STRESS_PROMPTS.find((p) => p.id === id);
}
