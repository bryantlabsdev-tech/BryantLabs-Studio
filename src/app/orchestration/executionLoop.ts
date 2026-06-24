import { buildAgentApplyPlanContext } from "@/core/context/buildAgentContext";
import {
  completeExecutionStepAsNoOp,
  executionSessionAfterApplyPlanSuccess,
  isApplyPlanOrchestrationComplete,
  isNoOpExecutionError,
  recordNoChangeFailure,
  shouldStopNoChangeRetry,
} from "@/core/orchestration/applyPlanSuccess";
import {
  nextPendingStep,
  runExecutionStep,
  type ExecutionSession,
} from "@/core/execution";
import {
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import { verificationSummaryLines } from "@/core/studioRun/types";
import type { VerificationResult } from "@/types";
import {
  appendAgentFeed,
  appendAgentHistory,
  mergeAgentArtifacts,
  recordAgentDecision,
  setTimelineStage,
} from "@/core/agentWorkspace";
import type {
  ExecutionLoopResult,
  ExecutionOrchestrationHost,
} from "@/app/orchestration/executionTypes";

export async function executeMultiFileLoopOrchestration(
  host: ExecutionOrchestrationHost | null,
  initial: ExecutionSession,
): Promise<ExecutionLoopResult> {
  if (!host?.api || !host.scan || !host.project) {
    return {
      ok: false,
      verification: null,
      filesModified: [],
      error: "Project not ready.",
    };
  }
  const studioApi = host.api;
  const projectScan = host.scan;
  const workspaceVerification = host.verification;

  let settingsProvider: ProviderId = "ollama";
  let orchestrationSettings: ProviderSettings | null = null;
  try {
    const settings = normalizeProviderSettings(
      await studioApi.getProviderSettings(),
    );
    orchestrationSettings = settings;
    settingsProvider =
      resolveStageRouting(settings, "coder")?.provider ?? settings.provider;
  } catch {
    host.setExecutionError("Could not load provider settings.");
    return {
      ok: false,
      verification: null,
      filesModified: [],
      error: "Could not load provider settings.",
    };
  }

  const memoryRetrieval = host.resolveMemoriesForPrompt(
    initial.prompt,
    "apply_plan",
  );
  const context = buildAgentApplyPlanContext(projectScan, {
    userPrompt: initial.prompt,
    projectMemory: host.projectMemoryRef.current,
    sessionMemory: host.sessionMemory,
    projectPath: host.project?.path ?? null,
    memoryRetrieval,
  });
  const callbacks = {
    readFile: (absPath: string) => studioApi.readFile(absPath),
    proposePatch: (
      _provider: ProviderId,
      prompt: string,
      ctx: typeof context,
      target: { path: string; content: string },
      symbols: { name: string; kind: string }[],
      meta: { planSummary: string; fileReason: string },
    ) => {
      if (!orchestrationSettings) {
        return studioApi.proposePatch(
          settingsProvider,
          prompt,
          ctx,
          target,
          symbols,
          meta,
        );
      }
      return host.invokeCoderCall(orchestrationSettings, 4096, (provider) =>
        studioApi.proposePatch(
          provider,
          prompt,
          ctx,
          target,
          symbols,
          meta,
        ),
      ).then((result) => {
        if (!result) {
          throw new Error("AI call budget exceeded or run cancelled");
        }
        return result;
      });
    },
    applyEdit: (absPath: string, before: string, after: string) =>
      studioApi.applyEdit(absPath, before, after),
    createFile: (absPath: string, content: string) =>
      studioApi.createProjectFile(absPath, content),
  };

  let session: ExecutionSession = {
    ...initial,
    phase: "running",
    pausedAtStepId: null,
    applyError: null,
  };
  host.setExecutionSession(session);
  host.pushAgent((s) => {
    let n = setTimelineStage(s, "execution", "active");
    n = appendAgentFeed(
      n,
      "executing",
      "Multi-file execution",
      initial.planSummary,
    );
    n = appendAgentHistory(n, "execution", "Execution started", initial.prompt);
    for (const f of initial.files) {
      n = recordAgentDecision(n, f.relPath, f.planReason);
    }
    return n;
  });
  host.beginStudioAction(
    "multi_file_execution",
    "multi_file_execution",
    "Multi-file execution started",
    { details: initial.planSummary },
  );

  const cachedApply = host.applyPlanSuccessRef.current;
  if (cachedApply && isApplyPlanOrchestrationComplete(cachedApply)) {
    session = executionSessionAfterApplyPlanSuccess(
      session,
      cachedApply.filesWritten,
    );
    session = {
      ...session,
      phase: "done",
      verification: workspaceVerification ?? session.verification,
    };
    host.setExecutionSession(session);
    void host.runScan();
    host.pushAgent((s) => {
      let n = setTimelineStage(s, "execution", "done");
      n = setTimelineStage(n, "verification", "done");
      n = setTimelineStage(n, "complete", "done");
      return appendAgentFeed(
        n,
        "completed",
        "Execution skipped — Apply Plan already completed",
        cachedApply.filesWritten.join(", "),
      );
    });
    host.finishStudioAction(
      "multi_file_execution",
      "multi_file_execution",
      true,
      "Multi-file execution skipped — Apply Plan already completed",
      {
        details: cachedApply.filesWritten.join(", "),
        patch: {
          filesWritten: [...cachedApply.filesWritten],
          workflow: {
            prompt: session.prompt,
            planSummary: session.planSummary,
            planSource: session.planSource,
            verificationOk: true,
            errors: [],
          },
        },
      },
    );
    return {
      ok: true,
      verification: workspaceVerification ?? session.verification,
      filesModified: [...cachedApply.filesWritten],
    };
  }

  while (true) {
    if (host.applyPlanSuccessRef.current) {
      const snap = host.applyPlanSuccessRef.current;
      if (isApplyPlanOrchestrationComplete(snap)) {
        session = executionSessionAfterApplyPlanSuccess(
          session,
          snap.filesWritten,
        );
        host.setExecutionSession(session);
        break;
      }
    }

    const step = nextPendingStep(session.steps);
    if (!step) break;
    host.pushAgent((s) =>
      appendAgentFeed(
        s,
        "executing",
        step.title,
        step.filePaths.join(", "),
      ),
    );
    const result = await runExecutionStep(
      session,
      step,
      projectScan,
      settingsProvider,
      context,
      callbacks,
    );
    session = result.session;
    host.setExecutionSession(session);
    if (!result.ok) {
      const noOp = isNoOpExecutionError(result.error);
      const snap = host.applyPlanSuccessRef.current;
      if (noOp) {
        recordNoChangeFailure(host.executionNoChangeGuardRef.current, step.id);
      }
      const stopNoOp =
        noOp &&
        ((snap && isApplyPlanOrchestrationComplete(snap)) ||
          shouldStopNoChangeRetry(host.executionNoChangeGuardRef.current, step.id));
      if (stopNoOp) {
        session = completeExecutionStepAsNoOp(
          session,
          step.id,
          snap
            ? "No-op — changes already applied via Apply Plan"
            : "No-op — edit produced no changes (retry limit)",
        );
        host.setExecutionSession(session);
        host.appendGreenfieldRunLog(
          "multi_file_execution",
          "success",
          `Step skipped (no changes): ${step.title}`,
          {
            ...(result.error ? { details: result.error } : {}),
            failureRole: "skipped",
          },
        );
        continue;
      }
      host.finishStudioAction(
        "multi_file_execution",
        "multi_file_execution",
        false,
        "Execution paused — step failed",
        result.error ? { details: result.error } : undefined,
      );
      return {
        ok: false,
        verification: null,
        filesModified: session.diagnostics.filesModified,
        error: result.error ?? "Execution step failed",
      };
    }
  }

  session = { ...session, phase: "verifying", currentStepId: null };
  host.setExecutionSession(session);
  host.pushAgent((s) => {
    let n = setTimelineStage(s, "verification", "active");
    return appendAgentFeed(n, "verifying", "Running TypeScript", "npm run build");
  });

  let loopVerification: VerificationResult | null = null;
  let loopVerifyErr: string | null = null;
  try {
    const res = await studioApi.verify();
    if ("error" in res) {
      loopVerifyErr = res.error;
    } else {
      loopVerification = res;
      host.setVerification(res);
      host.setVerifyStatus("done");
    }
  } catch {
    loopVerifyErr = "Verification failed to run.";
  }

  const verLines = verificationSummaryLines(loopVerification);
  const overallOk = !loopVerifyErr && verLines.ok;
  session = {
    ...session,
    phase: "done",
    verification: loopVerification,
    applyError: overallOk ? null : loopVerifyErr ?? "Verification failed",
  };
  host.setExecutionSession(session);
  void host.runScan();

  host.pushAgent((s) => {
    let n = s;
    const verLine = overallOk
      ? "TypeScript and build passed"
      : (loopVerifyErr ?? "Verification failed");
    n = appendAgentHistory(n, "verification", "Verification", verLine);
    n = mergeAgentArtifacts(n, {
      filesModified: [...session.diagnostics.filesModified],
      verificationResults: [verLine],
    });
    if (overallOk) {
      n = setTimelineStage(n, "verification", "done");
      n = setTimelineStage(n, "complete", "done");
      n = appendAgentFeed(n, "completed", "Execution completed", verLine);
    }
    return n;
  });

  host.finishStudioAction(
    "multi_file_execution",
    "multi_file_execution",
    overallOk,
    overallOk ? "Multi-file execution completed" : "Execution finished with errors",
    {
      details: overallOk
        ? `${session.diagnostics.filesModified.length} file(s) · verification ok`
        : (loopVerifyErr ?? session.applyError ?? "Verification failed"),
      patch: {
        ...(loopVerification ? { verification: loopVerification } : {}),
        filesWritten: [...session.diagnostics.filesModified],
        workflow: {
          prompt: session.prompt,
          planSummary: session.planSummary,
          planSource: session.planSource,
          verificationOk: verLines.ok,
          errors: overallOk ? [] : [loopVerifyErr ?? "Verification failed"],
        },
      },
    },
  );

  return {
    ok: overallOk,
    verification: loopVerification,
    filesModified: session.diagnostics.filesModified,
    ...(overallOk
      ? {}
      : { error: loopVerifyErr ?? session.applyError ?? "Verification failed" }),
  };
}
