import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentConversationProjection,
} from "@/core/agent/agentConversationProjection";
import type { AgentToolEvent } from "@/core/agent/agentToolStream";
import { buildAgentToolStream } from "@/core/agent/agentToolStream";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { AgentRunFinalSummary } from "@/core/agent/agentLiveActivityTimeline";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import {
  buildNarrowedRetryTargets,
  collectPlanApplyTargets,
} from "@/core/planApply/collectTargets";
import {
  evaluateIncompleteCoordinatedApply,
  promptRequiresAppImplementation,
  promptRequiresCoordinatedTsxAndCss,
} from "@/core/planApply/coordinatedEditCompletion";
import type { PlanApplyFileEntry } from "@/core/planApply/types";
import { EMPTY_PROJECT_MEMORY } from "@/core/projectMemory/types";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { generatePlan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import { mockProjectScan } from "@/core/repository/testScan";

const PRIORITY_PROMPT = "Add priority levels and due dates to tasks.";

function mockScan(paths: string[], root = "/project") {
  return mockProjectScan(paths, {
    root,
    index: paths.map((path) => ({
      path,
      imports: path.endsWith("main.tsx") ? ["./App"] : [],
      components: path.endsWith("App.tsx") ? ["App"] : [],
      functions: path.endsWith("App.tsx") ? ["loadTasks", "saveTasks"] : [],
      exports: path.endsWith("App.tsx") ? ["default"] : [],
      hooks: [],
      classes: [],
      interfaces: path.endsWith("App.tsx") ? ["Task"] : [],
      types: [],
      referencedNames: path.endsWith("main.tsx") ? ["App"] : ["Task"],
      symbolLocations: [],
    })),
  });
}

function file(
  relPath: string,
  status: PlanApplyFileEntry["status"],
  changed = status === "ready",
  error?: string,
): PlanApplyFileEntry {
  return {
    relPath,
    absPath: `/project/${relPath}`,
    selectionReason: "test",
    planReason: "test",
    status,
    decision: status === "ready" ? "approved" : "rejected",
    ...(error ? { error, rejectionReason: error } : {}),
    diffStats: { added: changed ? 8 : 0, removed: 0, changed },
  };
}

function minimalCard(overrides: Partial<AgentRunCardViewModel> = {}): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Edit run",
    overallStatus: "running",
    currentStep: { id: "ui_audit", label: "Running UI audit", status: "running" },
    steps: [],
    progressPercent: 90,
    streamRevision: "1",
    providerLine: null,
    providerIdentityLine: "Anthropic",
    provider: "Anthropic",
    model: "claude-opus-4-6",
    aiCallsUsed: 3,
    durationMs: 60_000,
    durationLabel: "1m",
    providerEvents: [],
    latestProviderEvent: null,
    fileActivity: [],
    filesPlanned: ["src/App.tsx", "src/index.css"],
    filesModified: ["src/App.tsx", "src/index.css"],
    filesWritten: ["src/App.tsx", "src/index.css"],
    verification: {
      typescript: "passed",
      build: "passed",
      uiAudit: "pending",
      preview: "ready",
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
    patchImpact: {
      files: [],
      complexity: "Low",
      risk: "Low",
      estimatedTime: "1m",
      isVisible: false,
    },
    failureDiagnosis: null,
    failureDetails: null,
    diagnostics: { items: [], isVisible: false },
    successSummary: null,
    thoughtStream: [],
    ...overrides,
  };
}

function successSummary(
  overrides: Partial<AgentRunFinalSummary> = {},
): AgentRunFinalSummary {
  return {
    filesChanged: ["src/App.tsx", "src/index.css"],
    commandsRun: [],
    typescript: "passed",
    build: "passed",
    preview: "passed",
    uiAudit: "pending",
    durationMs: 60_000,
    durationLabel: "1m",
    errors: [],
    noChangeExplanation: null,
    outcome: "success",
    providerOutput: [],
    ...overrides,
  };
}

