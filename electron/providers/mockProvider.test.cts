import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMockProviderEnabled,
  mockApplyPlanBatchPatch,
  mockRunPlan,
  mockGreenfieldGenerate,
} from "./mockProvider.cjs";

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
});
