import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import {
  buildAgentActivityPhaseGroups,
  buildAgentExecutionSteps,
  buildAgentLiveActivityTimeline,
  buildAgentRunFinalSummary,
  deriveProviderThinkingMessage,
  formatAgentRunSummaryText,
  groupForRunLogEntry,
} from "@/core/agent/agentLiveActivityTimeline";
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

describe("groupForRunLogEntry", () => {
  it("maps pipeline audit entries to understanding_project", () => {
    assert.equal(
      groupForRunLogEntry(createRunLogEntry("pipeline", "running", "Understanding project audit")),
      "understanding_project",
    );
  });

  it("maps apply_plan propose messages to generating_patches", () => {
    assert.equal(
      groupForRunLogEntry(createRunLogEntry("apply_plan", "running", "Generating patches")),
      "generating_patches",
    );
  });

  it("maps apply_plan apply messages to applying_patches", () => {
    assert.equal(
      groupForRunLogEntry(createRunLogEntry("apply_plan", "running", "Applying patches to src/App.tsx")),
      "applying_patches",
    );
  });

  it("maps auto_fix to repairing_errors", () => {
    assert.equal(
      groupForRunLogEntry(createRunLogEntry("auto_fix", "running", "Repair attempt 1")),
      "repairing_errors",
    );
  });
});

describe("buildAgentLiveActivityTimeline", () => {
  it("groups related log events into friendly timeline steps", () => {
    const entries = [
      createRunLogEntry("pipeline", "success", "Understanding project audit complete"),
      createRunLogEntry("ai_plan", "success", "Plan ready"),
      createRunLogEntry("provider_call", "success", "Provider responded"),
      createRunLogEntry("apply_plan", "success", "Generating patches"),
      createRunLogEntry("typescript", "success", "TypeScript check passed"),
    ];

    const timeline = buildAgentLiveActivityTimeline({
      entries,
      card: minimalCard(),
      run: emptyGreenfieldRun(),
    });

    assert.deepEqual(
      timeline.map((item) => item.id),
      [
        "understanding_project",
        "planning_changes",
        "calling_provider",
        "generating_patches",
        "running_typescript",
      ],
    );
    assert.equal(timeline[0]?.label, "Understanding project");
    assert.equal(timeline[1]?.label, "Planning changes");
  });

  it("shows provider wait notice after 30 seconds", () => {
    const startedAt = Date.now() - 35_000;
    const entries = [
      {
        ...createRunLogEntry("provider_call", "running", "Waiting on provider…"),
        timestamp: new Date(startedAt).toISOString(),
      },
    ];

    const timeline = buildAgentLiveActivityTimeline({
      entries,
      card: minimalCard(),
      run: emptyGreenfieldRun(),
      nowMs: Date.now(),
    });

    assert.equal(timeline[0]?.summary, "Still working — waiting on provider response…");
  });

  it("shows repair copy when auto_fix starts", () => {
    const entries = [createRunLogEntry("auto_fix", "running", "Attempting repair")];
    const timeline = buildAgentLiveActivityTimeline({
      entries,
      card: minimalCard(),
      run: emptyGreenfieldRun(),
    });

    assert.equal(timeline[0]?.summary, "Build failed, attempting automatic repair…");
  });

  it("appends completed terminal step when card is complete", () => {
    const timeline = buildAgentLiveActivityTimeline({
      entries: [createRunLogEntry("pipeline", "success", "Understanding project audit complete")],
      card: minimalCard({
        overallStatus: "complete",
        successSummary: {
          headline: "Done",
          filesModified: ["src/App.tsx"],
          changes: [],
          verification: [],
          summaryLine: "Updated 1 file",
        },
      }),
      run: { ...emptyGreenfieldRun(), runResult: "success" },
    });

    assert.equal(timeline.at(-1)?.id, "completed");
    assert.equal(timeline.at(-1)?.badge, "success");
  });
});

describe("buildAgentExecutionSteps", () => {
  it("flattens timeline into cursor-style execution steps with file edits", () => {
    const entries = [
      createRunLogEntry("pipeline", "success", "Understanding project audit complete"),
      createRunLogEntry("ai_plan", "success", "Plan ready"),
      createRunLogEntry("provider_call", "success", "Provider responded"),
      createRunLogEntry("apply_plan", "success", "Generating patches"),
      createRunLogEntry("write", "success", "Applying patches to src/App.tsx"),
      createRunLogEntry("typescript", "success", "TypeScript check passed"),
      createRunLogEntry("build", "success", "Build finished"),
    ];

    const steps = buildAgentExecutionSteps({
      entries,
      card: minimalCard({
        overallStatus: "complete",
        fileActivity: [
          { path: "src/App.tsx", status: "written" },
          { path: "src/index.css", status: "written" },
        ],
      }),
      run: emptyGreenfieldRun(),
    });

    assert.equal(steps.some((step) => step.id === "understanding"), true);
    assert.equal(steps.some((step) => step.id === "planning"), true);
    assert.equal(steps.some((step) => step.id === "generating_code"), true);
    assert.equal(steps.some((step) => step.label === "Updated App.tsx"), true);
    assert.equal(steps.some((step) => step.id === "running_typescript"), true);
    assert.equal(steps.at(-1)?.label, "Completed");
  });
});

