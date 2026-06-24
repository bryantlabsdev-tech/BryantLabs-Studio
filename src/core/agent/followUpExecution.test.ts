import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GREENFIELD_BLOCKED_BY_ROUTE_DETAIL,
  resolveFollowUpSubmitAction,
  routeExecutionFromDecision,
} from "@/core/agent/followUpExecution";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";

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

describe("followUpExecution", () => {
  it("routes build_loop when routeDecision rejected greenfield despite stale empty folder", () => {
    const staleScan = mockProjectScan([], { packageJson: false });
    const route = routeAgentPrompt({
      prompt: CALC_HISTORY_PROMPT,
      projectOpen: true,
      projectPath: "/tmp/calculator",
      scan: staleScan,
      scanStatus: "done",
      filesWritten: [...GREENFIELD_WRITTEN_FILES],
      previousSuccessfulRun: true,
      fallbackSourceFileCount: GREENFIELD_WRITTEN_FILES.length,
    });

    assert.equal(route.execution, "build_loop");
    assert.equal(route.decision.selectedRoute, "build_loop");
    assert.equal(route.decision.greenfieldRejected, true);

    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: route.execution,
      emptyProjectFolder: true,
      scan: staleScan,
      scanStatus: "done",
      fallbackSourceFileCount: GREENFIELD_WRITTEN_FILES.length,
      filesWritten: [...GREENFIELD_WRITTEN_FILES],
      useAgentLoopForEdits: false,
    });

    assert.equal(action.kind, "build_loop");
    if (action.kind !== "build_loop") return;
    assert.equal(action.greenfieldBlockedByRoute, true);
  });

  it("allows build_loop while rescanning when fallback proves sources", () => {
    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: "build_loop",
      emptyProjectFolder: false,
      scan: null,
      scanStatus: "scanning",
      fallbackSourceFileCount: GREENFIELD_WRITTEN_FILES.length,
      filesWritten: [...GREENFIELD_WRITTEN_FILES],
      useAgentLoopForEdits: false,
    });

    assert.equal(action.kind, "build_loop");
  });

  it("allows build_loop without scan when filesWritten scaffold exists", () => {
    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: "build_loop",
      emptyProjectFolder: false,
      scan: null,
      scanStatus: "done",
      filesWritten: [...GREENFIELD_WRITTEN_FILES],
      useAgentLoopForEdits: false,
    });

    assert.equal(action.kind, "build_loop");
  });

  it("blocks build_loop when scan is missing and no fallback exists", () => {
    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: "build_loop",
      emptyProjectFolder: false,
      scan: null,
      scanStatus: "done",
    });

    assert.equal(action.kind, "blocked_scan");
  });

  it("does not choose greenfield when route execution is build_loop", () => {
    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: "build_loop",
      emptyProjectFolder: true,
      scan: mockProjectScan(["src/App.tsx"]),
      scanStatus: "done",
    });

    assert.notEqual(action.kind, "greenfield");
    assert.equal(action.kind, "agent_loop");
  });

  it("prefers agent_loop for edits when enabled", () => {
    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: "build_loop",
      emptyProjectFolder: false,
      scan: mockProjectScan(["src/App.tsx"]),
      scanStatus: "done",
      useAgentLoopForEdits: true,
    });

    assert.equal(action.kind, "agent_loop");
  });

  it("falls back to build_loop when agent loop edits are disabled", () => {
    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: "build_loop",
      emptyProjectFolder: true,
      scan: mockProjectScan(["src/App.tsx"]),
      scanStatus: "done",
      useAgentLoopForEdits: false,
    });

    assert.equal(action.kind, "build_loop");
  });

  it("allows greenfield only when route execution is greenfield", () => {
    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: "greenfield",
      emptyProjectFolder: true,
      scan: mockProjectScan([]),
      scanStatus: "done",
    });

    assert.equal(action.kind, "greenfield");
  });

  it("simulates follow-up execution: build_loop called, greenfield write not used", () => {
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "success" as const,
      filesWritten: [...GREENFIELD_WRITTEN_FILES],
      targetFolder: "/tmp/calculator",
    };
    const staleScan = mockProjectScan([], { packageJson: false });

    const route = routeAgentPrompt({
      prompt: CALC_HISTORY_PROMPT,
      projectOpen: true,
      projectPath: "/tmp/calculator",
      scan: staleScan,
      scanStatus: "done",
      filesWritten: run.filesWritten,
      previousSuccessfulRun: true,
      fallbackSourceFileCount: run.filesWritten.length,
    });

    const action = resolveFollowUpSubmitAction({
      hasProject: true,
      routeExecution: route.execution,
      emptyProjectFolder: true,
      scan: staleScan,
      scanStatus: "done",
      fallbackSourceFileCount: run.filesWritten.length,
      filesWritten: run.filesWritten,
      useAgentLoopForEdits: false,
    });

    const wouldCallGreenfieldWrite = action.kind === "greenfield";
    const wouldCallBuildLoop = action.kind === "build_loop";

    assert.equal(wouldCallGreenfieldWrite, false);
    assert.equal(wouldCallBuildLoop, true);
    assert.match(GREENFIELD_BLOCKED_BY_ROUTE_DETAIL, /build_loop/i);
  });

  it("derives execution from route decision trace", () => {
    assert.equal(
      routeExecutionFromDecision({
        candidates: ["greenfield", "build_loop"],
        scannedSourceCount: 0,
        sourceCountUsed: 7,
        fallbackSourceCount: 7,
        greenfieldRejected: true,
        greenfieldRejectReason: "project_files_or_scaffold_present",
        selectedRoute: "build_loop",
        selectionReason: "edit_keywords",
      }),
      "build_loop",
    );
  });
});
