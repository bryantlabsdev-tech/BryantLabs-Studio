import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveAgentRunCard,
  agentRunProgressPercent,
  AGENT_RUN_PROGRESS_BY_STEP,
  formatAgentRunDuration,
  formatAgentRunProviderLine,
  formatProviderEventMessage,
  formatProviderIdentityLine,
  agentRunStepIcon,
} from "@/core/agent/agentRunCard";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { FollowUpRunStatus } from "@/core/build/followUpRun";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";

function baseRunStatus(overrides: Partial<FollowUpRunStatus> = {}): FollowUpRunStatus {
  return {
    phase: "idle",
    progressPercent: 0,
    currentLabel: "Ready",
    waitingLabel: "Ready",
    nextLabel: null,
    elapsedMs: 0,
    provider: null,
    model: null,
    currentFile: null,
    isActive: false,
    activity: [],
    escalationNote: null,
    ...overrides,
  };
}

function timeline(overrides: Partial<RunTimelineSnapshot> = {}): RunTimelineSnapshot {
  return {
    runId: "run-test",
    route: "edit_follow_up",
    startedAt: Date.now() - 60_000,
    stages: [],
    lastStage: null,
    lastSuccessfulStage: null,
    status: "running",
    completedAt: null,
    totalDurationMs: null,
    failureDetail: null,
    ...overrides,
  };
}

