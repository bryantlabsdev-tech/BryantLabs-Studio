import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveAgentRunCard } from "@/core/agent/agentRunCard";
import {
  deriveExecutionDashboard,
  formatExecutionVerificationLabel,
} from "@/core/agent/executionDashboard";
import { deriveAgentRunStatus } from "@/core/agent/agentRunStatus";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { FollowUpRunStatus } from "@/core/build/followUpRun";
import type { Plan } from "@/core/planner/types";

function samplePlan(): Plan {
  return {
    prompt: "Add achievements to the Sudoku app",
    intent: "Gameplay feature",
    summary: "Add achievement tracking",
    files: [
      {
        path: "src/App.tsx",
        absPath: "/proj/src/App.tsx",
        score: 9,
        reasons: ["Contains game state"],
      },
    ],
    proposedChanges: ["Add achievement state", "Add achievement modal"],
    confidence: "High",
    impact: "Medium",
    createdAt: Date.now(),
  };
}

function runningRunStatus(): FollowUpRunStatus {
  return {
    phase: "planning",
    progressPercent: 25,
    currentLabel: "Planning changes",
    waitingLabel: "Planning…",
    nextLabel: "Editing files",
    elapsedMs: 12_000,
    provider: "Anthropic",
    model: "claude-opus-4-6",
    currentFile: null,
    isActive: true,
    activity: [],
    escalationNote: null,
    greenfieldProgress: null,
  };
}

describe("deriveExecutionDashboard", () => {
  it("maps real planner data into dashboard sections", () => {
    const greenfieldRun = {
      ...emptyGreenfieldRun(),
      runTimeline: {
        runId: "run-1",
        route: "edit_follow_up",
        startedAt: Date.now() - 5000,
        stages: [
          {
            stage: "plan_start" as const,
            at: Date.now() - 4000,
            elapsedMs: 1000,
            stageDurationMs: 1000,
            detail: null,
          },
          {
            stage: "plan_complete" as const,
            at: Date.now() - 2000,
            elapsedMs: 3000,
            stageDurationMs: 2000,
            detail: "files=src/App.tsx",
          },
        ],
        lastStage: "plan_complete" as const,
        lastSuccessfulStage: "plan_complete" as const,
        status: "running" as const,
        completedAt: null,
        totalDurationMs: null,
        failureDetail: null,
      },
    };

    const card = deriveAgentRunCard({
      runStatus: runningRunStatus(),
      greenfieldRun,
      planApplySession: null,
      plan: samplePlan(),
      aiPlan: {
        ok: true,
        provider: "anthropic",
        model: "claude-opus-4-6",
        latencyMs: 900,
        raw: {},
        plan: {
          summary: "Add achievements",
          files: [{ path: "src/App.tsx", reason: "Game logic lives here" }],
          reasoning: "Achievements should hook into existing win detection.",
          risks: ["May need persistence layer"],
          confidence: "High",
        },
      },
      scan: null,
      prompt: "Add achievements to the Sudoku app",
      now: Date.now(),
    });

    const dashboard = deriveExecutionDashboard({
      card,
      timeline: greenfieldRun.runTimeline,
      prompt: "Add achievements to the Sudoku app",
    });

    assert.equal(dashboard.promptTitle, "Add achievements to the Sudoku app");
    assert.ok(dashboard.thoughts.length > 0);
    assert.ok(
      dashboard.thoughts.some((t) => t.kind === "event" || t.kind === "reasoning"),
    );
    assert.equal(dashboard.currentStage, "Plan ready");
    assert.equal(dashboard.overallStatus, "running");
    assert.equal(dashboard.currentTask, card.currentStep?.label ?? null);
  });

  it("shows completion summary when run finishes", () => {
    const runStatus = deriveAgentRunStatus({
      greenfieldRun: emptyGreenfieldRun(),
      greenfieldPanelActive: false,
      agentIntent: null,
      buildPhase: "idle",
      planApplyPhase: null,
      planApplySession: null,
      autoFixPhase: null,
      buildRunning: false,
      pipelineRunning: false,
      recentLogs: [],
      runStartedAt: Date.now() - 60_000,
      provider: null,
      model: null,
      buildError: null,
      planApplyError: null,
      pipelineError: null,
    });

    const card = deriveAgentRunCard({
      runStatus: { ...runStatus, phase: "done", isActive: false },
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline: {
          runId: "run-2",
          route: "edit_follow_up",
          startedAt: Date.now() - 60_000,
          stages: [
            {
              stage: "run_complete",
              at: Date.now(),
              elapsedMs: 60_000,
              stageDurationMs: 1000,
              detail: "Success",
            },
          ],
          lastStage: "run_complete",
          lastSuccessfulStage: "run_complete",
          status: "complete",
          completedAt: Date.now(),
          totalDurationMs: 60_000,
          failureDetail: null,
        },
        filesWritten: ["src/App.tsx"],
      },
      planApplySession: null,
      plan: samplePlan(),
      aiPlan: null,
      scan: null,
      prompt: "Add achievements",
      now: Date.now(),
    });

    const dashboard = deriveExecutionDashboard({
      card,
      timeline: emptyGreenfieldRun().runTimeline,
      prompt: "Add achievements",
    });

    assert.equal(dashboard.completion.isVisible, true);
    assert.ok(dashboard.completion.filesModified.includes("src/App.tsx"));
  });
});

