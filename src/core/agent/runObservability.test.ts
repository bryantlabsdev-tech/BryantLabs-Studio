import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeAgentSuccessMetrics } from "@/core/agent/agentSuccessMetrics";
import {
  buildRunCompareViewModel,
  toggleCompareRunSelection,
} from "@/core/agent/runCompare";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { estimateRunCostFromArtifact, formatCostDisplay } from "@/core/analytics/runCostEstimate";
import { estimateTokenCostUsd } from "@/core/analytics/providerPricing";

function sampleArtifact(
  patch: Partial<AgentRunArtifact> & { readonly runId: string; readonly runNumber: number },
): AgentRunArtifact {
  const defaults: AgentRunArtifact = {
    runId: patch.runId,
    runNumber: patch.runNumber,
    prompt: "Fix UI",
    userMessageId: null,
    startedAt: Date.now() - 5000,
    endedAt: Date.now(),
    durationMs: 1200,
    outcome: "success",
    provider: "gemini",
    model: "gemini-2.5-flash",
    filesModified: ["src/index.css"],
    fileDiffs: [],
    logEntries: [
      createRunLogEntry("ai_plan", "success", "AI Plan completed"),
      createRunLogEntry("apply_plan", "success", "Apply Plan completed"),
      createRunLogEntry(
        "apply_plan",
        "success",
        "Using deterministic patch proposal (provider unavailable)",
      ),
      createRunLogEntry("typescript", "success", "TypeScript passed"),
      createRunLogEntry("build", "success", "Build passed"),
      createRunLogEntry("preview", "success", "Preview passed"),
      createRunLogEntry("ui_audit", "success", "UI audit passed"),
      createRunLogEntry("verification", "success", "Verification passed"),
    ],
    card: {
      filesModified: ["src/index.css"],
      patchImpact: { files: [], totalAdded: 0, totalRemoved: 0 },
      steps: [],
      thoughtStream: [],
      title: "Follow-up",
      summary: "Done",
      durationMs: 1200,
      provider: "gemini",
      model: "gemini-2.5-flash",
      verification: {},
      failureDiagnosis: null,
      successSummary: null,
      isVisible: true,
    } as never,
    dashboard: {} as never,
    timeline: {
      route: "edit_follow_up",
      runId: patch.runId,
      startedAt: Date.now(),
      stages: [],
      lastStage: null,
      lastSuccessfulStage: null,
      status: "complete",
      completedAt: Date.now(),
      totalDurationMs: 1200,
      failureDetail: null,
    },
  };
  return { ...defaults, ...patch };
}

describe("run comparison selection", () => {
  it("selects up to two runs and replaces the oldest when a third is chosen", () => {
    assert.deepEqual(toggleCompareRunSelection([], "a"), ["a"]);
    assert.deepEqual(toggleCompareRunSelection(["a"], "b"), ["a", "b"]);
    assert.deepEqual(toggleCompareRunSelection(["a", "b"], "c"), ["b", "c"]);
    assert.deepEqual(toggleCompareRunSelection(["a", "b"], "a"), ["b"]);
  });
});

describe("run comparison view model", () => {
  it("builds side-by-side comparison data for two artifacts", () => {
    const left = sampleArtifact({ runId: "run-1", runNumber: 3, outcome: "failed" });
    const right = sampleArtifact({
      runId: "run-2",
      runNumber: 4,
      outcome: "success",
      filesModified: ["src/index.css", "src/App.tsx"],
    });
    const model = buildRunCompareViewModel(left, right);
    assert.equal(model.left.runNumber, 3);
    assert.equal(model.right.runNumber, 4);
    assert.equal(model.left.plannerStatus, "success");
    assert.equal(model.right.fallbackUsed, true);
    assert.ok(model.fileDiffSummary.length >= 1);
    assert.equal(model.moreSuccessfulRunId, "run-2");
    assert.match(model.moreSuccessfulLabel, /Run #4/);
  });
});

describe("agent success metrics", () => {
  it("computes success and fallback save counts", () => {
    const metrics = computeAgentSuccessMetrics([
      sampleArtifact({ runId: "run-1", runNumber: 1, outcome: "success" }),
      sampleArtifact({
        runId: "run-2",
        runNumber: 2,
        outcome: "failed",
        logEntries: [
          createRunLogEntry("ai_plan", "success", "AI Plan completed"),
          createRunLogEntry("apply_plan", "failed", "Apply Plan failed"),
        ],
      }),
    ]);
    assert.equal(metrics.totalRuns, 2);
    assert.equal(metrics.successRate, 50);
    assert.equal(metrics.failureRate, 50);
    assert.equal(metrics.fallbackSaves, 1);
    assert.ok(metrics.plannerSuccessRate === 100);
    assert.ok(metrics.applySuccessRate === 50);
    assert.equal(metrics.filesModifiedTotal, 2);
  });
});

describe("run cost estimates", () => {
  it("returns null when token data is missing", () => {
    const artifact = sampleArtifact({ runId: "run-1", runNumber: 1 });
    assert.equal(estimateRunCostFromArtifact(artifact), null);
    assert.equal(formatCostDisplay(null), "—");
  });

  it("estimates cost when generation metrics exist", () => {
    const artifact = sampleArtifact({
      runId: "run-1",
      runNumber: 1,
      generationMetrics: {
        promptCharCount: 1000,
        promptByteCount: 1000,
        userPromptCharCount: 500,
        responseCharCount: 500,
        responseByteCount: 500,
        maxOutputTokens: 4096,
        singleRequestAllFiles: true,
        providerWaitMs: 100,
        parseMs: 10,
        totalMs: 1200,
        estimatedPromptTokens: 700,
        estimatedResponseTokens: 300,
      },
    });
    const estimate = estimateRunCostFromArtifact(artifact);
    assert.ok(estimate);
    assert.equal(estimate?.estimatedInputTokens, 700);
    assert.equal(estimate?.estimatedOutputTokens, 300);
    assert.ok((estimate?.estimatedCostUsd ?? 0) > 0);

    const direct = estimateTokenCostUsd({
      provider: "gemini",
      model: "gemini-2.5-flash",
      inputTokens: 700,
      outputTokens: 300,
    });
    assert.ok((direct ?? 0) > 0);
  });
});
