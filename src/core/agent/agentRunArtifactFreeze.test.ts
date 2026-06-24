import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentRunArtifact } from "@/core/agent/buildAgentRunArtifact";
import {
  hasArtifactFileDiffSource,
  shouldFreezeAgentRunArtifact,
  shouldRefreshAgentRunArtifact,
} from "@/core/agent/agentRunArtifactFreeze";
import { buildAgentTrace } from "@/core/agent/agentTrace";
import type { DeriveAgentRunStateInput } from "@/core/agent/deriveAgentRunState";
import { extractRunFileDiffs, resolveAllowGeneratedFileDiffs } from "@/core/agent/runFileDiffs";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

const HISTORY_PROMPT =
  "Add calculation history. Create a separate History component. Persist history in localStorage.";

function emptyCard() {
  return {
    filesModified: [],
    patchImpact: { files: [], totalAdded: 0, totalRemoved: 0 },
  } as unknown as import("@/core/agent/agentRunCard").AgentRunCardViewModel;
}

function greenfieldCalculatorGeneratedFiles(): import("@/core/greenfield/types").GeneratedFile[] {
  return GREENFIELD_FILE_PATHS.map((path, index) => ({
    path,
    content: `// greenfield ${index}\n`,
  }));
}

function followUpAppliedDiffs() {
  return [
    {
      path: "src/components/History.tsx",
      linesAdded: 12,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: "export function History() { return null; }\n",
    },
    {
      path: "src/App.tsx",
      linesAdded: 2,
      linesRemoved: 0,
      preview: [],
      before: "export function App() { return <div>Calc</div>; }\n",
      after: "import { History } from './components/History';\nexport function App() { return <div><History /></div>; }\n",
    },
  ];
}

function baseDeriveInput(
  greenfieldRun: DeriveAgentRunStateInput["greenfieldRun"],
  overrides: Partial<DeriveAgentRunStateInput> = {},
): DeriveAgentRunStateInput {
  return {
    greenfieldRun,
    greenfieldPanelActive: false,
    agentIntent: "follow_up",
    buildPhase: "idle",
    planApplyPhase: null,
    planApplySession: null,
    autoFixPhase: null,
    buildRunning: false,
    pipelineRunning: false,
    recentLogs: greenfieldRun.entries,
    runStartedAt: greenfieldRun.runStartedAt,
    provider: null,
    model: null,
    buildError: null,
    planApplyError: null,
    pipelineError: null,
    plan: null,
    aiPlan: null,
    scan: null,
    ...overrides,
  };
}

describe("agentRunArtifactFreeze", () => {
  it("does not freeze follow-up while build_loop is still running", () => {
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "apply_plan" as const,
      runResult: "running" as const,
      generatedFiles: greenfieldCalculatorGeneratedFiles(),
      runTimeline: {
        runId: "run-follow-up",
        route: "edit_follow_up",
        startedAt: Date.now(),
        stages: [],
        lastStage: "plan_start",
        lastSuccessfulStage: null,
        status: "running" as const,
        completedAt: null,
        totalDurationMs: null,
        failureDetail: null,
      },
    };
    const input = baseDeriveInput(run as GreenfieldRunSnapshot, { buildRunning: true });
    assert.equal(shouldFreezeAgentRunArtifact(input), false);
    assert.equal(shouldRefreshAgentRunArtifact(input, "run-follow-up"), false);
  });

  it("does not freeze stale terminal success before follow-up apply diffs exist", () => {
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "apply_plan" as const,
      runResult: "success" as const,
      generatedFiles: greenfieldCalculatorGeneratedFiles(),
      runTimeline: {
        runId: "run-follow-up",
        route: "edit_follow_up",
        startedAt: Date.now(),
        stages: [{ stage: "plan_complete" as const, at: Date.now(), elapsedMs: 1, stageDurationMs: 1, detail: "src/App.tsx" }],
        lastStage: "plan_complete" as const,
        lastSuccessfulStage: "plan_complete" as const,
        status: "running" as const,
        completedAt: null,
        totalDurationMs: null,
        failureDetail: null,
      },
    };
    const input = baseDeriveInput(run as GreenfieldRunSnapshot);
    assert.equal(shouldFreezeAgentRunArtifact(input), false);
    assert.equal(hasArtifactFileDiffSource(input), false);
  });

  it("refreshes artifact once planner/apply diffs exist", () => {
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "apply_plan" as const,
      runResult: "running" as const,
      generatedFiles: greenfieldCalculatorGeneratedFiles(),
      appliedFileDiffs: followUpAppliedDiffs(),
      runTimeline: {
        runId: "run-follow-up",
        route: "edit_follow_up",
        startedAt: Date.now(),
        stages: [],
        lastStage: "apply_complete",
        lastSuccessfulStage: "apply_complete",
        status: "running" as const,
        completedAt: null,
        totalDurationMs: null,
        failureDetail: null,
      },
    };
    const input = baseDeriveInput(run as GreenfieldRunSnapshot, { buildRunning: true });
    assert.equal(hasArtifactFileDiffSource(input), true);
    assert.equal(shouldRefreshAgentRunArtifact(input, "run-follow-up"), true);
  });

  it("freezes follow-up only after run completes with applied diffs", () => {
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "apply_plan" as const,
      runResult: "success" as const,
      runStartedAt: Date.now() - 5000,
      endedAt: Date.now(),
      generatedFiles: greenfieldCalculatorGeneratedFiles(),
      appliedFileDiffs: followUpAppliedDiffs(),
      runTimeline: {
        runId: "run-follow-up",
        route: "edit_follow_up",
        startedAt: Date.now() - 5000,
        stages: [{ stage: "run_complete" as const, at: Date.now(), elapsedMs: 5000, stageDurationMs: 1000, detail: null }],
        lastStage: "run_complete" as const,
        lastSuccessfulStage: "run_complete" as const,
        status: "complete" as const,
        completedAt: Date.now(),
        totalDurationMs: 5000,
        failureDetail: null,
      },
    };
    const input = baseDeriveInput(run as GreenfieldRunSnapshot);
    assert.equal(shouldFreezeAgentRunArtifact(input), true);
    assert.equal(shouldRefreshAgentRunArtifact(input, "run-follow-up"), true);
  });
});

