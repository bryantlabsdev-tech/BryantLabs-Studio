import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";

function artifact(prompt: string): AgentRunArtifact {
  return {
    runId: "run-1",
    runNumber: 3,
    prompt,
    userMessageId: "chat-1",
    startedAt: 1000,
    endedAt: 5000,
    durationMs: 4000,
    outcome: "success",
    provider: "Anthropic",
    model: "claude",
    filesModified: ["src/App.tsx"],
    fileDiffs: [],
    logEntries: [],
    card: {
      isVisible: true,
      title: "Agent run",
      overallStatus: "complete",
      currentStep: null,
      steps: [
        { id: "planning", label: "Planning", status: "success" },
        { id: "editing", label: "Editing files", status: "success" },
        { id: "building", label: "Build", status: "success" },
      ],
      progressPercent: 100,
      streamRevision: "1",
      providerLine: null,
      providerIdentityLine: null,
      provider: "Anthropic",
      model: "claude",
      aiCallsUsed: 1,
      durationMs: 4000,
      durationLabel: "4s",
      providerEvents: [],
      latestProviderEvent: null,
      fileActivity: [{ path: "src/App.tsx", status: "written" }],
      filesPlanned: [],
      filesModified: ["src/App.tsx"],
      filesWritten: ["src/App.tsx"],
      verification: {
        typescript: "passed",
        build: "passed",
        uiAudit: "skipped",
        preview: "ready",
      },
      summary: "Build passed",
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
      isVisible: true,
      promptTitle: prompt,
      providerModel: "Anthropic · claude",
      elapsedLabel: "4s",
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
        isVisible: true,
        filesModified: ["src/App.tsx"],
        buildResult: "Build passed",
        verificationResult: "Build passed",
        durationLabel: "4s",
        summaryLine: "Build passed",
      },
      streamRevision: "1",
    },
    timeline: null,
  };
}

describe("greenfieldSnapshotFromArtifact", () => {
  it("replays prompt and synthetic log entries for historical summary", () => {
    const snapshot = greenfieldSnapshotFromArtifact(artifact("Add dark mode"));
    assert.equal(snapshot.workflow?.prompt, "Add dark mode");
    assert.equal(snapshot.runResult, "success");
    assert.ok(snapshot.entries.length >= 3);
    assert.deepEqual(snapshot.filesWritten, ["src/App.tsx"]);
  });
});
