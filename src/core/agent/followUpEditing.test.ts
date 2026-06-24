import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditProjectForEdit, runProjectEditAudit } from "@/core/agent/projectEditAudit";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";

function viteAppScan() {
  return mockProjectScan(
    [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "src/main.tsx",
      "src/App.tsx",
      "src/index.css",
    ],
    {
      packageJson: true,
    },
  );
}

describe("follow-up editing routing", () => {
  it("Existing Vite app + Add a timer routes to edit_existing_project", () => {
    const route = routeAgentPrompt({
      prompt: "Add a timer to this Sudoku app",
      projectOpen: true,
      scan: viteAppScan(),
      scanStatus: "done",
    });
    assert.equal(route.mode, "edit_existing_project");
    assert.equal(route.execution, "build_loop");
    assert.equal(route.needsEmptyFolder, false);
  });

  it("Existing Vite app + Make it mobile friendly routes to edit_existing_project", () => {
    const route = routeAgentPrompt({
      prompt: "Make it mobile friendly",
      projectOpen: true,
      scan: viteAppScan(),
      scanStatus: "done",
    });
    assert.equal(route.mode, "edit_existing_project");
    assert.equal(route.execution, "build_loop");
  });

  it("Existing Vite app + Fix the build error routes to repair_project", () => {
    const route = routeAgentPrompt({
      prompt: "Fix the build error",
      projectOpen: true,
      scan: viteAppScan(),
      scanStatus: "done",
    });
    assert.equal(route.mode, "repair_project");
    assert.equal(route.intent, "repair");
  });

  it("Empty folder + Build a Sudoku app routes to create_new_app", () => {
    const route = routeAgentPrompt({
      prompt: "Build a Sudoku app",
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
    });
    assert.equal(route.mode, "create_new_app");
    assert.equal(route.execution, "greenfield");
  });

  it("Existing app + brand new app in new folder routes to create_new_app", () => {
    const route = routeAgentPrompt({
      prompt: "Build a brand new calculator app in a new folder",
      projectOpen: true,
      scan: viteAppScan(),
      scanStatus: "done",
    });
    assert.equal(route.mode, "create_new_app");
    assert.equal(route.needsEmptyFolder, true);
    assert.equal(route.execution, "blocked");
  });
});

describe("project edit audit", () => {
  it("audits vite react project structure", () => {
    const audit = auditProjectForEdit(viteAppScan());
    assert.ok(audit);
    assert.equal(audit!.typescript, true);
    assert.ok(audit!.scripts.includes("build"));
    assert.equal(audit!.entryFile, "src/main.tsx");
    assert.equal(audit!.appFile, "src/App.tsx");
    assert.ok(audit!.safestEditTargets.includes("src/App.tsx"));
  });

  it("runProjectEditAudit logs without throwing", () => {
    assert.doesNotThrow(() => runProjectEditAudit(viteAppScan()));
  });
});