describe("deriveAgentRunCard", () => {
  it("shows visible card when run is active", () => {
    const card = deriveAgentRunCard({
      runStatus: baseRunStatus({
        isActive: true,
        phase: "planning",
        currentLabel: "Planning changes",
        elapsedMs: 12_000,
        provider: "Anthropic",
        model: "Claude Opus 4.6",
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline: timeline(),
        entries: [],
      },
      planApplySession: null,
    });

    assert.equal(card.isVisible, true);
    assert.equal(card.title, "Agent run");
    assert.equal(card.overallStatus, "running");
    assert.equal(card.currentStep?.label, "Planning changes");
  });

  it("updates steps live from runTimeline", () => {
    const runTimeline = timeline({
      stages: [
        {
          stage: "audit_start",
          at: Date.now() - 50_000,
          elapsedMs: 1000,
          stageDurationMs: 1000,
          detail: null,
        },
        {
          stage: "audit_complete",
          at: Date.now() - 48_000,
          elapsedMs: 3000,
          stageDurationMs: 2000,
          detail: null,
        },
        {
          stage: "plan_start",
          at: Date.now() - 10_000,
          elapsedMs: 41_000,
          stageDurationMs: 38_000,
          detail: null,
        },
      ],
      lastStage: "plan_start",
      lastSuccessfulStage: "audit_complete",
    });

    const card = deriveAgentRunCard({
      runStatus: baseRunStatus({
        isActive: true,
        phase: "planning",
        elapsedMs: 41_000,
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline,
        entries: [],
      },
      planApplySession: null,
    });

    const understanding = card.steps.find((s) => s.id === "understanding");
    const planning = card.steps.find((s) => s.id === "planning");
    assert.equal(understanding?.status, "success");
    assert.equal(planning?.status, "running");
    assert.equal(card.currentStep?.id, "planning");
    assert.equal(card.progressPercent, AGENT_RUN_PROGRESS_BY_STEP.planning);
  });

  it("shows step as soon as a timeline event arrives", () => {
    const cardBefore = deriveAgentRunCard({
      runStatus: baseRunStatus({ isActive: true, phase: "idle" }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline: timeline({ stages: [] }),
        entries: [],
      },
      planApplySession: null,
    });
    assert.equal(cardBefore.steps.find((s) => s.id === "understanding")?.status, "pending");

    const cardAfter = deriveAgentRunCard({
      runStatus: baseRunStatus({ isActive: true, phase: "auditing" }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline: timeline({
          stages: [
            {
              stage: "audit_start",
              at: Date.now(),
              elapsedMs: 100,
              stageDurationMs: 100,
              detail: null,
            },
          ],
          lastStage: "audit_start",
        }),
        entries: [],
      },
      planApplySession: null,
    });
    assert.equal(cardAfter.steps.find((s) => s.id === "understanding")?.status, "running");
    assert.equal(cardAfter.progressPercent, 10);
  });

  it("shows success summary after build and preview complete", () => {
    const runTimeline = timeline({
      status: "complete",
      completedAt: Date.now(),
      totalDurationMs: 102_000,
      stages: [
        {
          stage: "apply_complete",
          at: Date.now() - 30_000,
          elapsedMs: 70_000,
          stageDurationMs: 5000,
          detail: "2 file(s)",
        },
        {
          stage: "typescript_complete",
          at: Date.now() - 20_000,
          elapsedMs: 80_000,
          stageDurationMs: 10_000,
          detail: "passed",
        },
        {
          stage: "build_complete",
          at: Date.now() - 10_000,
          elapsedMs: 90_000,
          stageDurationMs: 10_000,
          detail: "passed",
        },
        {
          stage: "preview_complete",
          at: Date.now() - 5000,
          elapsedMs: 95_000,
          stageDurationMs: 5000,
          detail: "ok",
        },
        {
          stage: "run_complete",
          at: Date.now(),
          elapsedMs: 102_000,
          stageDurationMs: 7000,
          detail: "ok",
        },
      ],
      lastStage: "run_complete",
      lastSuccessfulStage: "run_complete",
    });

    const card = deriveAgentRunCard({
      runStatus: baseRunStatus({
        phase: "done",
        isActive: false,
        provider: "Anthropic",
        model: "Claude Opus 4.6",
        elapsedMs: 102_000,
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline,
        filesWritten: ["src/App.tsx", "src/index.css"],
        entries: [
          {
            id: "w1",
            stage: "write",
            status: "success",
            message: "Updated src/App.tsx",
            timestamp: new Date().toISOString(),
          },
          {
            id: "w2",
            stage: "write",
            status: "success",
            message: "Updated src/index.css",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      planApplySession: null,
    });

    assert.equal(card.overallStatus, "complete");
    assert.ok(card.summary);
    assert.match(card.summary!, /Updated 2 files/);
    assert.match(card.summary!, /TypeScript passed/);
    assert.match(card.summary!, /Build passed/);
    assert.match(card.summary!, /Preview passed/);
    assert.deepEqual([...card.filesModified].sort(), ["src/App.tsx", "src/index.css"].sort());
  });

  it("shows failure summary on provider failure", () => {
    const runTimeline = timeline({
      status: "failed",
      completedAt: Date.now(),
      totalDurationMs: 45_000,
      failureDetail: "Gemini returned high demand",
      stages: [
        {
          stage: "plan_start",
          at: Date.now() - 5000,
          elapsedMs: 40_000,
          stageDurationMs: 5000,
          detail: null,
        },
        {
          stage: "run_complete",
          at: Date.now(),
          elapsedMs: 45_000,
          stageDurationMs: 5000,
          detail: "failed",
        },
      ],
      lastStage: "run_complete",
    });

    const card = deriveAgentRunCard({
      runStatus: baseRunStatus({
        phase: "failed",
        isActive: false,
        provider: "Gemini",
        model: "gemini-2.0-flash",
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        provider: "gemini",
        runTimeline,
        entries: [
          {
            id: "retry",
            stage: "provider_call",
            status: "running",
            message: "[provider_retry] provider=gemini reason=429 high demand",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      planApplySession: null,
    });

    assert.equal(card.overallStatus, "failed");
    assert.ok(card.summary);
    assert.match(card.summary!, /Provider error|high demand/i);
    assert.match(card.summary!, /No files were changed/);
    assert.ok(card.providerEvents.some((e) => /busy|Retrying/i.test(e)));
  });

  it("maps cancelled terminal runs to cancelled overall status", () => {
    const card = deriveAgentRunCard({
      runStatus: baseRunStatus({
        phase: "failed",
        isActive: false,
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        latestAction: {
          status: "failed",
          summary: "Run cancelled by user",
          at: new Date().toISOString(),
        },
        endedAt: Date.now() - 1000,
        finalMessage: "Run cancelled. You can try again.",
      },
      planApplySession: null,
    });

    assert.equal(card.overallStatus, "cancelled");
    assert.match(card.summary ?? "", /cancelled/i);
  });

  it("updates file activity live during edit and write", () => {
    const cardEditing = deriveAgentRunCard({
      runStatus: baseRunStatus({ isActive: true, phase: "editing" }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline: timeline({
          stages: [
            {
              stage: "patch_generated",
              at: Date.now(),
              elapsedMs: 5000,
              stageDurationMs: 2000,
              detail: "src/App.tsx,src/index.css",
            },
          ],
        }),
        entries: [
          {
            id: "e1",
            stage: "pipeline_coder",
            status: "running",
            message: "Generating changes for src/App.tsx",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      planApplySession: null,
    });
    assert.ok(cardEditing.fileActivity.some((f) => f.path === "src/App.tsx" && f.status === "editing"));

    const cardWritten = deriveAgentRunCard({
      runStatus: baseRunStatus({ isActive: true, phase: "applying" }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline: timeline(),
        entries: [
          {
            id: "w1",
            stage: "write",
            status: "success",
            message: "Updated src/App.tsx",
            timestamp: new Date().toISOString(),
          },
          {
            id: "w2",
            stage: "write",
            status: "success",
            message: "Updated src/index.css",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      planApplySession: null,
    });
    assert.ok(cardWritten.fileActivity.some((f) => f.path === "src/App.tsx" && f.status === "written"));
    assert.ok(cardWritten.fileActivity.some((f) => f.path === "src/index.css" && f.status === "written"));
  });

  it("includes file changes in expanded details data", () => {
    const card = deriveAgentRunCard({
      runStatus: baseRunStatus({
        isActive: true,
        phase: "editing",
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runTimeline: timeline({
          stages: [
            {
              stage: "patch_generated",
              at: Date.now(),
              elapsedMs: 5000,
              stageDurationMs: 2000,
              detail: "src/App.tsx,src/index.css",
            },
          ],
        }),
        entries: [],
      },
      planApplySession: null,
    });

    assert.deepEqual([...card.filesPlanned].sort(), ["src/App.tsx", "src/index.css"].sort());
  });

  it("formats provider line with AI calls and duration", () => {
    const line = formatAgentRunProviderLine({
      provider: "Anthropic",
      model: "Claude Opus 4.6",
      aiCallsUsed: 2,
      durationMs: 102_000,
    });
    assert.match(line!, /Using Anthropic/);
    assert.match(line!, /Claude Opus 4.6/);
    assert.match(line!, /2 AI calls/);
    assert.match(line!, /1m 42s/);
  });

  it("maps greenfield progress into agent run steps", () => {
    const now = Date.now();
    const card = deriveAgentRunCard({
      runStatus: baseRunStatus({
        isActive: true,
        phase: "generating",
        greenfieldProgress: {
          isActive: true,
          currentStage: "generating",
          currentStageLabel: "Generating files",
          steps: [
            { id: "routing", label: "Routing", status: "done" },
            { id: "generating", label: "Generating files", status: "running" },
            { id: "parsing", label: "Parsing files", status: "pending" },
            { id: "review", label: "Review / Auto-write", status: "pending" },
            { id: "writing", label: "Writing files", status: "pending" },
            { id: "npm", label: "npm install", status: "pending" },
            { id: "typescript", label: "TypeScript", status: "pending" },
            { id: "build", label: "Build", status: "pending" },
            { id: "preview", label: "Preview", status: "pending" },
          ],
          provider: "Gemini",
          model: "gemini-2.0-flash",
          elapsedMs: 30_000,
          latestEvent: null,
          lastProgressAt: now,
          stuckLevel: "none",
          stuckMessage: null,
          composerLabel: "Creating app…",
          activity: [],
        },
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "greenfield",
        genStatus: "running",
        provider: "gemini",
        runStartedAt: now - 30_000,
        entries: [],
      },
      planApplySession: null,
    });

    assert.equal(card.title, "Creating app");
    assert.equal(card.steps.find((s) => s.id === "understanding")?.status, "success");
    assert.equal(card.steps.find((s) => s.id === "planning")?.status, "running");
  });

  it("does not mutate run log entries consumed by the developer console", () => {
    const entries = [
      {
        id: "pipeline",
        stage: "pipeline" as const,
        status: "running" as const,
        message: "Understanding project",
        timestamp: new Date().toISOString(),
      },
    ];
    const snapshot = JSON.stringify(entries);

    deriveAgentRunCard({
      runStatus: baseRunStatus({ isActive: true, phase: "auditing" }),
      greenfieldRun: { ...emptyGreenfieldRun(), entries, runTimeline: timeline() },
      planApplySession: null,
    });

    assert.equal(JSON.stringify(entries), snapshot);
  });
});

describe("formatProviderEventMessage", () => {
  it("formats retry and fallback messages in plain language", () => {
    const retry = formatProviderEventMessage({
      id: "1",
      stage: "provider_call",
      status: "running",
      message: "[provider_retry] provider=gemini reason=429 resource exhausted",
      timestamp: new Date().toISOString(),
    });
    assert.match(retry!, /Gemini is busy/);

    const timeout = formatProviderEventMessage({
      id: "2",
      stage: "provider_call",
      status: "failed",
      message: "Patch propose timed out",
      details: "timeout after 120s",
      timestamp: new Date().toISOString(),
    });
    assert.match(timeout!, /Patch proposal timed out/);

    const fallback = formatProviderEventMessage({
      id: "3",
      stage: "provider_fallback",
      status: "success",
      message: "[provider_fallback] selected",
      details: "anthropic",
      timestamp: new Date().toISOString(),
    });
    assert.match(fallback!, /Switching to Anthropic backup/);
  });
});

describe("agentRunProgressPercent", () => {
  it("maps current step to progress values", () => {
    assert.equal(
      agentRunProgressPercent(
        { id: "editing", label: "Editing files", status: "running" },
        "running",
      ),
      45,
    );
    assert.equal(agentRunProgressPercent(null, "complete"), 100);
  });
});

describe("formatProviderIdentityLine", () => {
  it("formats provider identity for live display", () => {
    assert.equal(
      formatProviderIdentityLine("Anthropic", "Claude Opus 4.6"),
      "Using Anthropic · Claude Opus 4.6",
    );
  });
});

describe("agentRunStepIcon", () => {
  it("uses required status icons", () => {
    assert.equal(agentRunStepIcon("running"), "⏳");
    assert.equal(agentRunStepIcon("success"), "✅");
    assert.equal(agentRunStepIcon("failed"), "❌");
    assert.equal(agentRunStepIcon("pending"), "⚪");
    assert.equal(agentRunStepIcon("retrying"), "↷");
  });
});

describe("formatAgentRunDuration", () => {
  it("formats seconds and minutes", () => {
    assert.equal(formatAgentRunDuration(42_000), "42s");
    assert.equal(formatAgentRunDuration(102_000), "1m 42s");
  });
});
