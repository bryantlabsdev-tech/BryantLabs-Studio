import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveAgentRunCard } from "@/core/agent/agentRunCard";
import { deriveAgentRunStatus } from "@/core/agent/agentRunStatus";
import { deriveExecutionDashboard } from "@/core/agent/executionDashboard";
import {
  getRunDurationMs,
  isRunTerminal,
  resolveRunTerminalState,
} from "@/core/agent/runTerminal";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createLatestAction } from "@/core/greenfield/runLog";
import { partitionSummaryErrors } from "@/core/studioRun/summaryErrors";

const STARTED_AT = Date.parse("2026-06-09T05:55:34.801Z");
const ENDED_AT = Date.parse("2026-06-09T05:56:16.924Z");

function failedUiAuditRun() {
  return {
    ...emptyGreenfieldRun(),
    actionType: "greenfield" as const,
    runStartedAt: STARTED_AT,
    endedAt: ENDED_AT,
    durationMs: ENDED_AT - STARTED_AT,
    runResult: "failed" as const,
    latestAction: createLatestAction("failed", "UI audit failed", {
      stage: "ui_audit",
      detail: "Board container not detected.",
    }),
    runTimeline: {
      runId: "run-ui-fail",
      route: "edit_follow_up",
      startedAt: STARTED_AT,
      stages: [
        {
          stage: "run_complete" as const,
          at: ENDED_AT,
          elapsedMs: ENDED_AT - STARTED_AT,
          stageDurationMs: 1000,
          detail: "UI audit failed",
        },
      ],
      lastStage: "run_complete" as const,
      lastSuccessfulStage: "preview_complete" as const,
      status: "failed" as const,
      completedAt: ENDED_AT,
      totalDurationMs: ENDED_AT - STARTED_AT,
      failureDetail: "UI audit failed",
    },
    entries: [
      {
        id: "1",
        timestamp: new Date(STARTED_AT + 5000).toISOString(),
        stage: "typescript" as const,
        status: "failed" as const,
        message: "TypeScript check failed",
      },
      {
        id: "2",
        timestamp: new Date(STARTED_AT + 15000).toISOString(),
        stage: "typescript" as const,
        status: "success" as const,
        message: "TypeScript check passed",
      },
      {
        id: "3",
        timestamp: new Date(STARTED_AT + 20000).toISOString(),
        stage: "typescript" as const,
        status: "running" as const,
        message: "TypeScript check running",
      },
      {
        id: "4",
        timestamp: new Date(ENDED_AT).toISOString(),
        stage: "ui_audit" as const,
        status: "failed" as const,
        message: "UI audit failed",
      },
    ],
    uiAuditResult: {
      ok: false,
      skipped: false,
      type: "grid_layout" as const,
      score: 0,
      issues: ["no_board" as const],
      details: "Board container not detected.",
      classification: {
        type: "grid_layout" as const,
        confidence: 0.9,
        signals: [],
      },
    },
    workflow: {
      prompt: "Add achievements",
      typecheckResult: "passed",
      buildResult: "passed",
      errors: [],
    },
  };
}

describe("runTerminal", () => {
  it("detects failed UI audit runs as terminal", () => {
    const run = failedUiAuditRun();
    assert.equal(isRunTerminal(run), true);
    const terminal = resolveRunTerminalState(run);
    assert.equal(terminal.outcome, "failed");
    assert.equal(terminal.durationMs, ENDED_AT - STARTED_AT);
  });

  it("freezes duration after endedAt", () => {
    const run = failedUiAuditRun();
    const frozen = getRunDurationMs(run, ENDED_AT + 60 * 60 * 1000);
    assert.equal(frozen, ENDED_AT - STARTED_AT);
  });

  it("detects success and cancelled terminal runs", () => {
    const success = {
      ...emptyGreenfieldRun(),
      runResult: "success" as const,
      endedAt: ENDED_AT,
      durationMs: 1000,
    };
    assert.equal(resolveRunTerminalState(success).outcome, "success");

    const cancelled = {
      ...emptyGreenfieldRun(),
      latestAction: createLatestAction("failed", "Run cancelled by user"),
      runResult: "idle" as const,
      endedAt: ENDED_AT,
    };
    assert.equal(resolveRunTerminalState(cancelled).outcome, "cancelled");
  });
});

