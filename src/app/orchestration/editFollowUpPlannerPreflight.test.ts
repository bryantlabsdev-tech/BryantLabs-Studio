import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUiAuditAdvisoryFixPrompt, recommendationsForUiAuditIssues } from "@/core/agent/uiAuditAdvisoryUx";
import { buildRunInspectorViewModel } from "@/core/agent/runInspector";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { generatePlan } from "@/core/planner";
import {
  formatFollowUpPlannerFailureMessage,
  usedDeterministicPlanFallback,
} from "@/core/planner/aiPlanFailureMessage";
import {
  formatPlannerPreflightDiagnostics,
  readPreflightDiagnostics,
} from "@/core/planner/plannerPreflight";
import { classifyFollowUpPromptType } from "@/core/planner/promptClassification";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { EMPTY_PROJECT_INTELLIGENCE } from "@/core/projectIntelligence/types";
import { normalizeProjectMemory } from "@/core/projectMemory/store";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import { mockProjectScan } from "@/core/repository/testScan";
import type { PlanningOrchestrationHost } from "@/app/orchestration/planningTypes";
import {
  runAIPlanOrchestration,
} from "@/app/orchestration/planning";
import { emptyAgentWorkspaceSession } from "@/core/agentWorkspace/store";
import type { BryantLabsApi } from "@/types";

const UI_AUDIT_FIX_PROMPT = buildUiAuditAdvisoryFixPrompt({
  layoutType: "table_layout",
  score: 86,
  issues: ["rows_overflow"],
  recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
});

function blockedProviderSettings() {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "anthropic/claude-sonnet-4",
    hasGeminiKey: false,
    hasAnthropicKey: false,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    plannerProvider: "gemini",
    plannerModel: "",
    maxAiCalls: 3,
  } as import("@/core/providers/types").ProviderSettings);
}

function createMockPlanningHost(input: {
  readonly scan: ReturnType<typeof mockProjectScan>;
  readonly prompt: string;
  readonly stalePlanState?: boolean;
}): {
  host: PlanningOrchestrationHost;
  aiPlanRef: { current: import("@/core/planner/aiTypes").AIPlanResult | null };
  planRef: { current: import("@/core/planner").Plan | null };
  logs: Array<{ stage: string; status: string; message: string; details?: string }>;
} {
  const planRef = { current: null as import("@/core/planner").Plan | null };
  const aiPlanRef = { current: null as import("@/core/planner/aiTypes").AIPlanResult | null };
  const createPlanErrorRef = { current: null as string | null };
  const logs: Array<{ stage: string; status: string; message: string; details?: string }> = [];
  let planState: import("@/core/planner").Plan | null = null;

  const api = {
    getProviderSettings: async () => blockedProviderSettings(),
    planWithProvider: async () => {
      throw new Error("Provider should not be called when connection gate blocks.");
    },
  } as unknown as BryantLabsApi;

  const host: PlanningOrchestrationHost = {
    api,
    project: { path: "/project", name: "test" },
    scan: input.scan,
    get plan() {
      return input.stalePlanState ? null : planState;
    },
    lastPlanPrompt: input.prompt,
    sessionMemory: emptySessionMemory(),
    projectMemory: normalizeProjectMemory(null),
    projectIntelligence: EMPTY_PROJECT_INTELLIGENCE,
    greenfieldRun: {
      ...emptyGreenfieldRun(),
      runTimeline: {
        route: "edit_follow_up",
        runId: "run-ui-audit-fix",
        startedAt: Date.now(),
        stages: [],
        lastStage: null,
        lastSuccessfulStage: null,
        status: "running",
        completedAt: null,
        totalDurationMs: null,
        failureDetail: null,
      },
    },
    planRef,
    aiPlanRef,
    createPlanErrorRef,
    editExplorationContentsRef: { current: [] },
    setPlan: (value) => {
      planState = typeof value === "function" ? value(planState) : value;
      if (!input.stalePlanState) {
        planRef.current = planState;
      }
    },
    setSessionMemory: () => undefined,
    setSessionMemoryDiagnostics: () => undefined,
    setAiPlan: (value) => {
      aiPlanRef.current = typeof value === "function" ? value(aiPlanRef.current) : value;
    },
    setAiPlanStatus: (value) => {
      void value;
    },
    setLastPlanPrompt: () => undefined,
    refreshSmartFileSelection: () => undefined,
    pushAgent: (updater) => updater(emptyAgentWorkspaceSession()),
    beginStudioAction: () => undefined,
    finishStudioAction: () => undefined,
    updateGreenfieldRun: () => undefined,
    appendGreenfieldRunLog: (stage, status, message, detailsOrOpts) => {
      const details =
        typeof detailsOrOpts === "string"
          ? detailsOrOpts
          : detailsOrOpts?.details;
      logs.push(
        details
          ? { stage, status, message, details }
          : { stage, status, message },
      );
    },
    resolveMemoriesForPrompt: () => ({
      memories: [],
      totalEstimatedTokens: 0,
      queriedCount: 0,
      hitCount: 0,
      missCount: 0,
    }),
    commitContextCapture: () => undefined,
    invokePlannerCall: async () => {
      throw new Error("invokePlannerCall should not run when provider is blocked.");
    },
  };

  return { host, aiPlanRef, planRef, logs };
}

