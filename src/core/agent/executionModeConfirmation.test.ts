import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyExecutionModeChoice,
  recordExecutionModeSessionChoice,
  resolveExecutionMode,
  routeAfterExecutionMode,
} from "@/core/agent/executionModeConfirmation";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import {
  inspectWorkspaceProjectProfile,
  suggestSiblingProjectFolder,
} from "@/core/agent/workspaceProjectProfile";
import { mockProjectScan } from "@/core/repository/testScan";

const SUDOKU_EXTEND_PROMPT = `Transform this into a polished Sudoku application.
Do NOT redesign the existing visual style.
Extend the current application while preserving every existing feature.
Keep working:
* Difficulty selector`;

describe("workspaceProjectProfile", () => {
  it("detects existing React application from structure", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx", "src/main.tsx"]);
    const profile = inspectWorkspaceProjectProfile({
      projectOpen: true,
      projectPath: "/tmp/A30",
      scan,
      scanStatus: "done",
    });
    assert.equal(profile.isExistingApplication, true);
    assert.equal(profile.hasAppEntry, true);
    assert.equal(profile.isEmptyWorkspace, false);
    assert.ok(profile.applicationLabel?.includes("application"));
  });

  it("detects empty workspace without source files", () => {
    const profile = inspectWorkspaceProjectProfile({
      projectOpen: true,
      projectPath: "/tmp/A31",
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
    });
    assert.equal(profile.isEmptyWorkspace, true);
    assert.equal(profile.isExistingApplication, false);
  });

  it("suggests numbered sibling folders", () => {
    assert.equal(
      suggestSiblingProjectFolder("/Users/me/studiotest/A30"),
      "/Users/me/studiotest/A31",
    );
  });
});

describe("executionModeConfirmation", () => {
  it("auto-selects follow-up edit for existing application", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Add daily challenge mode",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    const resolution = resolveExecutionMode({
      projectOpen: true,
      projectPath: "/tmp/A30",
      scan,
      scanStatus: "done",
      route,
      prompt: "Add daily challenge mode",
    });
    assert.equal(resolution.confirmationRequired, false);
    assert.equal(resolution.diagnostics.mode, "follow_up_edit");
    assert.equal(resolution.recommendedChoice, "edit_current");
  });

  it("requires confirmation for explicit new app on existing project", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Build a brand new calculator app in a new folder",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    const resolution = resolveExecutionMode({
      projectOpen: true,
      projectPath: "/tmp/A30",
      scan,
      scanStatus: "done",
      route,
      prompt: "Build a brand new calculator app in a new folder",
    });
    assert.equal(resolution.confirmationRequired, true);
    assert.equal(resolution.recommendedChoice, "edit_current");
    assert.equal(suggestSiblingProjectFolder("/tmp/A30"), "/tmp/A31");
  });

  it("auto-selects greenfield for empty workspace with new app prompt", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const route = routeAgentPrompt({
      prompt: "Build a premium Sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    const resolution = resolveExecutionMode({
      projectOpen: true,
      projectPath: "/tmp/A31",
      scan,
      scanStatus: "done",
      route,
      prompt: "Build a premium Sudoku app",
    });
    assert.equal(resolution.confirmationRequired, false);
    assert.equal(resolution.diagnostics.mode, "greenfield");
    assert.equal(resolution.recommendedChoice, "create_new");
  });

  it("requires confirmation when preserve-existing prompt is used on empty workspace", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const route = routeAgentPrompt({
      prompt: SUDOKU_EXTEND_PROMPT,
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    const resolution = resolveExecutionMode({
      projectOpen: true,
      projectPath: "/tmp/A31",
      scan,
      scanStatus: "done",
      route,
      prompt: SUDOKU_EXTEND_PROMPT,
    });
    assert.equal(route.execution, "blocked");
    assert.equal(resolution.confirmationRequired, false);
  });

  it("forces build_loop when user confirms edit on ambiguous route", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const route = routeAgentPrompt({
      prompt: "Build a brand new calculator app in a new folder",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    const forced = applyExecutionModeChoice(route, "edit_current", "/tmp/A30");
    assert.equal(forced.execution, "build_loop");
    const effective = routeAfterExecutionMode(forced, {
      mode: "follow_up_edit",
      reason: "Existing application detected.",
      confirmationRequired: false,
      userChoice: "edit_current",
      recommendedChoice: "edit_current",
      workspaceLabel: "A30",
      applicationLabel: "React application",
      profileSignature: "A30:app:1",
      createTargetFolder: "/tmp/A30",
    });
    assert.equal(effective.execution, "build_loop");
  });

  it("still requires confirmation for explicit new-app after consecutive edits", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
        key: () => null,
        get length() {
          return store.size;
        },
      },
    });

    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const editPrompt = "Add daily challenge mode";
    const editRoute = routeAgentPrompt({
      prompt: editPrompt,
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    const editResolution = resolveExecutionMode({
      projectOpen: true,
      projectPath: "/tmp/A30",
      scan,
      scanStatus: "done",
      route: editRoute,
      prompt: editPrompt,
    });
    recordExecutionModeSessionChoice("edit_current", editResolution.profile);
    recordExecutionModeSessionChoice("edit_current", editResolution.profile);

    const newAppPrompt = "Build a brand new calculator app in a new folder";
    const route = routeAgentPrompt({
      prompt: newAppPrompt,
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    const resolution = resolveExecutionMode({
      projectOpen: true,
      projectPath: "/tmp/A30",
      scan,
      scanStatus: "done",
      route,
      prompt: newAppPrompt,
    });
    assert.equal(resolution.confirmationRequired, true);
    assert.equal(resolution.recommendedChoice, "edit_current");
  });
});
