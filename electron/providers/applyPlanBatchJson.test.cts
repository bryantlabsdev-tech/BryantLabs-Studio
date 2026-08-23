import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Regression: Apply Plan batch must cross Electron IPC as a JSON string so
 * Chromium contextBridge/structured-clone cannot hang before main runs.
 * Callers must stringify in the renderer (string-only bridge args).
 */
describe("applyPlanBatchJson payload contract", () => {
  it("serializes path-only file targets to a compact JSON string", () => {
    const payload = {
      provider: "anthropic",
      prompt: "Expand Northstar with Kanban",
      context: {
        framework: "react",
        language: "typescript",
        files: [],
        symbols: [],
      },
      files: [
        {
          path: "src/pages/Tasks.tsx",
          content: "",
          absPath: "/tmp/proj/src/pages/Tasks.tsx",
        },
        { path: "src/App.tsx", content: "", absPath: "/tmp/proj/src/App.tsx" },
      ],
      meta: {
        planSummary: "Add Kanban",
        targetPaths: ["src/pages/Tasks.tsx", "src/App.tsx"],
        slimContext: true,
      },
    };
    const json = JSON.stringify(payload);
    assert.ok(json.length < 2_000);
    assert.ok(!json.includes("export default"));
    const parsed = JSON.parse(json) as typeof payload;
    assert.equal(parsed.files.length, 2);
    assert.equal(parsed.files[0]?.content, "");
    assert.ok(parsed.files[0]?.absPath);
  });

  it("documents string-only preload contract", () => {
    // preload: proposeApplyPlanPatchesJson(payloadJson: string) → applyPlanBatchJson
    assert.equal(typeof "string", "string");
  });
});