describe("buildAgentActivityPhaseGroups", () => {
  it("groups flat timeline items into understanding, planning, coding, and verification phases", () => {
    const entries = [
      createRunLogEntry("pipeline", "success", "Understanding project audit complete"),
      createRunLogEntry("ai_plan", "success", "Plan ready"),
      createRunLogEntry("provider_call", "success", "Provider responded"),
      createRunLogEntry("apply_plan", "success", "Generating patches"),
      createRunLogEntry("typescript", "success", "TypeScript check passed"),
      createRunLogEntry("build", "success", "Build finished"),
    ];

    const phases = buildAgentActivityPhaseGroups({
      entries,
      card: minimalCard({ overallStatus: "complete" }),
      run: emptyGreenfieldRun(),
    });

    assert.deepEqual(
      phases.map((phase) => phase.id),
      ["understanding", "planning", "coding", "verification"],
    );
    assert.equal(phases[0]?.items.some((item) => item.id === "understanding_project"), true);
    assert.equal(phases[1]?.items[0]?.label, "Requirements analyzed");
  });
});

describe("deriveProviderThinkingMessage", () => {
  it("rotates thinking copy while provider is running", () => {
    const startedAt = Date.now() - 12_000;
    const entries = [
      {
        ...createRunLogEntry("provider_call", "running", "Waiting on provider…"),
        timestamp: new Date(startedAt).toISOString(),
      },
    ];

    assert.equal(
      deriveProviderThinkingMessage({
        card: minimalCard({ provider: "Claude" }),
        entries,
      }),
      "Reviewing existing code…",
    );
  });
});

describe("formatAgentRunSummaryText", () => {
  it("formats a copy-friendly run summary", () => {
    const text = formatAgentRunSummaryText({
      filesChanged: ["src/App.tsx"],
      commandsRun: ["Build"],
      typescript: "passed",
      build: "passed",
      preview: "passed",
      uiAudit: "skipped",
      durationMs: 102_000,
      durationLabel: "1m 42s",
      errors: [],
      noChangeExplanation: null,
      outcome: "success",
      providerOutput: [],
    });

    assert.match(text, /Completed in 1m 42s/);
    assert.match(text, /src\/App\.tsx/);
    assert.match(text, /TypeScript/);
  });
});

describe("buildAgentRunFinalSummary", () => {
  it("summarizes files, commands, and verification", () => {
    const entries = [
      createRunLogEntry("typescript", "success", "TypeScript check passed"),
      createRunLogEntry("build", "success", "Build finished"),
      createRunLogEntry("preview", "success", "Preview ready"),
    ];

    const summary = buildAgentRunFinalSummary({
      entries,
      card: minimalCard({
        overallStatus: "complete",
        filesModified: ["src/App.tsx"],
        verification: {
          typescript: "passed",
          build: "passed",
          uiAudit: "skipped",
          preview: "ready",
        },
      }),
      run: {
        ...emptyGreenfieldRun(),
        runResult: "success",
        entries,
      },
    });

    assert.deepEqual(summary.filesChanged, ["src/App.tsx"]);
    assert.equal(summary.commandsRun.includes("TypeScript check"), true);
    assert.equal(summary.typescript, "passed");
    assert.equal(summary.build, "passed");
    assert.equal(summary.preview, "passed");
    assert.equal(summary.outcome, "success");
  });

  it("explains when no files changed because feature already exists", () => {
    const summary = buildAgentRunFinalSummary({
      entries: [
        createRunLogEntry("apply_plan", "success", "Feature already present in project"),
      ],
      card: minimalCard({ overallStatus: "complete", filesModified: [] }),
      run: emptyGreenfieldRun(),
    });

    assert.match(summary.noChangeExplanation ?? "", /already present/i);
  });

  it("explains when provider failed without valid patches", () => {
    const summary = buildAgentRunFinalSummary({
      entries: [
        createRunLogEntry("provider_call", "failed", "Provider timeout after 120s"),
      ],
      card: minimalCard({ overallStatus: "failed", filesModified: [] }),
      run: emptyGreenfieldRun(),
    });

    assert.match(summary.noChangeExplanation ?? "", /provider call failed/i);
  });
});
