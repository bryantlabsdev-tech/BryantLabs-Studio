import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import {
  appendAgentRunArtifact,
  clearAgentRunHistory,
  loadAgentRunHistory,
} from "@/core/agent/agentRunHistory";
import {
  hashPrompt,
  hasAbandonedRunArtifacts,
  hasStaleRunContext,
  isSuccessfulTerminalIdleContext,
  promptPreview,
  classifyStaleRunArtifacts,
  recoverObsoleteRunArtifacts,
  applyObsoleteRunRecoveryToContext,
  ownedApplyRunId,
  UNDO_AFTER_VERIFY_FAILURE_MESSAGE,
} from "@/core/agent/runContextReset";
import { resolveUserPlanPrompt } from "@/core/planApply/prompt";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { PlanApplySession } from "@/core/planApply";

const IDLE_MUTEX = {
  greenfieldRun: emptyGreenfieldRun(),
  greenfieldPanelActive: false,
  buildRunning: false,
  pipelineRunning: false,
  aiPlanStatus: "idle" as const,
  planApplyPhase: null,
  autoFixPhase: null,
};

function staleInput(overrides: Partial<Parameters<typeof hasStaleRunContext>[0]> = {}) {
  return {
    plan: null,
    aiPlan: null,
    aiPlanStatus: "idle" as const,
    planApplySession: null,
    buildError: null,
    planApplyError: null,
    pipelineError: null,
    verification: null,
    builderSession: null,
    executionSession: null,
    followUpEscalation: null,
    greenfieldRun: emptyGreenfieldRun(),
    mutex: IDLE_MUTEX,
    ...overrides,
  };
}

const SAMPLE_PLAN: Plan = {
  prompt: "Fix the UI audit advisory",
  intent: "generic",
  summary: "Styling request",
  files: [{ path: "src/index.css", absPath: "/p/src/index.css", score: 5, reasons: [] }],
  proposedChanges: [],
  confidence: "High",
  impact: "Low",
  createdAt: Date.now(),
};

const SUCCESS_GREENFIELD = {
  ...emptyGreenfieldRun(),
  runResult: "success" as const,
  actionType: "apply_plan" as const,
};

const SUCCESS_AI_PLAN: AIPlanResult = {
  ok: true,
  provider: "gemini",
  model: "gemini-2.5-pro",
  raw: {},
  latencyMs: 100,
  plan: {
    summary: SAMPLE_PLAN.summary,
    files: [{ path: "src/index.css", reason: "overflow fix" }],
    reasoning: "Adjust table overflow styles.",
    risks: [],
    confidence: "High",
  },
};

