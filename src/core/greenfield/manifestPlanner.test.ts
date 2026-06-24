import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planManifestFromPrompt } from "@/core/greenfield/manifestPlanner";
import { validateDomainConsistency } from "@/core/greenfield/domainConsistency";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";

const FLEETOPS_PROMPT = `
Build FleetOps — fleet management SaaS with React Router and Tailwind.

Pages:
* Dashboard
* Vehicles
* Drivers
* Dispatch
* Maintenance
* Fuel Logs
* Inspections
* Reports
* Settings
`.trim();

describe("manifestPlanner FleetOps", () => {
  it("parses bullet Pages section for FleetOps (not FieldFlow defaults)", () => {
    const manifest = planManifestFromPrompt(FLEETOPS_PROMPT);
    assert.equal(manifest.appName, "FleetOps");
    assert.equal(manifest.pages.length, 9);
    const titles = manifest.pages.map((p) => p.title);
    assert.ok(titles.includes("Vehicles"));
    assert.ok(titles.includes("Fuel Logs"));
    assert.ok(!titles.includes("Leads"));
    assert.ok(!titles.includes("Jobs"));
    assert.ok(manifest.pagePaths.includes("src/pages/FuelLogs.tsx"));
    assert.ok(manifest.pagePaths.includes("src/pages/Vehicles.tsx"));
  });

  it("uses FieldFlow defaults only for FieldFlow prompts without explicit pages", () => {
    const manifest = planManifestFromPrompt("Build FieldFlow CRM with React Router");
    assert.equal(manifest.pages.length, 7);
    assert.ok(manifest.pagePaths.includes("src/pages/Leads.tsx"));
  });

  it("uses generic defaults for unknown apps without explicit pages", () => {
    const manifest = planManifestFromPrompt("Build Acme Portal");
    assert.equal(manifest.pages.length, 2);
    assert.deepEqual(
      manifest.pages.map((p) => p.title),
      ["Dashboard", "Settings"],
    );
  });

  it("plans FieldFlow pages and stack flags from numbered list", () => {
    const prompt = `
App called FieldFlow. React Router, Tailwind, lucide-react, localStorage.
1. Dashboard
2. Leads
3. Jobs
4. Estimates
5. Invoices
6. Customers
7. Settings
    `.trim();
    const manifest = planManifestFromPrompt(prompt);
    assert.equal(manifest.appName, "FieldFlow");
    assert.equal(manifest.useTailwind, true);
    assert.equal(manifest.useRouter, true);
    assert.equal(manifest.pages.length, 7);
  });

  it("ignores self-audit numbered lists when parsing pages", () => {
    const prompt = `
App called FieldFlow.
Pages:
1. Dashboard
2. Leads
3. Jobs

Requirements:
- KPI cards

After building, run a self-audit:
1. Check routing works
2. Check no TypeScript errors
    `.trim();
    const manifest = planManifestFromPrompt(prompt);
    assert.equal(manifest.pages.length, 3);
    assert.equal(manifest.pages[0]?.title, "Dashboard");
  });
});

describe("domainConsistency", () => {
  it("flags FieldFlow page files when manifest is FleetOps", () => {
    const manifest = planManifestFromPrompt(FLEETOPS_PROMPT);
    const files: GreenfieldProjectFile[] = [
      {
        path: "src/pages/Leads.tsx",
        content: `import type { Lead } from '../types';\nexport default function Leads(){return null;}`,
      },
      {
        path: "src/types.ts",
        content: "export type Lead = { id: string };",
      },
      {
        path: "src/App.tsx",
        content: `import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Leads from "./pages/Leads";
export default function App(){return <Routes><Route path="/" element={<Layout/>}><Route path="leads" element={<Leads/>}/></Route></Routes>;}`,
      },
      {
        path: "src/components/Sidebar.tsx",
        content: '<a to="/leads">Leads</a>',
      },
    ];
    const report = validateDomainConsistency(manifest, files);
    assert.equal(report.ok, false);
    assert.ok(report.unexpectedPagePaths.includes("src/pages/Leads.tsx"));
    assert.ok(report.errors.some((e) => /FieldFlow|Unexpected/i.test(e)));
  });

  it("passes when pages, App, Sidebar, and types align with manifest", () => {
    const manifest = planManifestFromPrompt(FLEETOPS_PROMPT);
    const files: GreenfieldProjectFile[] = [
      {
        path: "src/types.ts",
        content: "export type Vehicle = { id: string };",
      },
      {
        path: "src/pages/Vehicles.tsx",
        content:
          'import type { Vehicle } from "../types";\nexport default function Vehicles(){return <div>Vehicles</div>;}',
      },
      {
        path: "src/App.tsx",
        content: `import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Vehicles from "./pages/Vehicles";
export default function App(){return <Routes><Route path="/" element={<Layout/>}><Route path="vehicles" element={<Vehicles/>}/></Route></Routes>;}`,
      },
      {
        path: "src/components/Sidebar.tsx",
        content: '<a to="/vehicles">Vehicles</a>',
      },
    ];
    const report = validateDomainConsistency(manifest, files);
    assert.equal(report.missingPagePaths.length > 0, true);
    assert.equal(report.unexpectedPagePaths.length, 0);
  });
});