describe("follow-up trace after greenfield calculator", () => {
  it("uses applied diffs instead of stale generatedFiles for follow-up runs", () => {
    const generatedFiles = greenfieldCalculatorGeneratedFiles();
    const applied = followUpAppliedDiffs();

    const diffs = extractRunFileDiffs({
      card: emptyCard(),
      generatedFiles,
      appliedFileDiffs: applied,
      allowGeneratedFiles: false,
    });

    assert.equal(diffs.length, 2);
    assert.ok(diffs.some((diff) => diff.path === "src/components/History.tsx"));
    assert.ok(diffs.some((diff) => diff.path === "src/App.tsx"));
    for (const scaffold of ["package.json", "index.html", "tsconfig.json", "vite.config.ts"]) {
      assert.ok(!diffs.some((diff) => diff.path === scaffold));
    }
  });

  it("still allows generatedFiles for actual greenfield runs", () => {
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      runTimeline: {
        runId: "gf",
        route: "greenfield",
        startedAt: Date.now(),
        stages: [],
        lastStage: null,
        lastSuccessfulStage: null,
        status: "running" as const,
        completedAt: null,
        totalDurationMs: null,
        failureDetail: null,
      },
    };
    assert.equal(resolveAllowGeneratedFileDiffs(run), true);
  });

  it("buildAgentRunArtifact trace shows History/App edits not scaffold files", () => {
    const base = Date.now();
    const artifact = buildAgentRunArtifact({
      runId: "run-history-follow-up",
      runNumber: 2,
      userMessageId: "msg-history",
      prompt: HISTORY_PROMPT,
      stateInput: baseDeriveInput({
        ...emptyGreenfieldRun(),
        actionType: "apply_plan",
        runStartedAt: base,
        endedAt: base + 4000,
        runResult: "success",
        generatedFiles: greenfieldCalculatorGeneratedFiles(),
        appliedFileDiffs: followUpAppliedDiffs(),
        runTimeline: {
          runId: "run-history-follow-up",
          route: "edit_follow_up",
          startedAt: base,
          stages: [
            {
              stage: "run_complete",
              at: base + 4000,
              elapsedMs: 4000,
              stageDurationMs: 1000,
              detail: null,
            },
          ],
          lastStage: "run_complete",
          lastSuccessfulStage: "run_complete",
          status: "complete",
          completedAt: base + 4000,
          totalDurationMs: 4000,
          failureDetail: null,
        },
      }),
    });

    const editEvents =
      artifact.agentTrace?.events.filter((event) => event.kind === "file_edited") ?? [];
    const editedPaths = editEvents.map(
      (event) => event.fileEdit?.path ?? event.label,
    );

    assert.ok(editedPaths.includes("src/components/History.tsx"));
    assert.ok(editedPaths.includes("src/App.tsx"));
    for (const scaffold of [
      "package.json",
      "index.html",
      "src/main.tsx",
      "tsconfig.json",
      "vite.config.ts",
    ]) {
      assert.ok(!editedPaths.includes(scaffold), `should not trace ${scaffold}`);
    }
  });

  it("buildAgentTrace does not emit scaffold file_edited before apply diffs exist", () => {
    const trace = buildAgentTrace({
      prompt: HISTORY_PROMPT,
      route: "edit_follow_up",
      generationMode: "apply_plan",
      outcome: null,
      fileDiffs: extractRunFileDiffs({
        card: emptyCard(),
        generatedFiles: greenfieldCalculatorGeneratedFiles(),
        allowGeneratedFiles: false,
      }),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "apply_plan",
        generatedFiles: greenfieldCalculatorGeneratedFiles(),
        runResult: "running",
        runTimeline: {
          runId: "run-pending",
          route: "edit_follow_up",
          startedAt: Date.now(),
          stages: [],
          lastStage: "plan_start",
          lastSuccessfulStage: null,
          status: "running",
          completedAt: null,
          totalDurationMs: null,
          failureDetail: null,
        },
      },
    });

    assert.equal(
      trace.events.filter((event) => event.kind === "file_edited").length,
      0,
    );
  });
});