describe("runContextReset", () => {
  it("hashes prompts consistently", () => {
    const a = hashPrompt("Build CRUD app");
    const b = hashPrompt("Build CRUD app");
    const c = hashPrompt("Set up Supabase");
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it("previews long prompts at 120 chars", () => {
    const long = "a".repeat(200);
    assert.equal(promptPreview(long).length, 121);
    assert.match(promptPreview(long), /…$/);
  });

  it("detects stale plan context when idle without successful terminal run", () => {
    assert.equal(hasStaleRunContext(staleInput({ plan: SAMPLE_PLAN })), true);
    assert.equal(hasAbandonedRunArtifacts(staleInput({ plan: SAMPLE_PLAN })), true);
  });

  it("does not flag stale after successful Fix-with-AI terminal run", () => {
    const input = staleInput({
      plan: SAMPLE_PLAN,
      aiPlan: SUCCESS_AI_PLAN,
      aiPlanStatus: "done",
      verification: { ok: true, typecheck: { ok: true }, build: { ok: true } },
      greenfieldRun: SUCCESS_GREENFIELD,
    });
    assert.equal(isSuccessfulTerminalIdleContext(input), true);
    assert.equal(hasStaleRunContext(input), false);
  });

  it("does not flag stale after successful greenfield terminal run", () => {
    const input = staleInput({
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runResult: "success",
        actionType: "greenfield",
        filesWritten: ["src/App.tsx"],
      },
    });
    assert.equal(hasStaleRunContext(input), false);
  });

  it("does not flag stale after a user-cancelled greenfield run", () => {
    const input = staleInput({
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "greenfield",
        runResult: "cancelled",
        genStatus: "cancelled",
        finalMessage: "Run cancelled. You can try again.",
      },
    });
    assert.equal(isSuccessfulTerminalIdleContext(input), true);
    assert.equal(hasStaleRunContext(input), false);
  });

  it("still flags failed apply as stale", () => {
    assert.equal(
      hasStaleRunContext(
        staleInput({
          plan: SAMPLE_PLAN,
          aiPlan: SUCCESS_AI_PLAN,
          planApplyError: "Typecheck failed after apply.",
          greenfieldRun: {
            ...emptyGreenfieldRun(),
            runResult: "failed",
          },
        }),
      ),
      true,
    );
  });

  it("still flags incomplete apply session as stale", () => {
    const waitingSession = {
      phase: "waiting_for_review",
      files: [],
    } as unknown as PlanApplySession;

    assert.equal(
      hasStaleRunContext(
        staleInput({
          plan: SAMPLE_PLAN,
          planApplySession: waitingSession,
          greenfieldRun: SUCCESS_GREENFIELD,
        }),
      ),
      true,
    );
    assert.equal(
      isSuccessfulTerminalIdleContext(
        staleInput({
          planApplySession: waitingSession,
          greenfieldRun: SUCCESS_GREENFIELD,
        }),
      ),
      false,
    );
  });

  it("still flags unresolved planner error as stale", () => {
    assert.equal(
      hasStaleRunContext(
        staleInput({
          plan: SAMPLE_PLAN,
          aiPlanStatus: "error",
          greenfieldRun: SUCCESS_GREENFIELD,
        }),
      ),
      true,
    );
  });

  it("does not flag stale context while a run is active", () => {
    assert.equal(
      hasStaleRunContext(
        staleInput({
          plan: SAMPLE_PLAN,
          mutex: { ...IDLE_MUTEX, buildRunning: true },
        }),
      ),
      false,
    );
  });

  it("keeps run inspector history independent of active context clearing", () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
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

    try {
      const scope = `__test-run-context-${Date.now()}`;
      clearAgentRunHistory(scope);
      const artifact = {
        runId: "run-1",
        runNumber: 1,
        prompt: "Fix rows overflow",
        userMessageId: "msg-1",
        startedAt: 1000,
        endedAt: 2000,
        durationMs: 1000,
        outcome: "success" as const,
        provider: "gemini",
        model: "gemini-2.5-pro",
        filesModified: ["src/index.css"],
        fileDiffs: [],
        logEntries: [],
        card: {
          isVisible: true,
          title: "Agent run",
          overallStatus: "complete" as const,
          currentStep: null,
          steps: [],
          progressPercent: 100,
          streamRevision: "1",
          providerLine: null,
          providerIdentityLine: null,
          provider: "gemini",
          model: "gemini-2.5-pro",
          aiCallsUsed: 1,
          durationMs: 1000,
          durationLabel: "1s",
          providerEvents: [],
          latestProviderEvent: null,
          fileActivity: [],
          filesPlanned: [],
          filesModified: ["src/index.css"],
          filesWritten: ["src/index.css"],
          verification: {
            typescript: "passed" as const,
            build: "passed" as const,
            uiAudit: "skipped" as const,
            preview: "ready" as const,
          },
          summary: "Done",
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
          confidence: { percent: 80, level: "high" as const, factors: [], showBeforeApply: false },
          patchImpact: {
            isVisible: false,
            files: [],
            complexity: "Low" as const,
            risk: "Low" as const,
            estimatedTime: "1m",
          },
          failureDiagnosis: null,
          diagnostics: { items: [], isVisible: false },
          successSummary: null,
          thoughtStream: [],
          failureDetails: null,
        },
        dashboard: {
          isVisible: true,
          promptTitle: "Fix rows overflow",
          providerModel: "gemini · gemini-2.5-pro",
          elapsedLabel: "1s",
          progressPercent: 100,
          progressLabel: "Complete",
          overallStatus: "complete" as const,
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
            filesModified: ["src/index.css"],
            buildResult: "Build passed",
            verificationResult: "TypeScript passed · Build passed",
            durationLabel: "1s",
            summaryLine: "Done",
          },
          streamRevision: "1",
        },
        timeline: null,
      } satisfies AgentRunArtifact;

      appendAgentRunArtifact(scope, artifact);
      assert.equal(loadAgentRunHistory(scope).length, 1);

      const archivedInput = staleInput({
        plan: null,
        aiPlan: null,
        verification: null,
        greenfieldRun: SUCCESS_GREENFIELD,
      });
      assert.equal(hasStaleRunContext(archivedInput), false);
      assert.equal(loadAgentRunHistory(scope).length, 1);
      assert.equal(loadAgentRunHistory(scope)[0]?.runId, "run-1");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });

  it("uses explicit prompt over stale plan for Supabase follow-up", () => {
    const crudPlan: Plan = {
      prompt: "Build CRUD app with list and edit screens",
      intent: "generic",
      summary: "CRUD",
      files: [{ path: "src/App.tsx", absPath: "/p/src/App.tsx", score: 5, reasons: [] }],
      proposedChanges: [],
      confidence: "Medium",
      impact: "Medium",
      createdAt: Date.now(),
    };
    const supabasePrompt = "Set up Supabase auth and database for this app";

    const withoutExplicit = resolveUserPlanPrompt(crudPlan, "Build CRUD app");
    assert.match(withoutExplicit ?? "", /CRUD/i);

    const withExplicit = resolveUserPlanPrompt(crudPlan, "Build CRUD app", supabasePrompt);
    assert.equal(withExplicit, supabasePrompt);
    assert.doesNotMatch(withExplicit ?? "", /CRUD app with list/i);
  });
});