describe("formatExecutionVerificationLabel", () => {
  it("uses running and passed icons", () => {
    assert.match(formatExecutionVerificationLabel("TypeScript", "running"), /⏳/);
    assert.match(formatExecutionVerificationLabel("Build", "passed"), /✅/);
    assert.match(formatExecutionVerificationLabel("Preview", "failed"), /❌/);
    assert.match(formatExecutionVerificationLabel("UI Audit", "advisory", { score: 86 }), /⚠️/);
    assert.match(
      formatExecutionVerificationLabel("UI Audit", "advisory", { score: 86 }),
      /Advisory \(score 86\)/,
    );
  });
});

describe("deriveExecutionDashboard advisory UI audit", () => {
  it("shows advisory verification status with layout details", () => {
    const greenfieldRun = {
      ...emptyGreenfieldRun(),
      runResult: "success" as const,
      uiAuditResult: {
        ok: false,
        skipped: true,
        advisory: true,
        type: "table_layout" as const,
        score: 86,
        issues: ["labels_missing" as const],
        details: "Generated App UI Audit advisory: table_layout score=86 issues=labels_missing",
        classification: {
          type: "table_layout" as const,
          confidence: 80,
          signals: ["table"],
        },
      },
      entries: [
        createRunLogEntry("ui_audit", "success", "UI audit advisory"),
      ],
    };

    const card = deriveAgentRunCard({
      runStatus: {
        phase: "done",
        progressPercent: 100,
        currentLabel: "Complete",
        waitingLabel: "Complete",
        nextLabel: "Complete",
        elapsedMs: 30_000,
        provider: null,
        model: null,
        currentFile: null,
        isActive: false,
        activity: [],
        escalationNote: null,
        greenfieldProgress: null,
      },
      greenfieldRun,
      planApplySession: null,
      plan: null,
      aiPlan: null,
      scan: null,
      prompt: "Compare cosmetics products",
      now: Date.now(),
    });

    const dashboard = deriveExecutionDashboard({
      card,
      timeline: null,
      prompt: "Compare cosmetics products",
      greenfieldRun,
    });

    const uiAuditRow = dashboard.verification.find((row) => row.label === "UI Audit");
    assert.equal(uiAuditRow?.status, "advisory");
    assert.ok(dashboard.uiAuditAdvisory);
    assert.equal(dashboard.uiAuditAdvisory?.layoutType, "table_layout");
    assert.equal(dashboard.uiAuditAdvisory?.score, 86);
    assert.ok(dashboard.uiAuditAdvisory?.recommendations.length > 0);
    assert.match(dashboard.completion.verificationResult ?? "", /UI audit advisory/);
  });
});
