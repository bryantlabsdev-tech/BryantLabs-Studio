import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildImprovementRerouteNote,
  classifyStudioIntent,
  looksLikeAuditPrompt,
  looksLikeEditExistingProjectPrompt,
  looksLikeExplicitGreenfieldRestart,
  looksLikeRepairPrompt,
} from "@/core/agent/classifyStudioIntent";

const SUDOKU_UPGRADE_PROMPT =
  "Upgrade the Sudoku app, but keep it stable. Add Timer, Mistake counter, New Game, Difficulty levels, Hints, highlights, prevent changing original puzzle numbers, win message, mobile layout. Do not add backend, auth, or API calls.";
import { mockProjectScan } from "@/core/repository/testScan";

describe("classifyStudioIntent", () => {
  it("blocks greenfield prompts when no folder is selected", () => {
    const result = classifyStudioIntent({
      prompt: "Build a Sudoku app",
      projectOpen: false,
      scan: null,
      scanStatus: "idle",
    });
    assert.equal(result.intent, "blocked");
    assert.match(result.reason ?? "", /empty folder/i);
  });

  it("routes greenfield when empty folder is open", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const result = classifyStudioIntent({
      prompt: "Build a premium Sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "greenfield");
  });

  it("routes Create app on empty folder to greenfield", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const result = classifyStudioIntent({
      prompt: "Create app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "greenfield");
  });

  it("routes greenfield while scan is still idle on empty folder", () => {
    const result = classifyStudioIntent({
      prompt: "Build a Sudoku app",
      projectOpen: true,
      scan: null,
      scanStatus: "idle",
    });
    assert.equal(result.intent, "greenfield");
  });

  it("blocks edit prompts when no project is open", () => {
    const result = classifyStudioIntent({
      prompt: "Add a timer to the board",
      projectOpen: false,
      scan: null,
      scanStatus: "idle",
    });
    assert.equal(result.intent, "blocked");
  });

  it("routes follow-up when project has source files", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Add a timer",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "follow_up");
    assert.equal(result.rerouteNote, null);
  });

  it("does not route greenfield when project already has sources", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Create sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "follow_up");
    assert.equal(result.rerouteNote, null);
  });

  it("routes explicit restart on package.json projects to empty folder prompt", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Start over from scratch in a new empty folder",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "blocked");
    assert.ok(
      result.routeReason === "explicit_new_app" ||
        result.routeReason === "explicit_restart",
    );
    assert.ok(result.reason?.includes("empty"));
  });

  it("routes greenfield when project folder is empty", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const result = classifyStudioIntent({
      prompt: "Create a todo app from scratch",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "greenfield");
    assert.equal(result.routeMode, "greenfield");
  });

  it("uses fallback source count while scan catches up", () => {
    const result = classifyStudioIntent({
      prompt: "Create sudoku app",
      projectOpen: true,
      scan: null,
      scanStatus: "idle",
      fallbackSourceFileCount: 7,
    });
    assert.equal(result.intent, "follow_up");
    assert.equal(result.rerouteNote, null);
  });

  it("blocks follow-up on empty project without greenfield phrasing", () => {
    const scan = mockProjectScan([]);
    const result = classifyStudioIntent({
      prompt: "Fix navbar spacing",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "blocked");
  });

  it("buildImprovementRerouteNote mentions non-empty folder", () => {
    assert.match(
      buildImprovementRerouteNote("build sudoku app"),
      /not empty/i,
    );
  });

  it("detects explicit greenfield restart phrasing", () => {
    assert.equal(looksLikeExplicitGreenfieldRestart("create another app"), true);
  });

  it("routes error prompts to repair on existing projects", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Fix TypeScript errors",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "repair");
  });

  it("routes audit prompts to audit on existing projects", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Audit the codebase for issues",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "audit");
  });

  it("detects repair phrasing", () => {
    assert.equal(looksLikeRepairPrompt("Fix TypeScript errors"), true);
    assert.equal(looksLikeRepairPrompt("Add a timer"), false);
  });

  it("detects audit phrasing", () => {
    assert.equal(looksLikeAuditPrompt("Review the codebase"), true);
    assert.equal(looksLikeAuditPrompt("Make UI better"), false);
  });

  it("detects edit-existing-project phrasing", () => {
    assert.equal(looksLikeEditExistingProjectPrompt("Modify the timer"), true);
    assert.equal(looksLikeEditExistingProjectPrompt("Improve the existing app"), true);
    assert.equal(looksLikeEditExistingProjectPrompt("Add feature: dark mode"), true);
    assert.equal(looksLikeEditExistingProjectPrompt(SUDOKU_UPGRADE_PROMPT), true);
    assert.equal(looksLikeEditExistingProjectPrompt("Fix TypeScript errors"), false);
    assert.equal(looksLikeEditExistingProjectPrompt("Build a Sudoku app"), false);
  });

  it("routes upgrade on open project with sources to follow-up (not greenfield)", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: SUDOKU_UPGRADE_PROMPT,
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "follow_up");
    assert.notEqual(result.intent, "greenfield");
  });

  it("routes improve existing app on initialized empty folder to greenfield", () => {
    const scan = mockProjectScan([], { packageJson: true });
    const result = classifyStudioIntent({
      prompt: "Improve the existing app layout",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "greenfield");
    assert.notEqual(result.intent, "follow_up");
  });

  it("routes make improvements on open project with sources to follow-up", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Make improvements to the dashboard app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "follow_up");
    assert.equal(result.rerouteNote, null);
  });

  it("still routes new app prompts on empty open folder to greenfield", () => {
    const scan = mockProjectScan([], { packageJson: false });
    const result = classifyStudioIntent({
      prompt: "Build a premium Sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "greenfield");
  });

  it("routes modify existing sudoku project on package.json project to edit", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Modify the existing Sudoku project to add a timer",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "follow_up");
    assert.equal(result.routeMode, "edit");
    assert.equal(result.routeReason, "edit_keywords");
  });

  it("defaults package.json projects to edit even for build phrasing", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "Build a premium Sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "follow_up");
    assert.equal(result.routeMode, "edit");
    assert.equal(result.routeReason, "existing_project");
  });
});

describe("classifyStudioIntent lifecycle", () => {
  it("after create app, add timer routes follow-up", () => {
    const scan = mockProjectScan(["src/App.tsx", "src/main.tsx"]);
    const create = classifyStudioIntent({
      prompt: "Build a Sudoku game",
      projectOpen: true,
      scan: mockProjectScan([]),
      scanStatus: "done",
    });
    assert.equal(create.intent, "greenfield");

    const followUp = classifyStudioIntent({
      prompt: "Add a timer",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(followUp.intent, "follow_up");
  });

  it("after create app, create sudoku app does not route greenfield", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const result = classifyStudioIntent({
      prompt: "create sudoku app",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(result.intent, "follow_up");
    assert.notEqual(result.intent, "greenfield");
  });
});
