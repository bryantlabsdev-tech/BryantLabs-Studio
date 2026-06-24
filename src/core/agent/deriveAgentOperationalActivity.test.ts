import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveAgentOperationalActivity,
  deriveFollowUpComposerState,
  derivePlanPreviewPhase,
} from "@/core/agent/deriveAgentOperationalActivity";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

function minimalCard(overrides: Partial<AgentRunCardViewModel> = {}): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Test run",
    overallStatus: "running",
    currentStep: { id: "planning", label: "Planning changes", status: "running" },
    steps: [
      { id: "understanding", label: "Understanding project", status: "success" },
      { id: "planning", label: "Planning changes", status: "running" },
      { id: "editing", label: "Editing files", status: "pending" },
      { id: "applying", label: "Applying patch", status: "pending" },
      { id: "typescript", label: "Checking TypeScript", status: "pending" },
      { id: "building", label: "Building app", status: "pending" },
      { id: "ui_audit", label: "Running UI audit", status: "pending" },
      { id: "preview", label: "Starting preview", status: "pending" },
      { id: "complete", label: "Complete", status: "pending" },
    ],
    progressPercent: 25,
    streamRevision: "1",
    providerLine: "Using anthropic",
    providerIdentityLine: "Using Anthropic · claude",
    provider: "Anthropic",
    model: "claude",
    aiCallsUsed: 1,
    durationMs: 1000,
    durationLabel: "1s",
    providerEvents: [],
    latestProviderEvent: null,
    fileActivity: [],
    filesPlanned: ["src/App.tsx"],
    filesModified: [],
    filesWritten: [],
    verification: {
      typescript: "pending",
      build: "pending",
      uiAudit: "pending",
      preview: "pending",
    },
    summary: null,
    stuckMessage: null,
    showRecoveryActions: false,
    reasoning: {
      isVisible: false,
      headline: "",
      detected: [],
      planSteps: [],
      plannerReasoning: [],
      risks: [],
    },
    confidence: { percent: 0, level: "low", factors: [], showBeforeApply: false },
    patchImpact: { files: [], complexity: "Low", risk: "Low", estimatedTime: "1m", isVisible: false },
    failureDiagnosis: null,
    failureDetails: null,
    diagnostics: { items: [], isVisible: false },
    successSummary: null,
    thoughtStream: [],
    ...overrides,
  };
}

describe("deriveAgentOperationalActivity", () => {
  it("marks understanding complete and planning active during a live run", () => {
    const steps = deriveAgentOperationalActivity({
      card: minimalCard(),
      buildPhase: "planning",
      planApplySession: null,
      scanStatus: "done",
      timeline: null,
      runStartedAt: Date.now() - 5000,
      nowMs: Date.now(),
    });

    const understanding = steps.find((s) => s.id === "understanding");
    const planning = steps.find((s) => s.id === "building_plan");
    assert.equal(understanding?.status, "complete");
    assert.equal(planning?.status, "active");
    assert.match(planning?.description ?? "", /plan/i);
  });

  it("derives failed terminal step when run failed", () => {
    const steps = deriveAgentOperationalActivity({
      card: minimalCard({
        overallStatus: "failed",
        currentStep: { id: "building", label: "Building app", status: "failed" },
        steps: minimalCard().steps.map((s) =>
          s.id === "building" ? { ...s, status: "failed" as const } : s,
        ),
        failureDetails: {
          reason: "build_failed",
          reasonLabel: "Build failed",
          headline: "Build failed",
          summaryLine: "Build step failed",
          failedStage: "build",
          provider: "Anthropic",
          model: "claude",
          durationMs: 1000,
          durationLabel: "1s",
          rawErrorMessage: "error",
          filesParsed: null,
          filesExpected: null,
          missingFiles: [],
          aiResponsePreview: null,
          lastCommand: null,
          commandStdout: null,
          commandStderr: null,
          whatToTryNext: [],
          isVisible: true,
        },
      }),
      buildPhase: "failed",
      planApplySession: null,
      scanStatus: "done",
      timeline: null,
      runStartedAt: Date.now() - 10000,
    });

    assert.ok(steps.some((s) => s.id === "failed" || s.status === "failed"));
  });
});

describe("derivePlanPreviewPhase", () => {
  it("returns files_selected when plan apply session has files", () => {
    const phase = derivePlanPreviewPhase({
      card: minimalCard(),
      buildPhase: "coding",
      planApplySession: {
        applyRunId: "run-1",
        prompt: "test",
        planSummary: "test",
        planSource: "ai",
        applyTargetCount: 1,
        applySkippedCount: 0,
        files: [
          {
            relPath: "src/App.tsx",
            absPath: "/p/src/App.tsx",
            selectionReason: "Main app component",
            planReason: "UI change",
            status: "proposing",
            decision: "pending",
          },
        ],
        phase: "proposing",
        selectedRelPath: "src/App.tsx",
        applyError: null,
        verification: null,
        totals: { filesChanged: 1, linesAdded: 1, linesRemoved: 0, filesApproved: 0, filesApplied: 0 },
      },
      scanStatus: "done",
      timeline: emptyGreenfieldRun().runTimeline,
      runStartedAt: Date.now(),
    });

    assert.equal(phase, "changes_proposed");
  });

  it("returns ready_for_review when build is in review phase", () => {
    const phase = derivePlanPreviewPhase({
      card: minimalCard({ overallStatus: "running" }),
      buildPhase: "review",
      planApplySession: {
        applyRunId: "run-1",
        prompt: "test",
        planSummary: "test",
        planSource: "ai",
        applyTargetCount: 0,
        applySkippedCount: 0,
        files: [],
        phase: "review",
        selectedRelPath: null,
        applyError: null,
        verification: null,
        totals: null,
      },
      scanStatus: "done",
      timeline: null,
      runStartedAt: Date.now(),
    });

    assert.equal(phase, "ready_for_review");
  });
});

describe("deriveFollowUpComposerState", () => {
  it("offers follow-up suggestions after a successful run", () => {
    const state = deriveFollowUpComposerState({
      lastOutcome: "success",
      runActive: false,
      awaitingReview: false,
      hasProject: true,
    });

    assert.equal(state.mode, "follow_up");
    assert.ok(state.suggestions.length >= 3);
    assert.match(state.placeholder, /follow up/i);
  });

  it("stays idle while a run is active", () => {
    const state = deriveFollowUpComposerState({
      lastOutcome: "success",
      runActive: true,
      awaitingReview: false,
      hasProject: true,
    });

    assert.equal(state.mode, "idle");
    assert.equal(state.headline, null);
  });
});
