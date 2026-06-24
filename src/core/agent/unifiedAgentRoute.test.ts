import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateInCurrentFolder,
  formatAgentRouteLabel,
  routeAgentPrompt,
  looksLikeRefactorPrompt,
} from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";

describe("routeAgentPrompt unified agent", () => {
  it("routes empty folder to create_new_app", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const route = routeAgentPrompt({
      prompt: "Build a Sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.mode, "create_new_app");
    assert.equal(route.execution, "greenfield");
    assert.equal(route.reason, "empty_folder");
  });

  it("routes empty folder with only package.json to greenfield", () => {
    const scan = mockProjectScan(["package.json"]);
    const route = routeAgentPrompt({
      prompt: "Create a simple counter app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.mode, "create_new_app");
    assert.equal(route.execution, "greenfield");
    assert.equal(route.reason, "empty_folder");
    assert.ok(route.activityNote?.includes("empty folder"));
  });

  it("never routes edit phrasing in empty folder to build_loop", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const route = routeAgentPrompt({
      prompt: "Add authentication and make it mobile friendly",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "greenfield");
    assert.notEqual(route.execution, "build_loop");
  });

  it("edit override on empty folder routes to greenfield", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const route = routeAgentPrompt({
      prompt: "Add a timer",
      projectOpen: true,
      scan,
      scanStatus: "done",
      modeOverride: "edit",
    });
    assert.equal(route.execution, "greenfield");
    assert.equal(route.reason, "empty_folder_override_edit");
  });

  it("routes follow-up on existing project to edit", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Add a timer and difficulty levels",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.mode, "edit_existing_project");
    assert.equal(route.execution, "build_loop");
    assert.equal(route.reason, "edit_keywords");
  });

  it("routes mobile friendly follow-up to edit on existing project", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Make it mobile friendly",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.mode, "edit_existing_project");
    assert.equal(route.execution, "build_loop");
  });

  it("routes fix build error to repair", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Fix the build error",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.mode, "repair_project");
    assert.equal(route.intent, "repair");
  });

  it("never routes existing project follow-up to greenfield", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Modify the existing Sudoku project",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.notEqual(route.execution, "greenfield");
    assert.equal(route.mode, "edit_existing_project");
  });

  it("asks for empty folder when user explicitly requests new app on existing project", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Create a new app in this folder",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.mode, "create_new_app");
    assert.equal(route.needsEmptyFolder, true);
    assert.equal(route.execution, "blocked");
    assert.ok(route.activityNote?.includes("empty folder"));
  });

  it("does not ask for empty folder when clearly editing", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Improve the existing app layout",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.needsEmptyFolder, false);
    assert.equal(route.mode, "edit_existing_project");
  });

  it("fix_errors override forces repair", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Add a timer",
      projectOpen: true,
      scan,
      scanStatus: "done",
      modeOverride: "fix_errors",
    });
    assert.equal(route.mode, "repair_project");
  });

  it("edit override forces edit", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Build a Sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
      modeOverride: "edit",
    });
    assert.equal(route.mode, "edit_existing_project");
    assert.equal(route.execution, "build_loop");
  });

  it("detects refactor phrasing", () => {
    assert.equal(looksLikeRefactorPrompt("Refactor the components folder"), true);
  });

  it("formats route labels for UI", () => {
    assert.equal(formatAgentRouteLabel("create_new_app"), "Create new app");
    assert.equal(formatAgentRouteLabel("edit_existing_project"), "Edit project");
  });

  it("allows greenfield in folder with package.json but no sources", () => {
    const scan = mockProjectScan(["package.json"]);
    assert.equal(
      canCreateInCurrentFolder({
        scan,
        scanStatus: "done",
      }),
      true,
    );
  });

  it("routes edit follow-up via fallback when scan is stale after greenfield", () => {
    const staleScan = mockProjectScan([], { packageJson: false });
    const route = routeAgentPrompt({
      prompt:
        "Add dark mode toggle to the calculator. Persist preference in localStorage.",
      projectOpen: true,
      scan: staleScan,
      scanStatus: "done",
      fallbackSourceFileCount: 7,
    });
    assert.notEqual(route.execution, "greenfield");
    assert.equal(route.execution, "build_loop");
    assert.equal(route.mode, "edit_existing_project");
    assert.equal(route.reason, "edit_keywords");
  });

  it("edit override uses fallback when scan is stale after greenfield", () => {
    const route = routeAgentPrompt({
      prompt: "Add a timer",
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
      modeOverride: "edit",
      fallbackSourceFileCount: 7,
    });
    assert.equal(route.execution, "build_loop");
    assert.equal(route.mode, "edit_existing_project");
  });

  it("allows routing while scanning when fallback proves sources exist", () => {
    const route = routeAgentPrompt({
      prompt: "Add dark mode toggle",
      projectOpen: true,
      projectPath: "/tmp/app",
      scan: null,
      scanStatus: "scanning",
      filesWritten: ["package.json", "src/App.tsx"],
      fallbackSourceFileCount: 7,
    });
    assert.notEqual(route.execution, "blocked");
    assert.equal(route.execution, "build_loop");
  });
});
