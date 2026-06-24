import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDiagnosticReport,
  resolveDiagnosticReportBundle,
} from "@/core/diagnostics/diagnosticReport";
import {
  EMPTY_DIAGNOSTIC_REPORT_SESSION,
  isDiagnosticReportOpenForRun,
  reduceDiagnosticReportSession,
  type DiagnosticReportMetadata,
} from "@/core/diagnostics/diagnosticReportSession";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";

function minimalCard(): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Editing project",
    overallStatus: "complete",
    currentStep: null,
    steps: [],
    progressPercent: 100,
    streamRevision: "1",
    providerLine: "Gemini",
    providerIdentityLine: "Gemini",
    provider: "gemini",
    model: "gemini-2.5-flash",
    aiCallsUsed: 1,
    durationMs: 1200,
    durationLabel: "1s",
    providerEvents: [],
    latestProviderEvent: null,
    fileActivity: [],
    filesPlanned: [],
    filesModified: ["src/App.tsx"],
    filesWritten: [],
    verification: {
      typescript: "pass",
      build: "pass",
      uiAudit: "pass",
      preview: "pass",
    },
    summary: "Done",
    stuckMessage: null,
    showRecoveryActions: false,
    reasoning: {
      headline: "",
      plannerReasoning: [],
      detected: [],
      planSteps: [],
      risks: [],
      isVisible: false,
    },
    confidence: { percent: 80, level: "high", factors: [], showBeforeApply: false },
    patchImpact: {
      files: [],
      complexity: "low",
      risk: "low",
      estimatedTime: "1m",
      isVisible: false,
    },
    failureDiagnosis: null,
    failureDetails: null,
    diagnostics: { items: [], isVisible: false },
    successSummary: null,
    thoughtStream: [],
  } as unknown as AgentRunCardViewModel;
}

const metadata: DiagnosticReportMetadata = {
  runId: "run-live-1",
  previousRunId: "run-prev",
  prompt: "Add dark mode toggle",
  projectPath: "/tmp/calculator",
  route: "build_loop",
  generationMode: "studio_agent",
};

function openBundle(textMarker: string) {
  return buildDiagnosticReport({
    runId: metadata.runId,
    previousRunId: metadata.previousRunId,
    prompt: metadata.prompt,
    outcome: "success",
    route: metadata.route,
    generationMode: metadata.generationMode,
    projectPath: metadata.projectPath,
    greenfieldRun: emptyGreenfieldRun(),
    card: minimalCard(),
    timestamp: textMarker === "open" ? 1_700_000_000_000 : 1_700_000_001_000,
  });
}

describe("diagnosticReportSession", () => {
  it("opens modal with frozen bundle and metadata", () => {
    const bundle = openBundle("open");
    const session = reduceDiagnosticReportSession(EMPTY_DIAGNOSTIC_REPORT_SESSION, {
      type: "open_modal",
      runId: metadata.runId,
      bundle,
      metadata,
    });

    assert.equal(session.modalOpen, true);
    assert.equal(session.runId, metadata.runId);
    assert.equal(session.bundle, bundle);
    assert.equal(session.metadata?.prompt, metadata.prompt);
    assert.equal(isDiagnosticReportOpenForRun(session, metadata.runId), true);
  });

  it("keeps modal open with frozen bundle across simulated polling ticks", () => {
    const bundleAtOpen = openBundle("open");
    let session = reduceDiagnosticReportSession(EMPTY_DIAGNOSTIC_REPORT_SESSION, {
      type: "open_modal",
      runId: metadata.runId,
      bundle: bundleAtOpen,
      metadata,
    });

    const bundleAfterPoll = openBundle("poll");
    assert.notEqual(bundleAfterPoll.snapshot.timestamp, bundleAtOpen.snapshot.timestamp);

    session = reduceDiagnosticReportSession(session, {
      type: "open_modal",
      runId: metadata.runId,
      bundle: bundleAfterPoll,
      metadata,
    });

    assert.equal(session.modalOpen, true);
    assert.equal(session.bundle, bundleAtOpen);
    assert.equal(session.bundle?.snapshot.timestamp, bundleAtOpen.snapshot.timestamp);
    assert.equal(isDiagnosticReportOpenForRun(session, metadata.runId), true);
  });

  it("closes modal only via explicit close action", () => {
    const opened = reduceDiagnosticReportSession(EMPTY_DIAGNOSTIC_REPORT_SESSION, {
      type: "open_modal",
      runId: metadata.runId,
      bundle: openBundle("open"),
      metadata,
    });
    const closed = reduceDiagnosticReportSession(opened, { type: "close_modal" });
    assert.equal(closed.modalOpen, false);
    assert.equal(closed.bundle, null);
    assert.equal(closed.metadata, null);
  });

  it("replaces bundle when opening diagnostics for a different run", () => {
    const firstBundle = openBundle("open");
    let session = reduceDiagnosticReportSession(EMPTY_DIAGNOSTIC_REPORT_SESSION, {
      type: "open_modal",
      runId: "run-a",
      bundle: firstBundle,
      metadata: { ...metadata, runId: "run-a" },
    });

    const secondBundle = openBundle("poll");
    session = reduceDiagnosticReportSession(session, {
      type: "open_modal",
      runId: "run-b",
      bundle: secondBundle,
      metadata: { ...metadata, runId: "run-b" },
    });

    assert.equal(session.runId, "run-b");
    assert.equal(session.bundle, secondBundle);
  });
});

describe("resolveDiagnosticReportBundle", () => {
  it("builds bundle for copy actions without requiring modal host state", () => {
    const bundle = resolveDiagnosticReportBundle({
      runId: "run-copy",
      prompt: "Build calculator",
      greenfieldRun: emptyGreenfieldRun(),
      card: minimalCard(),
    });
    assert.ok(bundle?.text.includes("BRYANTLABS STUDIO DIAGNOSTIC REPORT"));
  });
});
