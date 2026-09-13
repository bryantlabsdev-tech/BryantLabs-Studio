/** Brownfield edit stress fixtures — representative file paths per app archetype. */

export interface EditStressFixture {
  readonly id: string;
  readonly label: string;
  readonly root: string;
  readonly files: readonly string[];
}

export const EDIT_STRESS_FIXTURES: readonly EditStressFixture[] = [
  {
    id: "sudoku-vite",
    label: "Sudoku game (e2e fixture)",
    root: "/tmp/sudoku-vite",
    files: [
      "package.json",
      "index.html",
      "tsconfig.json",
      "vite.config.ts",
      "src/main.tsx",
      "src/App.tsx",
      "src/index.css",
    ],
  },
  {
    id: "fleetops-pro",
    label: "FleetOps SaaS dashboard",
    root: "/tmp/fleetops-pro",
    files: [
      "package.json",
      "src/App.tsx",
      "src/main.tsx",
      "src/pages/Dashboard.tsx",
      "src/pages/Vehicles.tsx",
      "src/pages/Drivers.tsx",
      "src/pages/Dispatch.tsx",
      "src/pages/Settings.tsx",
      "src/components/Sidebar.tsx",
      "src/components/Layout.tsx",
    ],
  },
  {
    id: "inventory-command",
    label: "Inventory command center",
    root: "/tmp/inventory-command",
    files: [
      "package.json",
      "src/App.tsx",
      "src/pages/Dashboard.tsx",
      "src/pages/Products.tsx",
      "src/pages/Alerts.tsx",
      "src/pages/Reports.tsx",
      "src/hooks/useLocalStorage.ts",
    ],
  },
  {
    id: "legalcase-vault",
    label: "Legal case vault CRM",
    root: "/tmp/legalcase-vault",
    files: [
      "package.json",
      "src/App.tsx",
      "src/pages/Cases.tsx",
      "src/pages/Clients.tsx",
      "src/pages/Documents.tsx",
      "src/pages/Dashboard.tsx",
    ],
  },
  {
    id: "calculator-app",
    label: "Calculator with history",
    root: "/tmp/calculator",
    files: [
      "package.json",
      "src/App.tsx",
      "src/main.tsx",
      "src/components/Display.tsx",
      "src/components/Keypad.tsx",
    ],
  },
] as const;

export function editStressFixtureById(id: string): EditStressFixture | undefined {
  return EDIT_STRESS_FIXTURES.find((f) => f.id === id);
}
