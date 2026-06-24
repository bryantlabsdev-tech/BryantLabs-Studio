import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySmokeAppType } from "@/core/greenfield/runtimeSmokeAppType";

function files(entries: readonly [string, string][]): ReadonlyMap<string, string> {
  return new Map(entries);
}

describe("classifySmokeAppType", () => {
  it("classifies stick-figure fight prompts as game/animation/visual", () => {
    const type = classifySmokeAppType(
      "add stick figures that fight",
      files([
        ["src/App.tsx", "export default function App() { return <div />; }"],
        ["src/main.tsx", "createRoot(document.getElementById('root')!).render(<App />);"],
      ]),
    );
    assert.equal(type, "game_animation_visual");
  });

  it("classifies FleetOps-style SaaS prompts as saas/dashboard/crud", () => {
    const fleetOpsPrompt = `
Build FleetOps Pro — fleet management SaaS with vehicles, drivers, dispatch, maintenance, fuel logs, inspections, reports, and settings

Features:
* React Router
* Tailwind CSS
* localStorage persistence
* CRUD flows
* dashboard KPIs and charts

Pages:
* Dashboard
* Vehicles
* Drivers
`.trim();
    const type = classifySmokeAppType(
      fleetOpsPrompt,
      files([["src/App.tsx", "export default function App() { return null; }"]]),
    );
    assert.equal(type, "saas_dashboard_crud");
  });

  it("infers SaaS from router + multiple pages when prompt is absent", () => {
    const type = classifySmokeAppType(
      undefined,
      files([
        [
          "src/App.tsx",
          `import { Routes, Route } from "react-router-dom";
export default function App() {
  return <Routes><Route path="/" element={<div />} /></Routes>;
}`,
        ],
        ["src/pages/A.tsx", "export default function A(){return null;}"],
        ["src/pages/B.tsx", "export default function B(){return null;}"],
        ["src/pages/C.tsx", "export default function C(){return null;}"],
      ]),
    );
    assert.equal(type, "saas_dashboard_crud");
  });
});
