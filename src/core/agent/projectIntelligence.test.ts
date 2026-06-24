import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { computeRunHealth } from "@/core/agent/runHealth";
import {
  buildTimelineVisualization,
  maxTimelineDuration,
} from "@/core/agent/timelineVisualization";
import { buildRunCompareViewModel } from "@/core/agent/runCompare";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import { generateAgentLearnings } from "@/core/projectIntelligence/learnings";
import {
  loadProjectIntelligence,
  normalizeProjectIntelligence,
  saveProjectIntelligence,
} from "@/core/projectIntelligence/store";
import { updateProjectIntelligenceFromRun } from "@/core/projectIntelligence/updateFromRun";
import { mockProjectScan } from "@/core/repository/testScan";

function sampleArtifact(
  patch: Partial<AgentRunArtifact> & { readonly runId: string; readonly runNumber: number },
): AgentRunArtifact {
  const runId = patch.runId;
  const defaults: AgentRunArtifact = {
    runId,
    runNumber: patch.runNumber,
    prompt: "Fix table overflow",
    userMessageId: null,
    startedAt: Date.now() - 42_000,
    endedAt: Date.now(),
    durationMs: 42_000,
    outcome: "success",
    provider: "gemini",
    model: "gemini-2.5-pro",
    filesModified: ["src/components/ComparisonTable.tsx"],
    fileDiffs: [],
    logEntries: [
      createRunLogEntry("ai_plan", "success", "AI Plan completed"),
      createRunLogEntry("apply_plan", "success", "Apply Plan completed"),
      createRunLogEntry("typescript", "success", "TypeScript passed"),
      createRunLogEntry("build", "success", "Build passed"),
      createRunLogEntry("preview", "success", "Preview passed"),
      createRunLogEntry("ui_audit", "success", "UI audit passed"),
    ],
    card: {
      filesModified: ["src/components/ComparisonTable.tsx"],
      patchImpact: { files: [], totalAdded: 0, totalRemoved: 0 },
      steps: [],
      thoughtStream: [],
      title: "Follow-up",
      summary: "Done",
      durationMs: 42_000,
      provider: "gemini",
      model: "gemini-2.5-pro",
      verification: {},
      failureDiagnosis: null,
      successSummary: null,
      isVisible: true,
    } as never,
    dashboard: {} as never,
    timeline: sampleTimeline(runId),
  };
  return { ...defaults, ...patch };
}

function sampleTimeline(runId: string): RunTimelineSnapshot {
  const startedAt = Date.now() - 42_000;
  return {
    runId,
    route: "edit_follow_up",
    startedAt,
    status: "complete",
    lastStage: "run_complete",
    lastSuccessfulStage: "run_complete",
    completedAt: Date.now(),
    totalDurationMs: 42_000,
    failureDetail: null,
    stages: [
      { stage: "plan_start", at: startedAt, elapsedMs: 0, stageDurationMs: 0, detail: null },
      { stage: "plan_complete", at: startedAt + 12_000, elapsedMs: 12_000, stageDurationMs: 12_000, detail: null },
      { stage: "coder_start", at: startedAt + 12_000, elapsedMs: 12_000, stageDurationMs: 0, detail: null },
      { stage: "coder_complete", at: startedAt + 31_000, elapsedMs: 31_000, stageDurationMs: 19_000, detail: null },
      { stage: "apply_complete", at: startedAt + 33_000, elapsedMs: 33_000, stageDurationMs: 2_000, detail: null },
      { stage: "typescript_complete", at: startedAt + 34_000, elapsedMs: 34_000, stageDurationMs: 1_000, detail: null },
      { stage: "build_complete", at: startedAt + 36_000, elapsedMs: 36_000, stageDurationMs: 2_000, detail: null },
      { stage: "preview_complete", at: startedAt + 37_000, elapsedMs: 37_000, stageDurationMs: 1_000, detail: null },
      { stage: "audit_complete", at: startedAt + 41_000, elapsedMs: 41_000, stageDurationMs: 4_000, detail: null },
      { stage: "run_complete", at: startedAt + 42_000, elapsedMs: 42_000, stageDurationMs: 1_000, detail: null },
    ],
  };
}

describe("project intelligence store", () => {
  const scope = "/tmp/test-project-intelligence";
  const store = new Map<string, string>();
  const original = globalThis.localStorage;

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original,
    });
  });

  it("creates empty intelligence for a new project scope", () => {
    const intel = loadProjectIntelligence(scope);
    assert.equal(intel.projectId, scope);
    assert.deepEqual(intel.recurringAuditIssues, []);
    assert.deepEqual(intel.successfulFixes, []);
  });

  it("persists updates per project", () => {
    const initial = normalizeProjectIntelligence(null, scope, "Demo");
    saveProjectIntelligence(scope, {
      ...initial,
      framework: "React (Vite)",
      language: "TypeScript",
      updatedAt: Date.now(),
    });
    const loaded = loadProjectIntelligence(scope);
    assert.equal(loaded.framework, "React (Vite)");
    assert.equal(loaded.language, "TypeScript");
  });
});

