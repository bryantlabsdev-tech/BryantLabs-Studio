import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { searchAgentRuns } from "@/core/agent/searchAgentRuns";

function artifact(runNumber: number, prompt: string, files: string[] = []): AgentRunArtifact {
  return {
    runId: `run-${runNumber}`,
    runNumber,
    prompt,
    userMessageId: `chat-${runNumber}`,
    startedAt: 1000,
    endedAt: 2000,
    durationMs: 1000,
    outcome: "success",
    provider: null,
    model: null,
    filesModified: files,
    fileDiffs: [],
    logEntries: [],
    card: {
      isVisible: true,
      title: "Agent run",
      overallStatus: "complete",
      currentStep: null,
      steps: [],
      progressPercent: 100,
      streamRevision: "1",
      providerLine: null,
      providerIdentityLine: null,
      provider: null,
      model: null,
      aiCallsUsed: 0,
      durationMs: 1000,
      durationLabel: "1s",
      providerEvents: [],
      latestProviderEvent: null,
      fileActivity: [],
      filesPlanned: [],
      filesModified: files,
      filesWritten: files,
      verification: {
        typescript: "passed",
        build: "passed",
        uiAudit: "skipped",
        preview: "ready",
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
      patchImpact: { isVisible: false, files: [], complexity: "Low", risk: "Low", estimatedTime: "1m" },
      failureDiagnosis: null,
      diagnostics: { items: [], isVisible: false },
      successSummary: null,
      thoughtStream: [],
      failureDetails: null,
    },
    dashboard: {
      isVisible: false,
      promptTitle: prompt,
      providerModel: "",
      elapsedLabel: "1s",
      progressPercent: 100,
      progressLabel: "Complete",
      overallStatus: "complete",
      thoughts: [],
      currentTask: null,
      currentStage: null,
      currentStepLabel: null,
      currentFile: null,
      files: [],
      verification: [],
      uiAuditFailure: null,
      uiAuditAdvisory: null,
      completion: {
        isVisible: false,
        filesModified: files,
        buildResult: null,
        verificationResult: null,
        durationLabel: "1s",
        summaryLine: null,
      },
      streamRevision: "1",
    },
    timeline: null,
  };
}

describe("searchAgentRuns", () => {
  const history = [
    artifact(1, "Build Sudoku"),
    artifact(8, "Add dark mode", ["src/App.tsx"]),
  ];

  it("finds runs by prompt", () => {
    const matches = searchAgentRuns(history, "dark mode");
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.run.runNumber, 8);
  });

  it("finds runs by file path", () => {
    const matches = searchAgentRuns(history, "App.tsx");
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.run.runNumber, 8);
  });

  it("filters runs by outcome prefix and label", () => {
    const cancelled = {
      ...artifact(2, "Add auth"),
      outcome: "cancelled" as const,
    };
    const historyWithCancelled = [artifact(1, "Build Sudoku"), cancelled];
    const prefixMatches = searchAgentRuns(historyWithCancelled, "outcome:cancelled");
    assert.equal(prefixMatches.length, 1);
    assert.equal(prefixMatches[0]?.run.outcome, "cancelled");

    const filterMatches = searchAgentRuns(historyWithCancelled, "", "cancelled");
    assert.equal(filterMatches.length, 1);
    assert.equal(filterMatches[0]?.matchedOn, "outcome");
  });
});
