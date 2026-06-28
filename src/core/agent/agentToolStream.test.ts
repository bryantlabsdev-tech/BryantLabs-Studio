import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import { pickWaitObservation } from "@/core/agent/agentExecutionCopy";
import {
  buildAgentToolStream,
  mergeAgentToolEvents,
} from "@/core/agent/agentToolStream";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

function minimalCard(overrides: Partial<AgentRunCardViewModel> = {}): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Test run",
    overallStatus: "running",
    currentStep: { id: "planning", label: "Planning changes", status: "running" },
    steps: [],
    progressPercent: 25,
    streamRevision: "1",
    providerLine: null,
    providerIdentityLine: "Claude Opus 4.6",
    provider: "Claude",
    model: "opus-4.6",
    aiCallsUsed: 0,
    durationMs: 1000,
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

describe("buildAgentToolStream", () => {
  it("builds a tool stream with intro, edits, and verification tools", () => {
    const entries = [
      createRunLogEntry("pipeline", "success", "Understanding project audit complete"),
      createRunLogEntry("ai_plan", "success", "Plan ready"),
      createRunLogEntry("provider_call", "success", "Provider responded"),
      createRunLogEntry("apply_plan", "success", "Generating patches"),
      createRunLogEntry("write", "success", "Applying patches to src/App.tsx"),
      createRunLogEntry("write", "success", "Applying patches to src/index.css"),
      createRunLogEntry("typescript", "success", "TypeScript check passed"),
      createRunLogEntry("build", "success", "Build finished"),
      createRunLogEntry("preview", "success", "Preview ready"),
    ];

    const tools = buildAgentToolStream({
      entries,
      card: minimalCard({
        overallStatus: "complete",
        filesModified: ["src/App.tsx", "src/index.css"],
      }),
      run: emptyGreenfieldRun(),
    });

    assert.ok(tools.some((tool) => tool.kind === "say"));
    assert.ok(tools.some((tool) => tool.id === "edit:summary"));
    assert.ok(tools.some((tool) => tool.kind === "run" && tool.label.includes("TypeScript")));
    assert.equal(tools.filter((tool) => tool.kind === "failure").length, 0);
  });

  it("adds a single wait tool while provider is running", () => {
    const startedAt = Date.now() - 20_000;
    const entries = [
      {
        ...createRunLogEntry("provider_call", "running", "Waiting for provider"),
        timestamp: new Date(startedAt).toISOString(),
      },
    ];

    const tools = buildAgentToolStream({
      entries,
      card: minimalCard({ overallStatus: "running" }),
      run: emptyGreenfieldRun(),
      nowMs: Date.now(),
    });

    const wait = tools.find((tool) => tool.kind === "wait");
    assert.ok(wait);
    assert.ok(wait!.label.length > 0);
  });

  it("merges tool events without replacing stable references", () => {
    const first = buildAgentToolStream({
      entries: [createRunLogEntry("ai_plan", "running", "Planning")],
      card: minimalCard(),
      run: emptyGreenfieldRun(),
    });
    const second = buildAgentToolStream({
      entries: [createRunLogEntry("ai_plan", "success", "Plan ready")],
      card: minimalCard({ overallStatus: "running" }),
      run: emptyGreenfieldRun(),
    });

    const merged = mergeAgentToolEvents(first, second);
    const intro = merged.find((tool) => tool.id === "say:intro");
    assert.strictEqual(intro, first.find((tool) => tool.id === "say:intro"));
    assert.equal(merged.find((tool) => tool.id === "plan:main")?.status, "success");
  });
});

describe("pickWaitObservation", () => {
  it("escalates observations over time", () => {
    assert.notEqual(pickWaitObservation(5_000), pickWaitObservation(25_000));
    assert.notEqual(pickWaitObservation(25_000), pickWaitObservation(95_000));
  });
});
