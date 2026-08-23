import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldFreezeAgentRunArtifact } from "@/core/agent/agentRunArtifactFreeze";
import type { DeriveAgentRunStateInput } from "@/core/agent/deriveAgentRunState";
import { buildDiagnosticReport } from "@/core/diagnostics/diagnosticReport";
import {
  buildFollowUpRunFailurePatch,
  recordFollowUpRunFailure,
} from "@/app/orchestration/followUpRunFailure";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun, completeDanglingRunningLogEntries, finalizeDanglingRunningLogEntries, sealSupersededRunningLogEntries } from "@/core/greenfield/runState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";

function minimalCard(overrides: Partial<AgentRunCardViewModel> = {}): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Agent run",
    overallStatus: "failed",
    currentStep: null,
    steps: [],
    progressPercent: 0,
    streamRevision: "1",
    providerLine: "Gemini",
    providerIdentityLine: "Gemini",
    provider: "Gemini",
    model: "gemini-2.5-pro",
    aiCallsUsed: 0,
    durationMs: 1200,
    durationLabel: "1s",
    providerEvents: [],
    latestProviderEvent: null,
    fileActivity: [],
    filesPlanned: [],
    filesModified: [],
    filesWritten: [],
    verification: {
      typescript: "pending",
      build: "pending",
      preview: "pending",
      uiAudit: "pending",
    },
    summary: "",
    stuckMessage: null,
    showRecoveryActions: false,
    reasoning: { headline: "", plannerReasoning: [], detected: [], planSteps: [], risks: [], isVisible: false },
    confidence: { percent: 0, level: "low", factors: [], showBeforeApply: false },
    patchImpact: { files: [], complexity: "low", risk: "low", estimatedTime: "—", isVisible: false },
    failureDiagnosis: null,
    failureDetails: null,
    diagnostics: { items: [], isVisible: false },
    successSummary: null,
    thoughtStream: [],
    ...overrides,
  } as AgentRunCardViewModel;
}

describe("followUpRunFailure", () => {
  it("finalizes dangling running log entries and records workflow errors", () => {
    const prev = {
      ...emptyGreenfieldRun(),
      runStartedAt: Date.now() - 1000,
      entries: [
        createRunLogEntry("provider_call", "running", "[provider_preflight] started"),
      ],
    };
    const patch = buildFollowUpRunFailurePatch(prev, "Provider not connected");
    assert.equal(patch.runResult, "failed");
    assert.equal(patch.entries?.[0]?.status, "failed");
    assert.deepEqual(patch.workflow?.errors, ["Provider not connected"]);
  });

  it("patches live run state instead of a stale host snapshot", () => {
    const liveEntry = createRunLogEntry("apply_plan", "success", "Proposing patches");
    let live: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runStartedAt: Date.now() - 500,
      entries: [liveEntry],
    };
    const staleHostSnapshot: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runStartedAt: live.runStartedAt,
      entries: [],
    };
    recordFollowUpRunFailure(
      {
        greenfieldRun: staleHostSnapshot,
        updateGreenfieldRun: (patch) => {
          const next = typeof patch === "function" ? patch(live) : patch;
          live = { ...live, ...next };
        },
        appendGreenfieldRunLog: () => undefined,
      },
      "Planner failed",
    );
    assert.equal(live.runResult, "failed");
    assert.equal(live.entries.length, 1);
    assert.equal(live.entries[0]?.message, "Proposing patches");
  });
});

describe("finalizeDanglingRunningLogEntries", () => {
  it("marks running entries failed with the supplied reason", () => {
    const entries = finalizeDanglingRunningLogEntries(
      [createRunLogEntry("provider_call", "running", "Sending request")],
      "Budget exhausted",
    );
    assert.equal(entries[0]?.status, "failed");
    assert.equal(entries[0]?.details, "Budget exhausted");
  });

  it("does not finalize running entries from a prior run", () => {
    const runStartedAt = Date.now();
    const stale = {
      ...createRunLogEntry("verification", "running", "Verification started"),
      timestamp: new Date(runStartedAt - 5000).toISOString(),
    };
    const current = createRunLogEntry("apply_plan", "running", "Proposing patches");
    const entries = finalizeDanglingRunningLogEntries(
      [stale, current],
      "Apply Plan produced zero valid patch proposals.",
      runStartedAt,
    );
    assert.equal(entries[0]?.status, "running");
    assert.equal(entries[1]?.status, "failed");
  });

  it("completes dangling running rows as success", () => {
    const entries = completeDanglingRunningLogEntries(
      [createRunLogEntry("pipeline", "running", "Consultation · ask")],
      "success",
      "Consultation complete",
    );
    assert.equal(entries[0]?.status, "success");
    assert.equal(entries[0]?.details, "Consultation complete");
  });
});

describe("sealSupersededRunningLogEntries", () => {
  it("closes stale running rows before a new run starts", () => {
    const newRunStartedAt = Date.now();
    const stale = {
      ...createRunLogEntry("verification", "running", "Verification started"),
      timestamp: new Date(newRunStartedAt - 1000).toISOString(),
    };
    const sealed = sealSupersededRunningLogEntries([stale], newRunStartedAt);
    assert.equal(sealed[0]?.status, "success");
    assert.match(sealed[0]?.details ?? "", /superseded by new run/i);
  });
});

describe("shouldFreezeAgentRunArtifact", () => {
  it("does not freeze while runResult is still running", () => {
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      runTimeline: {
        runId: "run-1",
        route: "edit_follow_up" as const,
        startedAt: Date.now() - 1000,
        stages: [],
        lastStage: "provider_call" as const,
        lastSuccessfulStage: null,
        status: "failed" as const,
        completedAt: Date.now(),
        totalDurationMs: 1000,
        failureDetail: "Provider blocked",
      },
    };
    const input: DeriveAgentRunStateInput = {
      greenfieldRun: run as unknown as GreenfieldRunSnapshot,
      greenfieldPanelActive: false,
      agentIntent: "follow_up",
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
      plan: null,
      aiPlan: null,
      scan: null,
    };
    assert.equal(shouldFreezeAgentRunArtifact(input), false);
  });
});

describe("buildDiagnosticReport external errors", () => {
  it("uses buildError when greenfield run has no failure detail", () => {
    const bundle = buildDiagnosticReport({
      runId: "run-err",
      prompt: "Add stats panel",
      outcome: "failed",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        entries: [],
      },
      card: minimalCard(),
      buildError: "Provider not connected — add a Gemini API key in Settings.",
    });
    assert.match(bundle.snapshot.errorMessage ?? "", /Provider not connected/);
  });
});
