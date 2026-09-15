import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  isMockProviderEnabled,
  mockApplyPlanBatchPatch,
  mockRunPlan,
  mockGreenfieldGenerate,
} from "./mockProvider.cjs";

const sudokuApp = readFileSync(
  path.join(process.cwd(), "e2e/fixtures/sudoku-vite/src/App.tsx"),
  "utf8",
);

describe("mock provider", () => {
  it("is disabled unless BRYANTLABS_MOCK_PROVIDER=1", () => {
    const prev = process.env.BRYANTLABS_MOCK_PROVIDER;
    delete process.env.BRYANTLABS_MOCK_PROVIDER;
    assert.equal(isMockProviderEnabled(), false);
    process.env.BRYANTLABS_MOCK_PROVIDER = "1";
    assert.equal(isMockProviderEnabled(), true);
    if (prev === undefined) delete process.env.BRYANTLABS_MOCK_PROVIDER;
    else process.env.BRYANTLABS_MOCK_PROVIDER = prev;
  });

  it("mockRunPlan returns gameplay files for gameplay prompts", () => {
    process.env.BRYANTLABS_MOCK_PROVIDER = "1";
    const result = mockRunPlan(
      "anthropic",
      "Add notes mode and hints",
      { framework: "vite", language: "typescript", packageManager: "npm", totalFiles: 5, totalFolders: 2, entryPoints: [], files: [], symbols: [] },
    );
    assert.equal(result.ok, true);
    assert.ok(result.plan?.files.some((f: { path: string }) => f.path === "src/App.tsx"));
    assert.ok(result.plan?.files.some((f: { path: string }) => f.path === "src/index.css"));
  });

  it("mockApplyPlanBatchPatch returns valid @@FILE blocks", () => {
    const result = mockApplyPlanBatchPatch(
      "anthropic",
      "Add notes mode",
      [{ path: "src/App.tsx", content: "export default function App() { return null; }" }],
      { planSummary: "Gameplay", targetPaths: ["src/App.tsx"], slimContext: false, directRewrite: false, repair: false },
    );
    assert.equal(result.ok, true);
    assert.match(result.rawText ?? "", /@@FILE:src\/App\.tsx/);
    assert.match(result.files?.["src/App.tsx"] ?? "", /mock: gameplay upgrade/);
  });

  it("mockApplyPlanBatchPatch always mutates App.tsx for Add a timer", () => {
    const namedExport = mockApplyPlanBatchPatch(
      "anthropic",
      "Add a timer",
      [{ path: "src/App.tsx", content: sudokuApp }],
      {
        planSummary: "Timer",
        targetPaths: ["src/App.tsx"],
        slimContext: false,
        directRewrite: false,
        repair: false,
      },
    );
    assert.equal(namedExport.ok, true);
    assert.notEqual(namedExport.files?.["src/App.tsx"], sudokuApp);
    assert.match(namedExport.files?.["src/App.tsx"] ?? "", /mock: timer enhancement/);
    assert.match(namedExport.files?.["src/App.tsx"] ?? "", /MOCK_TIMER/);

    const defaultExport = "export default function App() { return <h2>Timer</h2>; }\n";
    const defaultResult = mockApplyPlanBatchPatch(
      "anthropic",
      "Previous: Add calculation history.\nCurrent: Add a timer",
      [{ path: "src/App.tsx", content: defaultExport }],
      {
        planSummary: "Timer",
        targetPaths: ["src/App.tsx"],
        slimContext: false,
        directRewrite: false,
        repair: false,
      },
    );
    assert.equal(defaultResult.ok, true);
    assert.notEqual(defaultResult.files?.["src/App.tsx"], defaultExport);
    assert.match(defaultResult.files?.["src/App.tsx"] ?? "", /mock: timer enhancement/);
  });

  it("mockApplyPlanBatchPatch creates a valid History component", () => {
    const result = mockApplyPlanBatchPatch(
      "anthropic",
      "Add calculation history. Create a separate History component.",
      [
        { path: "src/App.tsx", content: "export function App() { return null; }\n" },
        { path: "src/components/History.tsx", content: "" },
      ],
      {
        planSummary: "History",
        targetPaths: ["src/App.tsx", "src/components/History.tsx"],
        slimContext: false,
        directRewrite: false,
        repair: false,
      },
    );
    assert.equal(result.ok, true);
    assert.match(result.files?.["src/App.tsx"] ?? "", /MOCK_CALC_HISTORY/);
    assert.match(result.files?.["src/components/History.tsx"] ?? "", /export function History/);
  });

  it("mockGreenfieldGenerate returns seven scaffold files", () => {
    const result = mockGreenfieldGenerate("anthropic", "Build a calculator");
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
    assert.ok(result.files?.some((f) => f.path === "src/App.tsx"));
    assert.match(
      result.files?.find((f) => f.path === "src/main.tsx")?.content ?? "",
      /vite\/client/,
    );
    assert.match(
      result.files?.find((f) => f.path === "src/App.tsx")?.content ?? "",
      /calculator-display/,
    );
  });

  it("returns the FieldFlow multi-page fixture only for the test-only selector", () => {
    const generic = mockGreenfieldGenerate(
      "anthropic",
      "Build FieldFlow — a multi-page SaaS dashboard with leads, jobs, and settings.",
    );
    assert.equal(generic.ok, true);
    assert.equal(generic.files?.length, 7);
    assert.equal(generic.files?.some((f) => f.path === "public/logo.svg"), false);

    const fixture = mockGreenfieldGenerate(
      "anthropic",
      "Build FieldFlow. BRYANTLABS_E2E_FIXTURE:fieldflow-multipage",
    );
    assert.equal(fixture.ok, true);
    assert.ok((fixture.files?.length ?? 0) > 7);
    assert.ok(fixture.files?.some((f) => f.path === "src/pages/Dashboard.tsx"));
    assert.ok(fixture.files?.some((f) => f.path === "src/pages/Jobs.tsx"));
    assert.ok(fixture.files?.some((f) => f.path === "src/components/jobs/JobDetail.tsx"));
    assert.ok(fixture.files?.some((f) => f.path === "public/logo.svg"));
    assert.match(fixture.rawText ?? "", /BRYANTLABS_E2E_FIXTURE:fieldflow-multipage/);
    assert.match(
      fixture.files?.find((f) => f.path === "src/App.tsx")?.content ?? "",
      /jobs\/:jobId/,
    );
  });
});