describe("project intelligence updates from runs", () => {
  const scope = "/tmp/test-project-intelligence-update";
  const scan = mockProjectScan(
    ["package.json", "src/App.tsx", "src/components/Table.tsx"],
    { packageJson: true },
  );
  const store = new Map<string, string>();
  const original = globalThis.localStorage;

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original,
    });
  });

  it("records stack, patterns, and learnings after a successful run", () => {
    const artifact = sampleArtifact({ runId: "run-a", runNumber: 1 });
    const next = updateProjectIntelligenceFromRun({
      projectPath: scope,
      projectName: "Demo App",
      scan,
      artifact,
    });
    assert.match(next.framework, /React/i);
    assert.ok(next.recurringUiPatterns.length > 0);
    assert.ok(next.recentLearnings.length > 0);
    assert.equal(loadProjectIntelligence(scope).framework, next.framework);
  });
});

describe("run health score", () => {
  it("scores a perfect run at 100", () => {
    const artifact = sampleArtifact({ runId: "run-perfect", runNumber: 1 });
    const health = computeRunHealth({ artifact });
    assert.equal(health.score, 100);
    assert.equal(health.tone, "green");
  });

  it("deducts for advisory, fallback, and retries", () => {
    const artifact = sampleArtifact({
      runId: "run-partial",
      runNumber: 2,
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
        createRunLogEntry("ui_audit", "success", "UI audit advisory"),
        createRunLogEntry("provider_call", "success", "Provider retry succeeded"),
        createRunLogEntry("provider_call", "success", "Provider retry succeeded"),
      ],
    });
    const health = computeRunHealth({ artifact });
    assert.equal(health.score, 88);
    assert.equal(health.tone, "yellow");
  });

  it("caps failed runs at 50", () => {
    const artifact = sampleArtifact({
      runId: "run-failed",
      runNumber: 3,
      outcome: "failed",
      logEntries: [
        createRunLogEntry("ai_plan", "success", "AI Plan completed"),
        createRunLogEntry("apply_plan", "failed", "Apply Plan failed"),
      ],
    });
    const health = computeRunHealth({ artifact });
    assert.ok(health.score <= 50);
    assert.equal(health.tone, "red");
  });
});

describe("timeline visualization", () => {
  it("aggregates stage durations into labeled bars", () => {
    const timeline = sampleTimeline("timeline-run");
    const items = buildTimelineVisualization(timeline);
    const planning = items.find((item) => item.label === "Planning");
    const provider = items.find((item) => item.label === "Provider");
    assert.ok(planning);
    assert.ok(provider);
    assert.equal(planning?.durationMs, 12_000);
    assert.equal(provider?.durationMs, 19_000);
    assert.equal(maxTimelineDuration(items), 19_000);
  });
});

describe("agent learnings", () => {
  it("generates fallback and responsive table learnings", () => {
    const artifact = sampleArtifact({
      runId: "run-learning",
      runNumber: 4,
      logEntries: [
        createRunLogEntry("ai_plan", "success", "AI Plan completed"),
        createRunLogEntry("apply_plan", "success", "Apply Plan completed"),
        createRunLogEntry(
          "apply_plan",
          "success",
          "Using deterministic patch proposal (provider unavailable)",
        ),
        createRunLogEntry("provider_call", "success", "Provider retry succeeded"),
        createRunLogEntry("provider_call", "success", "Provider retry succeeded"),
      ],
    });
    const learnings = generateAgentLearnings(artifact);
    assert.ok(learnings.some((item) => item.text.includes("Fallback patch")));
    assert.ok(learnings.some((item) => item.text.includes("Responsive tables")));
    assert.ok(learnings.some((item) => item.text.includes("retries")));
  });
});

describe("run comparison health", () => {
  it("compares health scores and computes improvement delta", () => {
    const left = sampleArtifact({
      runId: "run-left",
      runNumber: 7,
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
        createRunLogEntry("ui_audit", "success", "UI audit advisory"),
      ],
    });
    const right = sampleArtifact({ runId: "run-right", runNumber: 12 });
    const model = buildRunCompareViewModel(left, right);
    assert.equal(model.left.health.score, 92);
    assert.equal(model.right.health.score, 100);
    assert.equal(model.healthDelta, 8);
    assert.match(model.healthImprovementLabel, /\+8/);
  });
});
