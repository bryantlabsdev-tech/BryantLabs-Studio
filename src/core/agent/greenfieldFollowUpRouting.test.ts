import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGreenfieldFallbackSourceFileCount,
  isEmptyProjectFolder,
} from "@/core/agent/agentGreenfieldDispatch";
import { classifyStudioIntent } from "@/core/agent/classifyStudioIntent";
import {
  canCreateInCurrentFolder,
  routeAgentPrompt,
} from "@/core/agent/unifiedAgentRoute";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";

const CALCULATOR_CREATE_PROMPT = "build a calculator app";
const DARK_MODE_FOLLOW_UP =
  "Add dark mode toggle to the calculator. Persist preference in localStorage.";
const CALC_HISTORY_PROMPT =
  "Add calculation history. Show last 10 calculations. Create a separate History component. Persist history in localStorage. Add clear history button.";

const GREENFIELD_WRITTEN_FILES = [
  "package.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
] as const;

function calculatorGreenfieldRun(projectPath: string) {
  return {
    ...emptyGreenfieldRun(),
    runResult: "success" as const,
    filesWritten: [...GREENFIELD_WRITTEN_FILES],
    targetFolder: projectPath,
    projectPath,
  };
}

describe("greenfield follow-up routing after create", () => {
  it("routes calculator create on empty folder to greenfield", () => {
    const route = routeAgentPrompt({
      prompt: CALCULATOR_CREATE_PROMPT,
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
    });
    assert.equal(route.execution, "greenfield");
    assert.equal(route.mode, "create_new_app");
  });

  it("routes dark mode follow-up to edit when scan is stale but filesWritten fallback exists", () => {
    const projectPath = "/tmp/calculator";
    const staleScan = mockProjectScan([], { packageJson: false });
    const fallback = buildGreenfieldFallbackSourceFileCount(
      calculatorGreenfieldRun(projectPath),
      projectPath,
    );
    assert.ok(fallback && fallback > 0);

    const route = routeAgentPrompt({
      prompt: DARK_MODE_FOLLOW_UP,
      projectOpen: true,
      projectPath,
      scan: staleScan,
      scanStatus: "done",
      fallbackSourceFileCount: fallback,
    });

    assert.notEqual(route.execution, "greenfield");
    assert.equal(route.execution, "build_loop");
    assert.equal(route.mode, "edit_existing_project");
    assert.equal(route.reason, "edit_keywords");
    assert.equal(route.intent, "follow_up");
  });

  it("routes follow-up before rescan while scan is null and scanStatus is done", () => {
    const projectPath = "/tmp/calculator";
    const fallback = buildGreenfieldFallbackSourceFileCount(
      calculatorGreenfieldRun(projectPath),
      projectPath,
    );
    assert.ok(fallback && fallback > 0);

    const route = routeAgentPrompt({
      prompt: DARK_MODE_FOLLOW_UP,
      projectOpen: true,
      projectPath,
      scan: null,
      scanStatus: "done",
      fallbackSourceFileCount: fallback,
    });

    assert.equal(route.execution, "build_loop");
    assert.notEqual(route.execution, "greenfield");
  });

  it("allows follow-up while rescanning when fallback proves sources", () => {
    const projectPath = "/tmp/calculator";
    const fallback = buildGreenfieldFallbackSourceFileCount(
      calculatorGreenfieldRun(projectPath),
      projectPath,
    );
    assert.ok(fallback && fallback > 0);

    const route = routeAgentPrompt({
      prompt: DARK_MODE_FOLLOW_UP,
      projectOpen: true,
      projectPath,
      scan: null,
      scanStatus: "scanning",
      fallbackSourceFileCount: fallback,
      filesWritten: [...GREENFIELD_WRITTEN_FILES],
    });

    assert.equal(route.execution, "build_loop");
    assert.notEqual(route.execution, "blocked");
  });

  it("blocks follow-up while scan is actively rescanning without fallback", () => {
    const route = routeAgentPrompt({
      prompt: DARK_MODE_FOLLOW_UP,
      projectOpen: true,
      projectPath: "/tmp/calculator",
      scan: null,
      scanStatus: "scanning",
    });

    assert.equal(route.execution, "blocked");
    assert.match(route.blockedReason ?? "", /scan/i);
  });

  it("does not allow greenfield recreate when fallback proves sources exist", () => {
    const projectPath = "/tmp/calculator";
    const staleScan = mockProjectScan(["package.json"], { packageJson: true });
    const fallback = buildGreenfieldFallbackSourceFileCount(
      calculatorGreenfieldRun(projectPath),
      projectPath,
    );
    assert.ok(fallback && fallback > 0);

    assert.equal(
      isEmptyProjectFolder({
        scan: staleScan,
        scanStatus: "done",
        fallbackSourceFileCount: fallback,
      }),
      false,
    );
    assert.equal(
      canCreateInCurrentFolder({
        scan: staleScan,
        scanStatus: "done",
        fallbackSourceFileCount: fallback,
      }),
      false,
    );
  });

  it("classifyStudioIntent agrees on follow-up after greenfield write", () => {
    const result = classifyStudioIntent({
      prompt: DARK_MODE_FOLLOW_UP,
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
      fallbackSourceFileCount: GREENFIELD_WRITTEN_FILES.length,
    });

    assert.equal(result.intent, "follow_up");
    assert.equal(result.routeMode, "edit");
    assert.notEqual(result.routeMode, "greenfield");
  });

  it("routes calculation history follow-up to edit when filesWritten scaffold exists", () => {
    const projectPath = "/tmp/calculator";
    const staleScan = mockProjectScan([], { packageJson: false });
    const run = calculatorGreenfieldRun(projectPath);

    const route = routeAgentPrompt({
      prompt: CALC_HISTORY_PROMPT,
      projectOpen: true,
      projectPath,
      scan: staleScan,
      scanStatus: "done",
      filesWritten: run.filesWritten,
      previousSuccessfulRun: true,
      fallbackSourceFileCount: run.filesWritten.length,
    });

    assert.notEqual(route.execution, "greenfield");
    assert.equal(route.execution, "build_loop");
    assert.equal(route.decision.selectedRoute, "build_loop");
    assert.equal(route.decision.greenfieldRejected, true);
    assert.ok(route.decision.greenfieldRejectReason);
    assert.ok(route.decision.fallbackSourceCount > 0);
  });

  it("still routes truly empty folders without fallback to greenfield for edit phrasing", () => {
    const route = routeAgentPrompt({
      prompt: DARK_MODE_FOLLOW_UP,
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
    });
    assert.equal(route.execution, "greenfield");
  });
});
