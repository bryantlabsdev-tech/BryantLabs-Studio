import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runtimeSmokeFromProjectFiles } from "@/core/greenfield/runtimeSmokeVerification";

const FLEETOPS_PROMPT = `
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

describe("runtimeSmokeVerification", () => {
  it("passes for typical greenfield router app", () => {
    const result = runtimeSmokeFromProjectFiles([
      {
        path: "src/main.tsx",
        content: `import { createRoot } from "react-dom/client";
import App from "./App";
createRoot(document.getElementById("root")!).render(<App />);`,
      },
      {
        path: "src/App.tsx",
        content: `import { Routes, Route } from "react-router-dom";
export default function App() {
  return <Routes><Route path="/" element={<div />} /></Routes>;
}`,
      },
      {
        path: "src/pages/Dashboard.tsx",
        content: `import { useState } from "react";
export default function Dashboard() {
  const [items, setItems] = useState([]);
  return items.filter((x) => x).map((x) => <div key={x.id} />);
}`,
      },
      { path: "src/pages/Settings.tsx", content: "export default function Settings(){return null;}" },
      { path: "src/pages/Reports.tsx", content: "export default function Reports(){return null;}" },
      {
        path: "src/hooks/useLocalStorage.ts",
        content: "export function useLocalStorage() { return [[], () => {}]; }",
      },
      { path: "dist/index.html", content: '<script type="module" src="/assets/index.js"></script>' },
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.overallStatus, "passed");
    assert.equal(result.appType, "saas_dashboard_crud");
    assert.ok(result.checks.every((c) => c.status === "passed" || c.status === "skipped"));
  });

  it("fails when BrowserRouter nested in App", () => {
    const result = runtimeSmokeFromProjectFiles([
      {
        path: "src/main.tsx",
        content: "createRoot(document.getElementById('root')!).render(<App />);",
      },
      {
        path: "src/App.tsx",
        content: `<BrowserRouter><Routes><Route path="/" /></Routes></BrowserRouter>`,
      },
      { path: "src/pages/A.tsx", content: "export default function A(){return null;}" },
      { path: "src/pages/B.tsx", content: "export default function B(){return null;}" },
      { path: "src/pages/C.tsx", content: "export default function C(){return null;}" },
      { path: "dist/index.html", content: "<script></script>" },
    ]);
    assert.equal(result.ok, false);
    assert.ok(
      result.checks.some(
        (c) => c.id === "no_nested_browser_router" && c.status === "failed",
      ),
    );
  });

  it("skips routes/pages/CRUD checks for stick-figure fight prompts", () => {
    const result = runtimeSmokeFromProjectFiles(
      [
        {
          path: "src/main.tsx",
          content: `import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")!).render(<App />);`,
        },
        {
          path: "src/App.tsx",
          content: `export default function App() {
  return <canvas width={800} height={600} />;
}`,
        },
        { path: "src/components/Fighters.tsx", content: "export function Fighters() { return null; }" },
        { path: "dist/index.html", content: '<script type="module"></script>' },
      ],
      { prompt: "add stick figures that fight" },
    );

    assert.equal(result.appType, "game_animation_visual");
    assert.equal(result.ok, true);
    assert.equal(result.overallStatus, "passed");
    assert.equal(result.checks.find((c) => c.id === "router_wiring")?.status, "skipped");
    assert.equal(result.checks.find((c) => c.id === "page_files")?.status, "skipped");
    assert.equal(result.checks.find((c) => c.id === "crud_signals")?.status, "skipped");
    assert.equal(result.checks.find((c) => c.id === "react_mount")?.status, "passed");
    assert.equal(result.checks.find((c) => c.id === "build_output")?.status, "passed");
  });

  it("requires routes/pages/CRUD for FleetOps-style SaaS prompts", () => {
    const result = runtimeSmokeFromProjectFiles(
      [
        {
          path: "src/main.tsx",
          content: "createRoot(document.getElementById('root')!).render(<App />);",
        },
        {
          path: "src/App.tsx",
          content: "export default function App() { return <div>FleetOps</div>; }",
        },
        { path: "dist/index.html", content: '<script type="module"></script>' },
      ],
      { prompt: FLEETOPS_PROMPT },
    );

    assert.equal(result.appType, "saas_dashboard_crud");
    assert.equal(result.ok, false);
    assert.equal(result.overallStatus, "failed");
    assert.equal(result.checks.find((c) => c.id === "router_wiring")?.status, "failed");
    assert.equal(result.checks.find((c) => c.id === "page_files")?.status, "failed");
    assert.equal(result.checks.find((c) => c.id === "crud_signals")?.status, "failed");
  });

  it("reports advisory when visual prompt lacks canvas/animation surface", () => {
    const result = runtimeSmokeFromProjectFiles(
      [
        {
          path: "src/main.tsx",
          content: "createRoot(document.getElementById('root')!).render(<App />);",
        },
        {
          path: "src/App.tsx",
          content: "export default function App() { return <div>fighters</div>; }",
        },
        { path: "dist/index.html", content: '<script type="module"></script>' },
      ],
      { prompt: "add stick figures that fight" },
    );

    assert.equal(result.ok, true);
    assert.equal(result.overallStatus, "advisory");
    assert.equal(result.checks.find((c) => c.id === "visual_interaction")?.status, "advisory");
  });
});
