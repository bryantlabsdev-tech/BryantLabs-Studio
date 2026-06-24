import {
  executeMultiAgentPipeline,
  resumeMultiAgentPipeline,
} from "@/app/multiAgentPipeline";
import { resolveEffectiveProjectScan } from "@/core/agent/resolveEffectiveProjectScan";
import { buildAgentPlanContext } from "@/core/context/buildAgentContext";
import { recordPipelineRun } from "@/core/pipeline/analytics";
import type { PipelineSession } from "@/core/pipeline/types";
import {
  estimateAiCalls,
  isPipelineMode,
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import { effectiveMaxRepairAttempts } from "@/core/providers/costControls";
import type { ProviderSettings } from "@/core/providers/types";
import { activeProviderModel } from "@/core/studioRun/types";
import { resolveUserPlanPrompt } from "@/core/planApply";
import { recordAiPlan, recordPrompt } from "@/core/sessionMemory";
import type { PipelineReviewGates } from "@/app/orchestration/pipelineGates";
import type { BryantLabsApi, ProjectInfo, ProjectScan } from "@/types";
import type { BuildPipelineHost } from "@/app/orchestration/types";
import type { PipelineRunnerDeps } from "@/app/multiAgentPipeline";

type ResolvedPipelineHost = BuildPipelineHost & {
  api: BryantLabsApi;
  scan: ProjectScan;
  project: ProjectInfo;
};

function requireHost(host: BuildPipelineHost | null): ResolvedPipelineHost {
  if (!host?.api || !host.project) {
    throw new Error("Pipeline requires an open project.");
  }
  const effectiveScan = resolveEffectiveProjectScan({
    scan: host.scan,
    projectPath: host.project.path,
    greenfieldRun: host.greenfieldRun,
  });
  if (!effectiveScan) {
    throw new Error("Pipeline requires an open project.");
  }
  return { ...host, api: host.api, project: host.project, scan: effectiveScan };
}

export function buildPipelineRunnerDeps(
  host: ResolvedPipelineHost,
  settings: ProviderSettings,
  gates: PipelineReviewGates,
): PipelineRunnerDeps {
  const { api, scan, project } = host;

  return {
    log: (stage, status, message, details) => {
      host.appendGreenfieldRunLog(stage, status, message, details);
    },
    onSessionUpdate: () => {
      /* assigned by runMultiAgentPipelineOrchestration */
    },
    runPlanner: async (userPrompt) => {
      const planOut = host.createPlan(userPrompt);
      if (!planOut) {
        return {
          result: null,
          contextSnapshotId: null,
          routing: {
            provider: settings.provider,
            model: activeProviderModel(settings),
          },
        };
      }
      const resolvedPrompt =
        userPrompt.trim() || resolveUserPlanPrompt(planOut, null, userPrompt);
      if (!resolvedPrompt) {
        return {
          result: null,
          contextSnapshotId: null,
          routing: {
            provider: settings.provider,
            model: activeProviderModel(settings),
          },
        };
      }
      const routing = resolveStageRouting(settings, "planner");
      const memForPlan =
        host.sessionMemory.lastPrompt === resolvedPrompt.trim()
          ? host.sessionMemory
          : recordPrompt(host.sessionMemory, resolvedPrompt);
      if (memForPlan !== host.sessionMemory) {
        host.setSessionMemory(memForPlan);
      }
      const memoryRetrieval = host.resolveMemoriesForPrompt(resolvedPrompt, "ai_plan");
      const { context, diagnostics } = buildAgentPlanContext(
        scan,
        resolvedPrompt,
        memForPlan,
        /* projectMemory read via host closure in WorkspaceProvider - passed through context build */
        host.projectMemory,
        project.path,
        memoryRetrieval,
      );
      host.setSessionMemoryDiagnostics(diagnostics);
      host.refreshSmartFileSelection(resolvedPrompt, memForPlan);
      host.commitContextCapture({
        operation: "pipeline_planner",
        provider: routing?.provider ?? settings.provider,
        model: routing?.model ?? activeProviderModel(settings),
        originalPrompt: resolvedPrompt,
        planContext: context,
        settings,
        estimatedAiCalls: estimateAiCalls(settings, "ai_plan"),
      });
      const result = await host.invokePlannerCall(settings, 1024, (provider) =>
        api.planWithProvider(provider, resolvedPrompt, context),
      );
      if (result?.ok) {
        host.setAiPlan(result);
        host.setAiPlanStatus("done");
        host.setSessionMemory((m) => recordAiPlan(m, resolvedPrompt, result));
      } else if (result) {
        host.setAiPlan(result);
        host.setAiPlanStatus("error");
      }
      return {
        result,
        contextSnapshotId: host.lastContextSnapshotIdRef.current,
        routing: {
          provider: result?.provider ?? routing?.provider ?? settings.provider,
          model: result?.model ?? routing?.model ?? activeProviderModel(settings),
        },
      };
    },
    runCoderPropose: async () => {
      await host.executeApplyPlan({ directRewrite: false, pipelineMode: true });
      const coderResult = host.pipelineCoderResultRef.current;
      if (!coderResult) {
        return {
          ok: false,
          error: "Coder stage did not complete",
          contextSnapshotId: null,
          routing: {
            provider: settings.provider,
            model: activeProviderModel(settings),
          },
          fileCount: 0,
        };
      }
      if (coderResult.ok) {
        host.setCenterTab("diff");
      }
      return {
        ok: coderResult.ok,
        ...(coderResult.error ? { error: coderResult.error } : {}),
        contextSnapshotId: coderResult.contextSnapshotId,
        routing: coderResult.routing,
        fileCount: coderResult.fileCount,
      };
    },
    runApplyAndVerify: async () => {
      const result = await host.applyApprovedPlanFiles({ pipelineMode: true });
      return {
        ok: result.ok,
        verification: result.verification,
        applied: result.applied,
        ...(result.error ? { error: result.error } : {}),
      };
    },
    runRepair: async (input) => {
      const routing = resolveStageRouting(settings, "repair");
      const failureLine =
        input.verification.typecheck.ok && input.verification.build.ok
          ? "Verification failed"
          : host.buildApplyPlanFailureReport({
              verification: input.verification,
              verifyErr: null,
            }).rootCauseLine;
      const repair = await host.startAutoFixAfterApply({
        verification: input.verification,
        applied: [...input.applied],
        prompt: input.prompt,
        planSummary: input.planSummary,
        planSource: input.planSource,
        failureLine,
      });
      return {
        ok: repair.ok,
        ...(repair.ok ? {} : { error: "Repair failed" }),
        verification: repair.verification,
        ...(repair.awaitingApproval ? { awaitingApproval: true } : {}),
        routing: {
          provider: routing?.provider ?? settings.provider,
          model: routing?.model ?? activeProviderModel(settings),
        },
      };
    },
    awaitReviewApproval: () => gates.awaitReviewApproval(),
    awaitRepairApproval: () => gates.awaitRepairApproval(),
    getMaxRepairAttempts: () => effectiveMaxRepairAttempts(settings),
  };
}

export async function runMultiAgentPipelineOrchestration(
  prompt: string,
  host: BuildPipelineHost | null,
  gates: PipelineReviewGates,
  callbacks: {
    setPipelineError: (message: string | null) => void;
    setPipelineRunning: (running: boolean) => void;
    setPipelineSession: (session: PipelineSession | null) => void;
    setRailTool: (tool: import("@/core/layout/types").RailTool) => void;
    onRunActiveChange: (active: boolean) => void;
  },
): Promise<void> {
  const resolvedHost = requireHost(host);
  const { api } = resolvedHost;
  const trimmed = prompt.trim();
  if (trimmed.length < 4) {
    callbacks.setPipelineError("Enter a goal with at least 4 characters.");
    return;
  }

  let settings: ProviderSettings;
  try {
    settings = normalizeProviderSettings(await api.getProviderSettings());
  } catch {
    callbacks.setPipelineError("Could not load provider settings.");
    return;
  }
  if (!isPipelineMode(settings)) {
    callbacks.setPipelineError("Enable Multi-Agent Pipeline mode in Providers.");
    return;
  }

  callbacks.setPipelineError(null);
  callbacks.setPipelineRunning(true);
  callbacks.onRunActiveChange(true);
  resolvedHost.setRailTool("pipeline");
  resolvedHost.beginStudioAction("multi_agent_pipeline", "pipeline", "Multi-Agent Pipeline started", {
    details: trimmed,
    patch: { workflow: { prompt: trimmed } },
  });

  const runnerDeps: PipelineRunnerDeps = {
    ...buildPipelineRunnerDeps(resolvedHost, settings, gates),
    onSessionUpdate: callbacks.setPipelineSession,
  };

  try {
    const session = await executeMultiAgentPipeline(trimmed, runnerDeps);
    recordPipelineRun(session, session.status === "completed");
    const pipelineDetail =
      session.error ?? session.stages.find((s) => s.error)?.error ?? null;
    resolvedHost.finishStudioAction(
      "multi_agent_pipeline",
      "pipeline",
      session.status === "completed",
      session.status === "completed"
        ? "Multi-Agent Pipeline completed"
        : session.status === "cancelled"
          ? "Multi-Agent Pipeline cancelled"
          : "Multi-Agent Pipeline failed",
      {
        ...(pipelineDetail ? { details: pipelineDetail } : {}),
        patch: {
          workflow: { prompt: trimmed, verificationOk: session.status === "completed" },
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Multi-Agent Pipeline failed";
    callbacks.setPipelineError(message);
    resolvedHost.finishStudioAction(
      "multi_agent_pipeline",
      "pipeline",
      false,
      "Multi-Agent Pipeline failed",
      { details: message },
    );
  } finally {
    callbacks.onRunActiveChange(false);
    callbacks.setPipelineRunning(false);
  }
}

export async function resumeMultiAgentPipelineOrchestration(
  session: PipelineSession,
  host: BuildPipelineHost | null,
  gates: PipelineReviewGates,
  callbacks: {
    setPipelineError: (message: string | null) => void;
    setPipelineRunning: (running: boolean) => void;
    setPipelineSession: (session: PipelineSession | null) => void;
    setRailTool: (tool: import("@/core/layout/types").RailTool) => void;
    onRunActiveChange: (active: boolean) => void;
  },
): Promise<void> {
  const resolvedHost = requireHost(host);
  const { api } = resolvedHost;

  let settings: ProviderSettings;
  try {
    settings = normalizeProviderSettings(await api.getProviderSettings());
  } catch {
    callbacks.setPipelineError("Could not load provider settings.");
    return;
  }
  if (!isPipelineMode(settings)) {
    callbacks.setPipelineError("Enable Multi-Agent Pipeline mode in Providers.");
    return;
  }

  callbacks.setPipelineError(null);
  callbacks.setPipelineRunning(true);
  callbacks.onRunActiveChange(true);
  resolvedHost.setRailTool("pipeline");
  resolvedHost.beginStudioAction(
    "multi_agent_pipeline",
    "pipeline",
    "Multi-Agent Pipeline resumed",
    {
      details: session.prompt,
      patch: { workflow: { prompt: session.prompt } },
    },
  );

  const runnerDeps: PipelineRunnerDeps = {
    ...buildPipelineRunnerDeps(resolvedHost, settings, gates),
    onSessionUpdate: callbacks.setPipelineSession,
  };

  try {
    const result = await resumeMultiAgentPipeline(session, runnerDeps);
    recordPipelineRun(result, result.status === "completed");
    const pipelineDetail =
      result.error ?? result.stages.find((s) => s.error)?.error ?? null;
    resolvedHost.finishStudioAction(
      "multi_agent_pipeline",
      "pipeline",
      result.status === "completed",
      result.status === "completed"
        ? "Multi-Agent Pipeline completed"
        : result.status === "cancelled"
          ? "Multi-Agent Pipeline cancelled"
          : "Multi-Agent Pipeline failed",
      {
        ...(pipelineDetail ? { details: pipelineDetail } : {}),
        patch: {
          workflow: {
            prompt: session.prompt,
            verificationOk: result.status === "completed",
          },
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Multi-Agent Pipeline resume failed";
    callbacks.setPipelineError(message);
    resolvedHost.finishStudioAction(
      "multi_agent_pipeline",
      "pipeline",
      false,
      "Multi-Agent Pipeline failed",
      { details: message },
    );
  } finally {
    callbacks.onRunActiveChange(false);
    callbacks.setPipelineRunning(false);
  }
}
