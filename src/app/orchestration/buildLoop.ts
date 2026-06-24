import { AGENT_PIPELINE_UNDERSTANDING } from "@/core/agent/agentUxLabels";
import { logEditPlan } from "@/core/agent/editPipelineLogs";
import { runProjectEditAudit } from "@/core/agent/projectEditAudit";
import {
  beginRunTimeline,
  failRunTimeline,
  recordRunTimelineStage,
} from "@/core/agent/runTimeline";
import { logEditStart } from "@/core/agent/projectIntentRouting";
import {
  incompleteGreenfieldEditBlockMessage,
  shouldBlockEditForIncompleteGreenfield,
} from "@/core/agent/greenfieldRecoveryRouting";

import { resolvePlannerSemanticBoostPaths } from "@/core/context/plannerSemanticBoost";
import { exploreRepositoryBeforeEdit } from "@/core/agent/editExploration";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { resolveEffectiveProjectScan } from "@/core/agent/resolveEffectiveProjectScan";
import { deriveBuildPhase, type BuildLoopMode, type BuildLoopStatus } from "@/core/build";
import { readUseAgentLoopForEdits } from "@/core/build/followUpAgentLoop";
import { formatApplyContinuationFailure } from "@/core/build/applyContinuation";
import { buildFollowUpActivityStream } from "@/core/build/followUpRun";
import {
  readFollowUpReviewFirst,
  shouldAutoContinueFollowUpApply,
} from "@/core/build/followUpPrefs";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import { logProviderSelected } from "@/core/providers/providerDiagnostics";
import {
  isPipelineMode,
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import {
  formatAiPlanPlannerDiagnostics,
  formatFollowUpPlannerFailureMessage,
} from "@/core/planner/aiPlanFailureMessage";
import type { PlanApplySession } from "@/core/planApply";
import type { BuildPipelineHost, BuildStatusInput } from "@/app/orchestration/types";

export function computeBuildStatus(input: BuildStatusInput): BuildLoopStatus {
  const phase = deriveBuildPhase({
    mode: input.mode,
    buildRunning: input.buildRunning,
    pipelineRunning: input.pipelineRunning,
    pipelineStatus: input.pipelineStatus,
    aiPlanStatus: input.aiPlanStatus,
    planApplyPhase: input.planApplyPhase,
    autoFixPhase: input.autoFixPhase,
  });
  return {
    mode: input.mode,
    phase,
    running: input.buildRunning || input.pipelineRunning,
    prompt: input.pipelinePrompt ?? input.lastPlanPrompt,
    error: input.buildError ?? input.pipelineError,
  };
}

async function executeSingleAgentFollowUp(
  host: BuildPipelineHost,
  trimmed: string,
  effectiveScan: NonNullable<ReturnType<typeof resolveEffectiveProjectScan>>,
): Promise<string | null> {
  host.appendGreenfieldRunLog("pipeline", "running", AGENT_PIPELINE_UNDERSTANDING);
  recordRunTimelineStage("audit_start");
  runProjectEditAudit(effectiveScan);
  host.syncAppContextBeforeEdit?.();
  recordRunTimelineStage("audit_complete");
  host.appendGreenfieldRunLog("pipeline", "success", AGENT_PIPELINE_UNDERSTANDING);

  recordRunTimelineStage("explore_start");
  const semanticBoostPaths = await resolvePlannerSemanticBoostPaths(
    host.api,
    trimmed,
    effectiveScan,
  );
  const repository = buildRepositoryIndex(effectiveScan);
  const explored = await exploreRepositoryBeforeEdit({
    api: host.api!,
    projectRoot: host.project!.path,
    repository,
    prompt: trimmed,
    semanticBoostPaths,
  });
  host.editExplorationContentsRef.current = explored;
  if (explored.length > 0) {
    host.appendGreenfieldRunLog(
      "pipeline",
      "success",
      `Explored ${explored.length} file(s) before planning`,
      explored.map((f) => f.path).join(", "),
    );
  }
  recordRunTimelineStage("explore_complete", String(explored.length));

  recordRunTimelineStage("plan_start");
  const planOut = host.createPlan(trimmed, semanticBoostPaths);
  if (planOut?.files.length) {
    logEditPlan(planOut.files.map((f) => f.path));
  }
  if (!planOut) {
    const err =
      host.createPlanErrorRef.current ?? "Could not create a plan for this prompt.";
    failRunTimeline(err);
    return err;
  }
  const planOk = await host.runAIPlan(trimmed);
  const aiPlan = host.aiPlanRef.current;
  const plannedPaths =
    aiPlan?.ok && aiPlan.plan?.files.length
      ? aiPlan.plan.files.map((file) => file.path)
      : planOut.files.map((file) => file.path);
  recordRunTimelineStage(
    "plan_complete",
    planOk ? plannedPaths.join(",") : "failed",
  );
  if (!planOk) {
    const err = formatFollowUpPlannerFailureMessage({
      aiPlan,
      createPlanError: host.createPlanErrorRef.current,
      planFileCount: planOut.files.length,
      route: "edit_follow_up",
      prompt: trimmed,
    });
    const diagnostics = formatAiPlanPlannerDiagnostics(aiPlan);
    host.appendGreenfieldRunLog("ai_plan", "failed", err, diagnostics || undefined);
    failRunTimeline(err);
    return err;
  }
  const autoContinue =
    shouldAutoContinueFollowUpApply(trimmed) || !readFollowUpReviewFirst();
  const applyResult = await host.startApplyPlan({ autoContinue });
  if (applyResult.waitingForReview) {
    recordRunTimelineStage("waiting_for_review", `${applyResult.validReady} file(s)`);
    host.releaseBuildRunForReview?.();
    return null;
  }
  const applyError = formatApplyContinuationFailure({
    applyResult,
    planFileCount: plannedPaths.length,
    autoContinue,
  });
  if (applyError) {
    host.appendGreenfieldRunLog("apply_plan", "failed", applyError);
    failRunTimeline(applyError);
    return applyError;
  }
  if (applyResult.validReady === 0 && applyResult.error) {
    failRunTimeline(applyResult.error);
    return applyResult.error;
  }
  if (applyResult.autoContinued && applyResult.applyOk === false && applyResult.error) {
    failRunTimeline(applyResult.error);
    return applyResult.error;
  }
  return null;
}

export async function runSingleAgentBuildLoop(
  prompt: string,
  host: BuildPipelineHost | null,
  callbacks: {
    setBuildRunning: (running: boolean) => void;
    setBuildError: (error: string | null) => void;
    setBuildMode: (mode: BuildLoopMode) => void;
    setCenterTab: BuildPipelineHost["setCenterTab"];
    setRailTool: BuildPipelineHost["setRailTool"];
    appendGreenfieldRunLog: BuildPipelineHost["appendGreenfieldRunLog"];
    runPipeline: (prompt: string) => Promise<void>;
    refreshProviderStatus?: () => Promise<void>;
  },
): Promise<void> {
  if (!host?.api) return;

  if (!host.project) {
    callbacks.setBuildError(
      "Open the project folder in Studio before requesting changes.",
    );
    return;
  }

  const effectiveScan = resolveEffectiveProjectScan({
    scan: host.scan,
    projectPath: host.project.path,
    greenfieldRun: host.greenfieldRun,
  });
  if (!effectiveScan) {
    callbacks.setBuildError(
      "Project index is not ready yet. Wait for scanning to finish, then try again.",
    );
    return;
  }

  const trimmed = prompt.trim();
  if (trimmed.length < 4) {
    callbacks.setBuildError("Enter a goal with at least 4 characters.");
    return;
  }

  if (
    shouldBlockEditForIncompleteGreenfield({
      projectPath: host.project.path,
      greenfieldRun: host.greenfieldRun,
    })
  ) {
    const blockMessage = incompleteGreenfieldEditBlockMessage(host.greenfieldRun);
    callbacks.setBuildError(blockMessage);
    callbacks.appendGreenfieldRunLog(
      "pipeline",
      "failed",
      "Edit blocked — incomplete greenfield recovery required",
      trimmed,
    );
    return;
  }

  host.clearRunContextForNewSubmit();

  const runBlockReason = host.getAgentRunBlockReason();
  if (runBlockReason) {
    callbacks.setBuildError(runBlockReason);
    return;
  }

  if (host.buildRunning || host.pipelineRunning) {
    callbacks.setBuildError("A follow-up run is already in progress.");
    return;
  }

  let settings;
  try {
    settings = normalizeProviderSettings(await host.api.getProviderSettings());
  } catch {
    callbacks.setBuildError("Could not load provider settings.");
    return;
  }

  const mode: BuildLoopMode = isPipelineMode(settings) ? "pipeline" : "single";
  callbacks.setBuildMode(mode);
  callbacks.setBuildError(null);

  for (const stage of ["planner", "coder", "repair"] as const) {
    logProviderSelected(settings, stage, "settings");
  }
  const plannerRouting = resolveStageRouting(settings, "planner");
  host.updateGreenfieldRun({
    actionType: "apply_plan",
    projectPath: host.project.path,
    runResult: "running",
    runStartedAt: Date.now(),
    endedAt: null,
    durationMs: null,
    appliedFileDiffs: [],
    provider: plannerRouting?.provider ?? settings.provider,
    model:
      plannerRouting?.model ?? modelForProvider(settings, settings.provider),
  });
  if (callbacks.refreshProviderStatus) {
    await callbacks.refreshProviderStatus();
  }

  logEditStart(host.project.path);
  beginRunTimeline({
    route: mode === "pipeline" ? "pipeline" : "edit_follow_up",
  });
  callbacks.appendGreenfieldRunLog("pipeline", "running", "[build] started", trimmed);

  if (mode === "pipeline") {
    await callbacks.runPipeline(trimmed);
    return;
  }

  if (readUseAgentLoopForEdits() && host.runAgentFollowUp) {
    callbacks.setBuildRunning(true);
    try {
      await host.runAgentFollowUp(trimmed);
      callbacks.setBuildError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Agent follow-up failed unexpectedly.";
      callbacks.setBuildError(message);
      host.recordFollowUpFailureMessage?.(message);
      failRunTimeline(message);
    } finally {
      callbacks.setBuildRunning(false);
      host.finalizeFollowUpActivityRun?.();
    }
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    callbacks.setBuildRunning(true);
    let error: string | null = null;
    try {
      error = await executeSingleAgentFollowUp(host, trimmed, effectiveScan);
    } catch (err) {
      error = err instanceof Error ? err.message : "Build loop failed unexpectedly.";
    } finally {
      callbacks.setBuildRunning(false);
      host.finalizeFollowUpActivityRun?.();
    }

    if (!error) {
      callbacks.setBuildError(null);
      return;
    }

    callbacks.setBuildError(error);
    host.recordFollowUpFailureMessage?.(error);
    failRunTimeline(error);

    if (attempt === 0 && host.attemptFollowUpAutoEscalation) {
      const escalated = await host.attemptFollowUpAutoEscalation(error);
      if (escalated) {
        callbacks.setBuildError(null);
        continue;
      }
    }
    return;
  }
}

/** Resume a single-agent build after restart when plan-apply was in flight. */
export async function resumeBuildReviewOrchestration(
  host: BuildPipelineHost | null,
  planApplySession: PlanApplySession,
  callbacks: {
    setBuildRunning: (running: boolean) => void;
    setBuildError: (error: string | null) => void;
    continueBuildAfterReview: () => Promise<void>;
  },
): Promise<void> {
  if (!host) return;
  callbacks.setBuildError(null);
  const phase = planApplySession.phase;

  if (phase === "review" || phase === "waiting_for_review") {
    return;
  }

  if (phase === "proposing") {
    callbacks.setBuildRunning(true);
    try {
      await host.executeApplyPlan({ directRewrite: false });
    } catch (err) {
      callbacks.setBuildError(
        err instanceof Error ? err.message : "Build resume failed during propose.",
      );
    } finally {
      callbacks.setBuildRunning(false);
      host.finalizeFollowUpActivityRun?.();
    }
    return;
  }

  if (phase === "applying" || phase === "verifying") {
    callbacks.setBuildRunning(true);
    try {
      const result = await host.applyApprovedPlanFiles();
      if (!result.ok) {
        callbacks.setBuildError(result.error ?? "Apply failed.");
      }
    } catch (err) {
      callbacks.setBuildError(
        err instanceof Error ? err.message : "Build resume failed during apply.",
      );
    } finally {
      callbacks.setBuildRunning(false);
      host.finalizeFollowUpActivityRun?.();
    }
  }
}

export { buildFollowUpActivityStream };