describe("priority/due-date task-manager edit regression", () => {
  const scan = mockScan(["src/App.tsx", "src/index.css", "src/main.tsx"]);

  it("targets App.tsx + index.css and never selects entry bootstrap main.tsx", () => {
    assert.equal(promptRequiresAppImplementation(PRIORITY_PROMPT), true);
    assert.equal(promptRequiresCoordinatedTsxAndCss(PRIORITY_PROMPT), true);

    const plan = generatePlan(PRIORITY_PROMPT, scan);
    const aiPlan: AIPlanResult = {
      ok: true,
      provider: "anthropic",
      model: "claude-opus-4-6",
      latencyMs: 1,
      raw: {},
      plan: {
        summary: "Add priority and due dates",
        files: [
          { path: "src/App.tsx", reason: "Task model and UI controls" },
          { path: "src/main.tsx", reason: "References App" },
          { path: "src/index.css", reason: "Priority badge styles" },
        ],
        reasoning: "",
        risks: [],
        confidence: "High",
      },
    };

    const collected = collectPlanApplyTargets(plan, aiPlan, scan, PRIORITY_PROMPT, {
      projectPath: "/project",
      projectMemory: EMPTY_PROJECT_MEMORY,
      sessionMemory: emptySessionMemory(),
    });
    const paths = collected.targets.map((t) => t.relPath);
    assert.ok(paths.includes("src/App.tsx"), paths.join(", "));
    assert.ok(paths.includes("src/index.css"), paths.join(", "));
    assert.ok(!paths.includes("src/main.tsx"), paths.join(", "));
    assert.ok(
      collected.skipped.some((s) => /src\/main\.tsx/.test(s)),
      collected.skipped.join("; "),
    );

    const narrowed = buildNarrowedRetryTargets(plan, aiPlan, scan, PRIORITY_PROMPT, {
      projectPath: "/project",
      projectMemory: EMPTY_PROJECT_MEMORY,
      sessionMemory: emptySessionMemory(),
    });
    assert.ok(!narrowed.some((t) => t.relPath === "src/main.tsx"));
  });

  it("treats App+CSS ready as complete even if main.tsx was wrongly rejected", () => {
    const result = evaluateIncompleteCoordinatedApply({
      prompt: PRIORITY_PROMPT,
      targetPaths: ["src/App.tsx", "src/main.tsx", "src/index.css"],
      files: [
        file("src/App.tsx", "ready", true),
        file(
          "src/main.tsx",
          "error",
          false,
          "Missing @@FILE block for src/main.tsx in model response.",
        ),
        file("src/index.css", "ready", true),
      ],
    });
    assert.equal(result.incomplete, false);
    assert.equal(result.message, null);
  });

  it("does not narrate apply failure after verified writes when UI audit is noisy", () => {
    const entries = [
      createRunLogEntry("write", "success", "Updated src/App.tsx"),
      createRunLogEntry("write", "success", "Updated src/index.css"),
      createRunLogEntry("apply_plan", "success", "Wrote 2 file(s)"),
      createRunLogEntry("typescript", "success", "TypeScript passed"),
      createRunLogEntry("build", "success", "Build passed"),
      createRunLogEntry("verification", "success", "Verification passed"),
      createRunLogEntry("preview", "success", "Preview started"),
      createRunLogEntry(
        "ui_audit",
        "failed",
        "Generated App UI Audit found issues · form_layout",
      ),
    ];

    const tools = buildAgentToolStream({
      entries,
      card: minimalCard(),
      run: emptyGreenfieldRun(),
    });
    assert.ok(!tools.some((t) => t.kind === "failure"), JSON.stringify(tools));

    const withFailureTool: AgentToolEvent[] = [
      ...tools,
      {
        id: "failure:ui-audit",
        kind: "failure",
        label: "Generated App UI Audit found issues: form_layout",
        status: "failed",
        at: Date.now(),
      },
      {
        id: "edit:summary",
        kind: "edit",
        label: "Edited 2 files",
        status: "success",
        at: Date.now(),
        files: ["src/App.tsx", "src/index.css"],
      },
    ];

    const projection = buildAgentConversationProjection({
      tools: withFailureTool,
      summary: successSummary(),
      previewReady: true,
      isRunning: false,
    });
    const narrative = projection.segments.map((s) => s.text).join("\n");
    assert.doesNotMatch(narrative, /couldn't safely apply/i);
    assert.match(narrative, /updated successfully/i);
  });
});