describe("edit_follow_up planner preflight", () => {
  const scan = mockProjectScan(["src/App.tsx", "src/index.css"]);

  it("classifies the UI audit fix prompt as ui_audit_fix", () => {
    assert.equal(classifyFollowUpPromptType(UI_AUDIT_FIX_PROMPT), "ui_audit_fix");
  });

  it("uses deterministic fallback when provider is blocked and plan state is stale on host.plan", async () => {
    const { host, aiPlanRef, planRef } = createMockPlanningHost({
      scan,
      prompt: UI_AUDIT_FIX_PROMPT,
      stalePlanState: true,
    });

    const planOut = generatePlan(UI_AUDIT_FIX_PROMPT, scan);
    planRef.current = planOut;
    assert.equal(host.plan, null, "host.plan should remain stale like post-createPlan React state");

    const ok = await runAIPlanOrchestration(host, UI_AUDIT_FIX_PROMPT);
    assert.equal(ok, true, "deterministic fallback should succeed without provider call");
    assert.ok(aiPlanRef.current?.ok);
    assert.equal(usedDeterministicPlanFallback(aiPlanRef.current!), true);

    const preflight = readPreflightDiagnostics(aiPlanRef.current);
    assert.equal(preflight?.promptClassification, "ui_audit_fix");
    assert.equal(preflight?.fallbackEligible, true);
    assert.equal(preflight?.fallbackAttempted, true);
    assert.equal(preflight?.fallbackUsed, true);
    assert.equal(preflight?.providerCallAttempted, false);
    assert.ok(preflight?.editableFilesCount > 0);

    const paths = aiPlanRef.current?.plan?.files.map((file) => file.path) ?? [];
    assert.ok(
      paths.some((path) => path === "src/App.tsx" || path === "src/index.css"),
      `expected App.tsx or index.css in fallback plan, got: ${paths.join(", ")}`,
    );
  });

  it("surfaces preflight diagnostics in Run Inspector when aiPlan state is cleared", () => {
    const plan = generatePlan(UI_AUDIT_FIX_PROMPT, scan);
    const diagnostics = formatPlannerPreflightDiagnostics({
      gate: "provider_not_connected",
      providerCallAttempted: false,
      providerBlockedReason: "No gemini API key is stored. Add one in settings.",
      skipReason: "No gemini API key is stored. Add one in settings.",
      route: "edit_follow_up",
      editableFilesCount: plan.files.length,
      targetFilesCount: plan.files.length,
      fallbackEligible: true,
      fallbackAttempted: true,
      fallbackUsed: true,
      fallbackNotUsedReason: null,
      promptClassification: "ui_audit_fix",
      message: "No gemini API key is stored. Add one in settings.",
    });

    const model = buildRunInspectorViewModel({
      runId: "run-preflight",
      prompt: UI_AUDIT_FIX_PROMPT,
      route: "edit_follow_up",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        entries: [
          createRunLogEntry(
            "ai_plan",
            "failed",
            "Provider not connected.",
            diagnostics,
          ),
        ],
      },
      aiPlan: null,
    });

    assert.equal(model.preflight?.gate, "provider_not_connected");
    assert.equal(model.preflight?.fallbackEligible, true);
    assert.equal(model.preflight?.fallbackAttempted, true);
    assert.equal(model.preflight?.fallbackUsed, true);
    assert.equal(model.preflight?.promptClassification, "ui_audit_fix");
    assert.ok(model.preflight?.editableFilesCount > 0);
  });

  it("formats a composite failure message with gate and fallback status", () => {
    const message = formatFollowUpPlannerFailureMessage({
      aiPlan: {
        ok: false,
        provider: "gemini",
        model: "gemini-2.5-flash",
        latencyMs: 0,
        error: "No gemini API key is stored. Add one in settings.",
        raw: {
          preflightGate: "provider_not_connected",
          preflight: {
            gate: "provider_not_connected",
            providerCallAttempted: false,
            providerBlockedReason: "No gemini API key is stored. Add one in settings.",
            skipReason: "No gemini API key is stored. Add one in settings.",
            route: "edit_follow_up",
            editableFilesCount: 2,
            targetFilesCount: 2,
            fallbackEligible: true,
            fallbackAttempted: true,
            fallbackUsed: false,
            fallbackNotUsedReason: "connection gate blocked and fallback disabled",
            promptClassification: "ui_audit_fix",
            message: "No gemini API key is stored. Add one in settings.",
          },
        },
      },
      planFileCount: 2,
    });

    assert.match(message, /Planner stopped before provider response:/);
    assert.match(message, /Fallback not used:/);
    assert.match(message, /API key|not connected/i);
  });
});
