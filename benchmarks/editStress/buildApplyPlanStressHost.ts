import { createApplyPlanRunController } from "@/app/orchestration/applyPlanRun";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { normalizeProjectMemory } from "@/core/projectMemory/store";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";
import { AiCallTracker } from "@/core/providers/costControls";
import type { PlanApplySession } from "@/core/planApply/types";
import type { Plan } from "@/core/planner";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { emptyAgentWorkspaceSession } from "@/core/agentWorkspace/store";
import { mockApplyPlanBatchPatch } from "@/core/test/mockApplyPlanPatch";
import {
  liveApplyPlanBatchPatch,
  type LiveGeminiPatchConfig,
} from "./liveApplyPlanPatch";
import type {
  BryantLabsApi,
  ProjectInfo,
  ProjectScan,
  VerificationResult,
} from "@/types";
import type { FixtureWorkspace } from "./fixtureWorkspace";
import {
  readWorkspaceFile,
  verifyFixtureWorkspace,
  writeWorkspaceFile,
} from "./fixtureWorkspace";

export interface ApplyPlanStressHarness {
  readonly host: ApplyPlanOrchestrationHost;
  readonly getPlanApplySession: () => PlanApplySession | null;
  readonly getPlanApplyError: () => string | null;
}

function mockVerificationOk(): VerificationResult {
  const step = {
    command: "skipped",
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
  return { typecheck: step, build: step, ranAt: Date.now() };
}

export function buildApplyPlanStressHarness(input: {
  readonly workspace: FixtureWorkspace;
  readonly plan: Plan;
  readonly prompt: string;
  readonly skipVerify?: boolean;
  readonly verify?: () => Promise<VerificationResult>;
  readonly liveGemini?: LiveGeminiPatchConfig;
}): ApplyPlanStressHarness {
  const project: ProjectInfo = {
    path: input.workspace.root,
    name: "edit-stress",
  };
  const planRef = { current: input.plan };
  const aiPlanRef = { current: null };
  const applyPlanActiveRunIdRef = { current: null as string | null };
  const applyPlanCompletedRunIdRef = { current: null as string | null };
  let planApplySession: PlanApplySession | null = null;
  let planApplyError: string | null = null;

  const runController = createApplyPlanRunController(
    applyPlanActiveRunIdRef,
    applyPlanCompletedRunIdRef,
    () => {},
  );

  const geminiModel = input.liveGemini?.model ?? "mock-deterministic";

  const providerSettings: ProviderSettings = normalizeProviderSettings({
    provider: "gemini",
    geminiModel,
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    anthropicModel: "claude-sonnet-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "anthropic/claude-sonnet-4",
    hasGeminiKey: true,
    hasAnthropicKey: false,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    autoFixMode: "off",
    agentMode: "single",
    plannerProvider: "gemini",
    plannerModel: "",
    coderProvider: "gemini",
    coderModel: "",
    repairProvider: "gemini",
    repairModel: "",
    maxAiCalls: 24,
    maxRepairAttempts: 3,
    stopOnProviderLimit: true,
    askBeforeFallback: false,
    fileWriteMode: "workspace",
    plannerMaxOutputTokens: 8192,
  });

  const api = {
    getProviderSettings: async () => providerSettings,
    readFile: async (filePath: string) => {
      try {
        const content = await readWorkspaceFile(filePath);
        return { readable: true, content };
      } catch {
        return { readable: false, content: "", reason: "Could not read file." };
      }
    },
    applyEdit: async (filePath: string, expectedBefore: string, after: string) => {
      try {
        const current = await readWorkspaceFile(filePath);
        if (current !== expectedBefore) {
          return { ok: false, reason: "File changed on disk since proposal." };
        }
        await writeWorkspaceFile(filePath, after);
        return { ok: true };
      } catch {
        return { ok: false, reason: "Apply failed." };
      }
    },
    createProjectFile: async (filePath: string, content: string) => {
      try {
        await writeWorkspaceFile(filePath, content);
        return { ok: true };
      } catch {
        return { ok: false, reason: "Create failed." };
      }
    },
    proposeApplyPlanPatches: async (
      _provider,
      prompt,
      context,
      files,
      meta,
    ) =>
      input.liveGemini
        ? liveApplyPlanBatchPatch(input.liveGemini, prompt, context, files, meta)
        : mockApplyPlanBatchPatch(prompt, files),
    verify: async () => {
      if (input.skipVerify) return mockVerificationOk();
      if (input.verify) return input.verify();
      return verifyFixtureWorkspace(input.workspace);
    },
    stageShadowRun: async () => ({ ok: true, staged: 0 }),
    discardShadowRun: async () => ({ ok: true }),
    greenfieldPreviewStart: async () => ({
      ok: false,
      diagnostics: { hasPreviewScript: false },
    }),
    greenfieldPreviewStop: async () => ({ ok: true }),
    greenfieldPreviewState: async () => ({
      running: false,
      url: null,
      root: null,
      port: 0,
      lastSuccessfulPreviewAt: null,
      processExited: false,
      lastFailureDiagnostics: null,
    }),
    listDirectory: async () => [],
  } as unknown as BryantLabsApi;

  let agentWorkspaceSession = emptyAgentWorkspaceSession();

  const host = {
    api,
    project,
    scan: input.workspace.scan,
    plan: input.plan,
    aiPlan: null,
    lastPlanPrompt: input.prompt,
    sessionMemory: emptySessionMemory(),
    get planApplySession() {
      return planApplySession;
    },
    projectMemory: normalizeProjectMemory(null),
    planRef,
    aiPlanRef,
    aiCallTrackerRef: { current: new AiCallTracker() },
    applyPlanSuccessRef: { current: null },
    executionNoChangeGuardRef: { current: new Map() },
    pipelineCoderResultRef: { current: null },
    lastContextSnapshotIdRef: { current: null },
    greenfieldRun: emptyGreenfieldRun(),
    setPlanApplyError: (value) => {
      planApplyError = typeof value === "function" ? value(planApplyError) : value;
    },
    setPlanApplySession: (value) => {
      planApplySession =
        typeof value === "function" ? value(planApplySession) : value;
    },
    setCenterTab: () => {},
    beginStudioAction: () => {},
    finishStudioAction: () => {},
    updateGreenfieldRun: () => {},
    publishFailureReport: () => {},
    appendGreenfieldRunLog: () => {},
    beginApplyPlanRun: runController.beginApplyPlanRun,
    completeApplyPlanRun: runController.completeApplyPlanRun,
    isStaleApplyPlanRun: runController.isStaleApplyPlanRun,
    ignoreStaleApplyPlanResult: runController.ignoreStaleApplyPlanResult,
    resolveMemoriesForPrompt: () => ({
      memories: [],
      totalEstimatedTokens: 0,
      queriedCount: 0,
      hitCount: 0,
      missCount: 0,
    }),
    commitContextCapture: () => {},
    invokeCoderCall: async (_settings, _tokens, call) => call("gemini"),
    agentControlRef: {
      current: {
        paused: false,
        stopped: false,
        safetyApproved: true,
        approveResolve: null,
      },
    },
    setAgentLoopSession: () => {},
    setExecutionSession: () => {},
    pushAgent: (updater) => {
      agentWorkspaceSession = updater(agentWorkspaceSession);
      return agentWorkspaceSession;
    },
    applyPlanActiveRunIdRef,
    setSessionMemory: () => {},
    setVerification: () => {},
    setVerifyStatus: () => {},
    runScan: () => {},
    requestPreviewTab: () => {},
    setAppPreview: () => {},
    recordSmartFileHistory: () => {},
    startAutoFixAfterApply: async () => ({
      ok: true,
      verification: null,
      awaitingApproval: false,
    }),
    setCanUndo: () => {},
    setLastEditedPath: () => {},
    archiveActiveRunContextAfterSuccess: () => {},
  } as unknown as ApplyPlanOrchestrationHost;

  return {
    host,
    getPlanApplySession: () => planApplySession,
    getPlanApplyError: () => planApplyError,
  };
}