describe("deriveAgentRunStatus terminal runs", () => {
  it("marks failed terminal runs inactive with frozen elapsed time", () => {
    const run = failedUiAuditRun();
    const status = deriveAgentRunStatus({
      greenfieldRun: run,
      greenfieldPanelActive: false,
      agentIntent: null,
      buildPhase: "idle",
      planApplyPhase: null,
      planApplySession: null,
      autoFixPhase: null,
      buildRunning: false,
      pipelineRunning: false,
      recentLogs: run.entries,
      runStartedAt: run.runStartedAt,
      provider: null,
      model: null,
      buildError: null,
      planApplyError: null,
      pipelineError: null,
      now: ENDED_AT + 3_849_000_000,
    });

    assert.equal(status.isActive, false);
    assert.equal(status.phase, "failed");
    assert.equal(status.elapsedMs, ENDED_AT - STARTED_AT);
  });
});

describe("deriveAgentRunCard terminal duration", () => {
  it("does not keep increasing elapsed after endedAt", () => {
    const run = failedUiAuditRun();
    const later = ENDED_AT + 641 * 60 * 1000;
    const status = deriveAgentRunStatus({
      greenfieldRun: run,
      greenfieldPanelActive: false,
      agentIntent: null,
      buildPhase: "idle",
      planApplyPhase: null,
      planApplySession: null,
      autoFixPhase: null,
      buildRunning: false,
      pipelineRunning: false,
      recentLogs: run.entries,
      runStartedAt: run.runStartedAt,
      provider: null,
      model: null,
      buildError: null,
      planApplyError: null,
      pipelineError: null,
      now: later,
    });

    const card = deriveAgentRunCard({
      runStatus: status,
      greenfieldRun: run,
      planApplySession: null,
      prompt: "Add achievements",
      now: later,
    });

    assert.equal(card.overallStatus, "failed");
    assert.equal(card.durationMs, ENDED_AT - STARTED_AT);
    assert.match(card.durationLabel, /42s/);
  });
});

describe("deriveExecutionDashboard terminal duration", () => {
  it("uses the same finalized duration as AgentRunCard", () => {
    const run = failedUiAuditRun();
    const status = deriveAgentRunStatus({
      greenfieldRun: run,
      greenfieldPanelActive: false,
      agentIntent: null,
      buildPhase: "idle",
      planApplyPhase: null,
      planApplySession: null,
      autoFixPhase: null,
      buildRunning: false,
      pipelineRunning: false,
      recentLogs: run.entries,
      runStartedAt: run.runStartedAt,
      provider: null,
      model: null,
      buildError: null,
      planApplyError: null,
      pipelineError: null,
      now: ENDED_AT + 999_999,
    });
    const card = deriveAgentRunCard({
      runStatus: status,
      greenfieldRun: run,
      planApplySession: null,
      now: ENDED_AT + 999_999,
    });
    const dashboard = deriveExecutionDashboard({
      card,
      timeline: run.runTimeline,
      prompt: "Add achievements",
    });
    assert.equal(dashboard.elapsedLabel, card.durationLabel);
  });
});

describe("partitionSummaryErrors repaired typescript", () => {
  it("moves repaired TypeScript failures out of final errors", () => {
    const partitioned = partitionSummaryErrors({
      latestAction: createLatestAction("failed", "UI audit failed", {
        stage: "ui_audit",
      }),
      runResult: "failed",
      rawErrors: [
        "[typescript] TypeScript check failed",
        "[ui_audit] UI audit failed",
        "[ui_repair] UI repair failed",
      ],
      typescriptPassed: true,
      buildPassed: true,
    });

    assert.deepEqual(partitioned.errors, ["[ui_audit] UI audit failed"]);
    assert.ok(
      partitioned.previousAttemptErrors.some((line) =>
        /\[typescript\] TypeScript check failed/.test(line),
      ),
    );
  });
});