describe("obsolete run recovery after failed verification", () => {
  const failedVerifyInput = staleInput({
    plan: SAMPLE_PLAN,
    aiPlan: SUCCESS_AI_PLAN,
    aiPlanStatus: "done",
    planApplyError: "Typecheck failed after apply.",
    verification: { ok: false },
    greenfieldRun: {
      ...emptyGreenfieldRun(),
      runResult: "failed",
      failureReport: {
        rootStage: "verification",
        rootCauseLine: "Typecheck failed after apply.",
        stages: [],
      },
    },
  });

  it("treats leftover errors after a failed applied verify as obsolete diagnostics", () => {
    const classified = classifyStaleRunArtifacts(failedVerifyInput);
    assert.equal(classified.planApplyError, "obsolete_diagnostic");
    assert.equal(classified.verification, "obsolete_diagnostic");
    assert.equal(classified.greenfieldRun, "obsolete_diagnostic");
    assert.equal(classified.planApplySession, "obsolete_diagnostic");
    assert.equal(hasStaleRunContext(failedVerifyInput), true);
  });

  it("successful undo recovery allows the next prompt without Reset", () => {
    const result = recoverObsoleteRunArtifacts({
      context: failedVerifyInput,
      kind: "successful_undo",
      recoveredRunId: "apply-1",
      ownedRunId: "apply-1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const next = applyObsoleteRunRecoveryToContext(failedVerifyInput, result.next);
    assert.equal(hasStaleRunContext(next), false);
    assert.equal(isSuccessfulTerminalIdleContext(next), false);
    assert.equal(next.planApplyError, null);
    assert.equal(next.greenfieldRun.runResult, "idle");
    assert.equal(next.greenfieldRun.latestAction?.summary, UNDO_AFTER_VERIFY_FAILURE_MESSAGE);
    assert.equal(next.plan, null);
  });

  it("keeps chat-visible recovery text while dropping blocking artifacts", () => {
    const result = recoverObsoleteRunArtifacts({
      context: failedVerifyInput,
      kind: "successful_undo",
      recoveredRunId: "apply-1",
      ownedRunId: "apply-1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.next.greenfieldRunPatch.latestAction?.summary,
      UNDO_AFTER_VERIFY_FAILURE_MESSAGE,
    );
    assert.equal(result.next.planApplyError, null);
  });

  it("refuses recovery when undo ownership does not match", () => {
    const result = recoverObsoleteRunArtifacts({
      context: failedVerifyInput,
      kind: "successful_undo",
      recoveredRunId: "apply-1",
      ownedRunId: "apply-other",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.retainStaleProtection, true);
    assert.equal(hasStaleRunContext(failedVerifyInput), true);
  });

  it("pending review still blocks recovery and remains stale", () => {
    const waiting = staleInput({
      plan: SAMPLE_PLAN,
      planApplySession: {
        phase: "waiting_for_review",
        files: [],
        applyRunId: "apply-1",
      } as unknown as PlanApplySession,
      greenfieldRun: SUCCESS_GREENFIELD,
    });
    assert.equal(classifyStaleRunArtifacts(waiting).planApplySession, "recoverable_pending");
    const result = recoverObsoleteRunArtifacts({
      context: waiting,
      kind: "successful_undo",
      recoveredRunId: "apply-1",
      ownedRunId: "apply-1",
    });
    assert.equal(result.ok, false);
    assert.equal(hasStaleRunContext(waiting), true);
  });

  it("active run still blocks recovery", () => {
    const active = staleInput({
      plan: SAMPLE_PLAN,
      planApplyError: "Typecheck failed after apply.",
      mutex: { ...IDLE_MUTEX, buildRunning: true },
    });
    assert.equal(classifyStaleRunArtifacts(active).mutex, "active_work");
    assert.equal(hasStaleRunContext(active), false);
    const result = recoverObsoleteRunArtifacts({
      context: active,
      kind: "successful_undo",
      recoveredRunId: "apply-1",
      ownedRunId: "apply-1",
    });
    assert.equal(result.ok, false);
  });

  it("Reject/Cancel with no writes recovers and leaves no stale state", () => {
    const waiting = staleInput({
      plan: SAMPLE_PLAN,
      aiPlan: SUCCESS_AI_PLAN,
      aiPlanStatus: "done",
      planApplySession: {
        phase: "waiting_for_review",
        files: [],
        applyRunId: "apply-1",
      } as unknown as PlanApplySession,
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runResult: "running",
      },
    });
    const withoutSession = { ...waiting, planApplySession: null };
    const result = recoverObsoleteRunArtifacts({
      context: withoutSession,
      kind: "cancel_unapplied",
      recoveredRunId: "apply-1",
      ownedRunId: "apply-1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const next = applyObsoleteRunRecoveryToContext(withoutSession, result.next);
    assert.equal(hasStaleRunContext(next), false);
    assert.equal(hasAbandonedRunArtifacts(next) && !isSuccessfulTerminalIdleContext(next), false);
  });

  it("Reset still clears via the existing full clear path, not recovery", () => {
    assert.equal(hasStaleRunContext(failedVerifyInput), true);
    const reset = staleInput();
    assert.equal(hasStaleRunContext(reset), false);
    assert.equal(isSuccessfulTerminalIdleContext(reset), false);
  });

  it("ownedApplyRunId prefers the active apply run", () => {
    assert.equal(ownedApplyRunId("active", "completed"), "active");
    assert.equal(ownedApplyRunId(null, "completed"), "completed");
    assert.equal(ownedApplyRunId(null, null), null);
  });
});
