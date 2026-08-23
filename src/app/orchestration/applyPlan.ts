import {
  logPatchReadyForApply,
  logPatchReviewMode,
} from "@/core/agent/patchApplyLogs";
import {
  clearPatchGeneratedWatchdog,
  markPatchGenerated,
  notifyPatchApplyStageReached,
  startPatchApplyWatchdog,
} from "@/core/agent/patchApplyWatchdog";
import {
  failRunTimeline,
  recordRunTimelineStage,
} from "@/core/agent/runTimeline";
import {
  incompleteGreenfieldEditBlockMessage,
  greenfieldSetupReachedSuccess,
  shouldBlockEditForIncompleteGreenfield,
} from "@/core/agent/greenfieldRecoveryRouting";
import { resolveEffectiveProjectScan } from "@/core/agent/resolveEffectiveProjectScan";
import { logPatchGenerated } from "@/core/agent/projectIntentRouting";
import { mergeActiveEditorPath } from "@/core/context/activeEditorContext";
import { buildAgentApplyPlanContext } from "@/core/context/buildAgentContext";
import { readProjectRulesText } from "@/core/projectRules/readProjectRules";
import {
  readReferencedFileContents,
  resolveContextContentPathsAsync,
} from "@/core/context/referencedFileContext";
import { buildApplyPlanPatchContext } from "@/core/planner/context";
import {
  applyPremiumUiEditFallback,
  buildContextFailureMeta,
  enforceContextTokenBudget,
} from "@/core/contextEngine";
import type { ContextFailureMeta } from "@/core/contextEngine/types";
import { getIntelligenceHost } from "@/app/intelligence/intelligenceHost";
import {
  buildApplyPlanEditPhases,
  chunkTargetsForPhases,
  formatEditPhasePlanLog,
  shouldUseMultiPhaseEdit,
} from "@/app/orchestration/multiPhaseApplyPlan";
import { saveEditPhaseCheckpointLocal } from "@/core/editPhases/persistence";
import { markPhaseStatus } from "@/core/editPhases/planPhases";
import { recordPromptVisibility } from "@/core/intelligence/promptVisibility";
import { buildApplyPlanZeroProposalsReport, buildApplyPlanFailureReport } from "@/core/diagnostics/failureReport";
import { isEditablePath } from "@/core/editor";
import {
  estimateAiCalls,
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import { shouldRetryApplyPlanWithCompression, isTruncatedRequestBodyError } from "@/core/providers/reliability";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import { activeProviderModel } from "@/core/studioRun/types";
import {
  APPLY_PLAN_PATCH_FORMAT_ERROR,
  buildApplyPlanPatchFormatRootCause,
  buildGameplayAllowlist,
  buildNarrowedRetryTargets,
  buildPlanApplyTargetReport,
  buildPlanApplyProposalDiagnostics,
  collectPlanApplyTargets,
  computePlanApplyTotals,
  formatPlanApplyTargetReport,
  CONFIG_UI_BLOCK_MESSAGE,
  CREATE_TARGET_ACCEPTED_LABEL,
  CREATE_TARGET_REJECTED_LABEL,
  SCAFFOLD_TARGET_SKIPPED_LABEL,
  isBlockedNonUiTarget,
  isDirectRewritePatchTarget,
  isUiCorePatchTarget,
  classifyApplyIntent,
  gameplayPromptNeedsStylesheet,
  isUiOnlyApplyPrompt,
  normalizeApplyPlanPath,
  resolveUserPlanPrompt,
  validateProposalQuality,
  validateCreateProposalQuality,
  detectSatisfiedGameplayFeature,
  withAllReadyFilesApproved,
  type ApplyPlanBatchPatchResult,
  type PlanApplyFileEntry,
  type PlanApplySession,
} from "@/core/planApply";
import {
  evaluateIncompleteCoordinatedApply,
} from "@/core/planApply/coordinatedEditCompletion";
import { buildUiAuditFixDeterministicPatches } from "@/core/planApply/uiAuditFixDeterministicFallback";
import {
  formatAiCallBudgetDiagnostics,
  formatApplyPatchBudgetFailureMessage,
  readAiCallBudgetDiagnostics,
} from "@/core/providers/aiCallBudgetDiagnostics";
import type { PatchTargetFile } from "@/core/planner/aiTypes";
import type { BryantLabsApi, ProjectInfo, ProjectScan, ReadFileResult } from "@/types";
import type { Plan } from "@/core/planner";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import { recordProviderUsage } from "@/core/sessionMemory";
import { applyApprovedPlanFilesOrchestration } from "@/app/orchestration/applyPlanApply";
import { readFollowUpReviewFirst } from "@/core/build/followUpPrefs";
import { stagePlanApplyShadowRun } from "@/app/orchestration/shadowStage";

/** Max target-file size we will send for an Apply Plan batch proposal (chars). */
export const MAX_AI_PATCH_CHARS = 60_000;

export interface ExecuteApplyPlanOptions {
  readonly directRewrite: boolean;
  readonly pipelineMode?: boolean;
  /** When true, approve and apply immediately after successful propose. Defaults to auto-apply. */
  readonly autoContinue?: boolean;
}

export interface ExecuteApplyPlanResult {
  readonly validReady: number;
  readonly autoContinued: boolean;
  readonly waitingForReview?: boolean;
  readonly applyOk?: boolean;
  readonly error?: string;
  /** True when the requested feature is already present — run succeeded without patches. */
  readonly featureAlreadySatisfied?: boolean;
}

const EMPTY_RESULT: ExecuteApplyPlanResult = {
  validReady: 0,
  autoContinued: false,
};

type ResolvedApplyPlanHost = ApplyPlanOrchestrationHost & {
  api: BryantLabsApi;
  project: ProjectInfo;
  scan: ProjectScan;
  plan: Plan;
};

function resolveActivePlan(host: ApplyPlanOrchestrationHost): Plan | null {
  return host.planRef.current ?? host.plan;
}

export async function executeApplyPlanOrchestration(
  host: ApplyPlanOrchestrationHost | null,
  opts: ExecuteApplyPlanOptions,
): Promise<ExecuteApplyPlanResult> {
  const plan = host ? resolveActivePlan(host) : null;
  const effectiveScan =
    host?.project != null
      ? resolveEffectiveProjectScan({
          scan: host.scan,
          projectPath: host.project.path,
          ...(host.greenfieldRun ? { greenfieldRun: host.greenfieldRun } : {}),
          persistedModifiedFiles: host.sessionMemory.modifiedFiles,
        })
      : null;

  if (!host?.api || !host.project || !plan) {
    return {
      ...EMPTY_RESULT,
      error: plan
        ? "Apply prerequisites missing (project or scan not ready)."
        : "Apply prerequisites missing (deterministic plan not ready).",
    };
  }

  if (
    host.greenfieldRun &&
    shouldBlockEditForIncompleteGreenfield({
      projectPath: host.project.path,
      greenfieldRun: host.greenfieldRun,
    })
  ) {
    const blockMessage = incompleteGreenfieldEditBlockMessage(host.greenfieldRun);
    host.setPlanApplyError(blockMessage);
    return { ...EMPTY_RESULT, error: blockMessage };
  }

  if (!effectiveScan) {
    return {
      ...EMPTY_RESULT,
      error: "Apply prerequisites missing (project or scan not ready).",
    };
  }

  const resolved = { ...host, plan, scan: effectiveScan } as ResolvedApplyPlanHost;

  const directRewrite = opts.directRewrite;
  const pipelineMode = opts.pipelineMode ?? false;
  const autoContinue = opts.autoContinue ?? !readFollowUpReviewFirst();

  if (pipelineMode) {
    resolved.pipelineCoderResultRef.current = null;
  }

  if (!directRewrite) {
    resolved.applyPlanSuccessRef.current = null;
    resolved.executionNoChangeGuardRef.current.clear();
    resolved.setPlanApplyError(null);
    resolved.updateGreenfieldRun({ failureReport: null });
  }

  const studioApi = resolved.api;
  const projectScan = resolved.scan;
  const userPrompt = resolveUserPlanPrompt(plan, resolved.lastPlanPrompt);
  if (!userPrompt) {
    resolved.setPlanApplyError(
      "Enter your change request in the Plan tab (not a terminal command), then Analyze & plan.",
    );
    return { ...EMPTY_RESULT, error: "No change request for this follow-up." };
  }

  const collected = collectPlanApplyTargets(
    resolved.planRef.current ?? plan,
    resolved.aiPlanRef.current ?? resolved.aiPlan,
    projectScan,
    userPrompt,
    {
      projectPath: resolved.project.path,
      projectMemory: resolved.projectMemory,
      sessionMemory: resolved.sessionMemory,
    },
  );
  let { prompt, summary, source, targets, skipped } = collected;
  const targetReport = buildPlanApplyTargetReport({
    plan,
    aiPlan: resolved.aiPlanRef.current ?? resolved.aiPlan,
    targets,
    skipped,
  });
  resolved.appendGreenfieldRunLog(
    "apply_plan",
    "running",
    "Apply targets resolved",
    formatPlanApplyTargetReport(targetReport),
  );
  for (const target of targets) {
    if (target.action === "create") {
      resolved.appendGreenfieldRunLog(
        "apply_plan",
        "success",
        CREATE_TARGET_ACCEPTED_LABEL,
        target.relPath,
      );
    }
  }
  for (const msg of skipped) {
    if (msg.includes(SCAFFOLD_TARGET_SKIPPED_LABEL)) {
      resolved.appendGreenfieldRunLog("apply_plan", "success", SCAFFOLD_TARGET_SKIPPED_LABEL, msg);
    } else if (msg.includes(CREATE_TARGET_REJECTED_LABEL)) {
      resolved.appendGreenfieldRunLog("apply_plan", "success", CREATE_TARGET_REJECTED_LABEL, msg);
    }
  }

  if (directRewrite && resolved.planApplySession) {
    prompt = resolved.planApplySession.prompt;
    summary = resolved.planApplySession.planSummary;
    source = resolved.planApplySession.planSource;
    skipped = [];
  }

  const applyIntent = classifyApplyIntent(prompt);
  const uiOnlyPrompt = applyIntent.intent === "small_ui";
  const gameplayPrompt = applyIntent.gameplay;

  if (directRewrite && resolved.planApplySession) {
    targets = resolved.planApplySession.files
      .filter(
        (f) =>
          f.absPath &&
          f.status !== "skipped" &&
          isDirectRewritePatchTarget(
            f.relPath,
            gameplayPrompt,
            f.action ?? "modify",
          ),
      )
      .map((f) => {
        const selectionReason = f.selectionReason || "Direct rewrite target";
        const planReason = f.planReason || selectionReason;
        return {
          relPath: f.relPath,
          absPath: f.absPath,
          action: f.action ?? "modify",
          selectionReason,
          planReason,
          reason: planReason,
        };
      });
  }

  const routingFilesAllowed = uiOnlyPrompt
    ? targets.filter((t) => isUiCorePatchTarget(t.relPath)).map((t) => t.relPath)
    : gameplayPrompt
      ? buildGameplayAllowlist(projectScan, prompt.toLowerCase()).map((t) => t.relPath)
      : targets.map((t) => t.relPath);

  console.log(
    `[routing:intent] intent=${applyIntent.intent} reason=${applyIntent.reason} files=${routingFilesAllowed.join(",")}`,
  );

  const routingIntentPatch = {
    intent: applyIntent.intent,
    reason: applyIntent.reason,
    files_allowed: routingFilesAllowed,
  };

  const patchTargetCount = uiOnlyPrompt
    ? targets.filter((t) => isUiCorePatchTarget(t.relPath)).length
    : targets.length;

  if (patchTargetCount === 0) {
    const err =
      skipped.length > 0
        ? `No plan files could be resolved. ${skipped.join("; ")}`
        : "No files in the plan to apply.";
    resolved.setPlanApplyError(err);
    resolved.finishStudioAction("apply_plan", "apply_plan", false, "Apply Plan — no targets", {
      details: err,
      patch: {
        workflow: {
          prompt,
          planSource: source,
          errors: [err],
          routingIntent: routingIntentPatch,
        },
      },
    });
    return { ...EMPTY_RESULT, error: err };
  }

  if (!directRewrite && gameplayPrompt) {
    const appEntry = projectScan.files.find(
      (f) => normalizeApplyPlanPath(f.path) === "src/App.tsx",
    );
    if (appEntry) {
      const read = await studioApi.readFile(appEntry.absPath);
      if (read.readable && read.content) {
        const satisfied = detectSatisfiedGameplayFeature(prompt, {
          "src/App.tsx": read.content,
        });
        if (satisfied) {
          const detail = satisfied.message;
          if (!pipelineMode) {
            resolved.beginStudioAction(
              "apply_plan",
              "apply_plan",
              "Apply Plan — feature already present",
              {
                details: detail,
                patch: {
                  workflow: {
                    prompt,
                    planSource: source,
                    planSummary: summary,
                    filesProposed: 0,
                    filesAccepted: 0,
                    filesWritten: [],
                    linesAdded: 0,
                    linesRemoved: 0,
                    errors: [],
                    routingIntent: {
                      ...routingIntentPatch,
                      files_written: [],
                    },
                  },
                },
              },
            );
            resolved.finishStudioAction(
              "apply_plan",
              "apply_plan",
              true,
              "Feature already implemented",
              {
                details: detail,
                patch: {
                  finalMessage: detail,
                  workflow: {
                    prompt,
                    planSource: source,
                    planSummary: summary,
                    filesProposed: 0,
                    filesAccepted: 0,
                    filesWritten: [],
                    linesAdded: 0,
                    linesRemoved: 0,
                    errors: [],
                    routingIntent: {
                      ...routingIntentPatch,
                      files_written: [],
                    },
                  },
                },
              },
            );
          }
          recordRunTimelineStage("patch_generated", "feature_already_present");
          if (pipelineMode) {
            resolved.pipelineCoderResultRef.current = {
              ok: true,
              fileCount: 0,
              routing: {
                provider: "ollama",
                model: "feature_already_present",
              },
              contextSnapshotId: resolved.lastContextSnapshotIdRef.current,
            };
          }
          return {
            validReady: 0,
            autoContinued: false,
            featureAlreadySatisfied: true,
          };
        }
      }
    }
  }

  const runId = resolved.beginApplyPlanRun();
  const staleResult = (detail?: string) => {
    if (!resolved.isStaleApplyPlanRun(runId)) return false;
    resolved.ignoreStaleApplyPlanResult(runId, detail);
    return true;
  };

  let sessionFiles: PlanApplyFileEntry[];
  let applySession: PlanApplySession;

  if (directRewrite && resolved.planApplySession) {
    sessionFiles = resolved.planApplySession.files.map((f) => {
      const eligible =
        f.absPath &&
        isDirectRewritePatchTarget(
          f.relPath,
          gameplayPrompt,
          f.action ?? "modify",
        );
      if (!eligible) return f;
      const {
        error: _e,
        rejectionReason: _r,
        proposal: _p,
        patchGenerated: _g,
        diffStats: _d,
        basisContent: _b,
        ...rest
      } = f;
      return {
        ...rest,
        status: "pending" as const,
        decision: "pending" as const,
      };
    });
    resolved.setPlanApplyError(null);
    applySession = {
      ...resolved.planApplySession,
      applyRunId: runId,
      files: sessionFiles,
      phase: "proposing",
      directRewriteAvailable: false,
      lastModelRawText: null,
    };
    resolved.setPlanApplySession(applySession);
  } else {
    const initialFiles: PlanApplyFileEntry[] = [
      ...targets.map((t) => ({
        relPath: t.relPath,
        absPath: t.absPath,
        action: t.action ?? "modify",
        selectionReason: t.selectionReason,
        planReason: t.planReason,
        ...(t.relevanceScore !== undefined ? { relevanceScore: t.relevanceScore } : {}),
        ...(t.symbolMatches && t.symbolMatches.length > 0
          ? { symbolMatches: t.symbolMatches }
          : {}),
        status: "pending" as const,
        decision: "pending" as const,
      })),
      ...skipped.map((msg) => ({
        relPath: msg.split(":")[0]?.trim() ?? msg,
        absPath: "",
        selectionReason: "",
        planReason: "",
        status: "skipped" as const,
        decision: "rejected" as const,
        error: msg,
      })),
    ];
    sessionFiles = initialFiles;
    resolved.setPlanApplyError(null);
    applySession = {
      applyRunId: runId,
      prompt,
      planSummary: summary,
      planSource: source,
      applyTargetCount: patchTargetCount,
      applySkippedCount: skipped.length,
      files: initialFiles,
      phase: "proposing",
      selectedRelPath: targets[0]?.relPath ?? null,
      applyError: null,
      verification: null,
      totals: null,
      directRewriteAvailable: false,
      lastModelRawText: null,
    };
    resolved.setPlanApplySession(applySession);
  }
  if (!autoContinue) {
    resolved.setCenterTab("diff");
  }
  const targetSummary =
    skipped.length > 0
      ? `${patchTargetCount} patch target(s), ${skipped.length} skipped from plan`
      : `${patchTargetCount} patch target(s)`;

  if (!pipelineMode) {
    resolved.beginStudioAction("apply_plan", "apply_plan", "Apply Plan — proposing patches", {
      details: `${targetSummary} · source: ${source} · intent=${applyIntent.intent}`,
      patch: {
        workflow: {
          prompt,
          planSource: source,
          planSummary: summary,
          filesProposed: 0,
          filesAccepted: 0,
          filesWritten: [],
          linesAdded: 0,
          linesRemoved: 0,
          errors: [],
          routingIntent: routingIntentPatch,
        },
      },
    });
  }
  recordRunTimelineStage("coder_start", `${patchTargetCount} target(s)`);

  const uiAuditSummary = resolved.uiAuditResult
    ? `type=${resolved.uiAuditResult.type} score=${resolved.uiAuditResult.score} issues=${resolved.uiAuditResult.issues.length}`
    : null;

  const memoryRetrieval = uiOnlyPrompt
    ? null
    : resolved.resolveMemoriesForPrompt(prompt, "apply_plan");
  const intelHost = uiOnlyPrompt ? null : getIntelligenceHost();
  const intelligence =
    intelHost?.buildIntelligenceForOperation({
      prompt,
      operation: pipelineMode ? "pipeline_coder" : "apply_plan",
      ...(memoryRetrieval ? { memoryRetrieval } : {}),
    }) ?? null;
  const projectRules = await readProjectRulesText(studioApi, resolved.project.path);
  const contextBase = uiOnlyPrompt
    ? buildApplyPlanPatchContext(projectScan)
    : buildAgentApplyPlanContext(projectScan, {
        userPrompt: prompt,
        projectMemory: resolved.projectMemory,
        sessionMemory: resolved.sessionMemory,
        projectPath: resolved.project.path,
        slim: false,
        projectRules,
        ...(memoryRetrieval ? { memoryRetrieval } : {}),
        ...(intelligence ? { intelligence } : {}),
      });
  const contentPaths = uiOnlyPrompt
    ? []
    : mergeActiveEditorPath(
        await resolveContextContentPathsAsync(
          prompt,
          projectScan,
          studioApi,
          contextBase.relevantFiles,
        ),
        resolved.activeEditorContextRef?.current?.relPath,
        prompt,
      );
  const referencedContents =
    contentPaths.length > 0
      ? await readReferencedFileContents(studioApi, resolved.project.path, contentPaths)
      : [];
  const context =
    referencedContents.length > 0
      ? buildAgentApplyPlanContext(projectScan, {
          userPrompt: prompt,
          projectMemory: resolved.projectMemory,
          sessionMemory: resolved.sessionMemory,
          projectPath: resolved.project.path,
          slim: false,
          referencedContents,
          projectRules,
          ...(memoryRetrieval ? { memoryRetrieval } : {}),
          ...(intelligence ? { intelligence } : {}),
        })
      : contextBase;
  const intelligenceBlock = uiOnlyPrompt ? "" : (intelligence?.promptBlock ?? "");
  let contextFailureMeta: ContextFailureMeta | null = null;
  let settingsProvider: ProviderId = "ollama";
  let applyPlanSettings: ProviderSettings | null = null;
  let coderRoutingModel = "";
  try {
    let settings = normalizeProviderSettings(await studioApi.getProviderSettings());
    if (intelHost) {
      const routed = await intelHost.applyComplexityRouting(
        prompt,
        patchTargetCount,
        settings,
      );
      settings = routed.settings;
      resolved.appendGreenfieldRunLog(
        "apply_plan",
        "running",
        `Complexity advisory: ${routed.decision.tier} · ${routed.decision.provider} · ${routed.decision.model}`,
        routed.decision.reason,
      );
    }
    applyPlanSettings = settings;
    const routing = resolveStageRouting(settings, "coder");
    settingsProvider = routing?.provider ?? settings.provider;
    coderRoutingModel = routing?.model ?? activeProviderModel(settings);
    const estimatedCalls = estimateAiCalls(settings, "apply_plan", {
      fileCount: patchTargetCount,
    });
    resolved.updateGreenfieldRun({
      provider: settingsProvider,
      model: routing?.model ?? activeProviderModel(settings),
    });
    resolved.appendGreenfieldRunLog(
      "apply_plan",
      "running",
      `Estimated AI calls: ${estimatedCalls}`,
      `Max ${settings.maxAiCalls} per run`,
    );
    const patchBudgetDiagnostics = readAiCallBudgetDiagnostics(
      resolved.aiCallTrackerRef.current,
      settings,
      1,
    );
    resolved.appendGreenfieldRunLog(
      "apply_plan",
      "running",
      "Patch generation budget",
      formatAiCallBudgetDiagnostics(patchBudgetDiagnostics),
    );
    const coderPromptPreview = [prompt, "", intelligenceBlock].join("\n");
    recordPromptVisibility({
      stage: "coder",
      prompt: coderPromptPreview,
      provider: settingsProvider,
      model: coderRoutingModel,
    });
    resolved.commitContextCapture({
      operation: pipelineMode ? "pipeline_coder" : "apply_plan",
      provider: settingsProvider,
      model: routing?.model ?? activeProviderModel(settings),
      originalPrompt: prompt,
      planContext: context,
      settings,
      estimatedAiCalls: estimatedCalls,
      expandedPrompt: coderPromptPreview,
    });
  } catch {
    const err = "Could not load provider settings.";
    if (staleResult("provider settings")) return EMPTY_RESULT;
    resolved.setPlanApplyError(err);
    resolved.setPlanApplySession((prev) =>
      prev ? { ...prev, phase: "review" } : prev,
    );
    resolved.finishStudioAction("apply_plan", "apply_plan", false, "Apply Plan failed", {
      details: err,
      patch: {
        workflow: {
          prompt,
          planSource: source,
          errors: [err],
          routingIntent: routingIntentPatch,
        },
      },
    });
    return { ...EMPTY_RESULT, error: err };
  }

  function updatePlanApplyFile(relPath: string, patch: Partial<PlanApplyFileEntry>) {
    if (resolved.isStaleApplyPlanRun(runId)) return;
    sessionFiles = sessionFiles.map((f) =>
      f.relPath === relPath ? { ...f, ...patch } : f,
    );
    applySession = { ...applySession, files: sessionFiles };
    resolved.setPlanApplySession(applySession);
  }

  const countValidProposals = () =>
    sessionFiles.filter((f) => f.status === "ready" && f.diffStats?.changed).length;

  function markEntriesProposing(relPaths: readonly string[]) {
    if (resolved.isStaleApplyPlanRun(runId)) return;
    const set = new Set(relPaths);
    resolved.setPlanApplySession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map((f) =>
          set.has(f.relPath) ? { ...f, status: "proposing" as const } : f,
        ),
      };
    });
  }

  async function prepareBatchTargets(
    entries: readonly PlanApplyFileEntry[],
  ): Promise<{ batch: PatchTargetFile[]; entryByPath: Map<string, PlanApplyFileEntry> }> {
    const batch: PatchTargetFile[] = [];
    const entryByPath = new Map<string, PlanApplyFileEntry>();

    for (const entry of entries) {
      if (entry.status !== "pending") continue;

      const pathCheck = isEditablePath(entry.relPath);
      if (!pathCheck.ok) {
        updatePlanApplyFile(entry.relPath, {
          status: "skipped",
          decision: "rejected",
          error: pathCheck.reason ?? "Not editable",
        });
        continue;
      }

      if (isUiOnlyApplyPrompt(prompt) && isBlockedNonUiTarget(entry.relPath)) {
        updatePlanApplyFile(entry.relPath, {
          status: "skipped",
          decision: "rejected",
          error: CONFIG_UI_BLOCK_MESSAGE,
        });
        continue;
      }

      const isCreate = (entry.action ?? "modify") === "create";
      if (isCreate) {
        const rel = normalizeApplyPlanPath(entry.relPath);
        batch.push({ path: rel, content: "" });
        entryByPath.set(rel, entry);
        continue;
      }

      let readResult: ReadFileResult;
      try {
        readResult = await studioApi.readFile(entry.absPath);
      } catch {
        updatePlanApplyFile(entry.relPath, {
          status: "error",
          decision: "rejected",
          error: "Failed to read file.",
        });
        continue;
      }

      if (!readResult.readable || readResult.content === undefined) {
        updatePlanApplyFile(entry.relPath, {
          status: "skipped",
          decision: "rejected",
          error: readResult.reason ?? "File is not readable.",
        });
        continue;
      }

      const content = readResult.content;
      if (content.length > MAX_AI_PATCH_CHARS) {
        updatePlanApplyFile(entry.relPath, {
          status: "skipped",
          decision: "rejected",
          error: `File exceeds ${Math.round(MAX_AI_PATCH_CHARS / 1000)}k character limit.`,
        });
        continue;
      }

      const rel = normalizeApplyPlanPath(entry.relPath);
      batch.push({ path: rel, content });
      entryByPath.set(rel, entry);
    }

    return { batch, entryByPath };
  }

  function applyBatchPatchResult(
    batchResult: ApplyPlanBatchPatchResult,
    entryByPath: Map<string, PlanApplyFileEntry>,
    basisByPath: Map<string, string>,
  ) {
    const formatError =
      !batchResult.ok && batchResult.errorCode === APPLY_PLAN_PATCH_FORMAT_ERROR;
    const formatMessage = formatError
      ? buildApplyPlanPatchFormatRootCause([...entryByPath.keys()])
      : (batchResult.error ?? "Patch proposal failed.");

    for (const [relPath, entry] of entryByPath) {
      const basis = basisByPath.get(relPath);
      if (basis === undefined) continue;

      const newContent = batchResult.files?.[relPath];
      if (newContent !== undefined) {
        const quality =
          entry.action === "create"
            ? validateCreateProposalQuality(newContent, relPath, projectScan)
            : validateProposalQuality(basis, newContent, relPath, projectScan);
        if (!quality.ok) {
          updatePlanApplyFile(entry.relPath, {
            status: "error",
            decision: "rejected",
            error: quality.reason,
            rejectionReason: quality.reason,
            patchGenerated: true,
            basisContent: basis,
          });
          continue;
        }
        updatePlanApplyFile(entry.relPath, {
          status: "ready",
          decision: "pending",
          basisContent: basis,
          proposal: {
            summary: "Apply Plan patch",
            newContent,
            reasoning: "",
            risks: [],
          },
          patchGenerated: true,
          diffStats: quality.stats,
        });
        continue;
      }

      const missing = batchResult.missingPaths?.includes(relPath);
      const err = missing
        ? `Missing @@FILE block for ${relPath} in model response.`
        : formatError
          ? `${APPLY_PLAN_PATCH_FORMAT_ERROR}: ${formatMessage}`
          : (batchResult.error ?? "Patch proposal failed.");
      updatePlanApplyFile(entry.relPath, {
        status: "error",
        decision: "rejected",
        error: err,
        rejectionReason: err,
        basisContent: basis,
        patchGenerated: Boolean(batchResult.rawText),
      });
    }
  }

  async function runProposalPass(
    entries: readonly PlanApplyFileEntry[],
    passOpts?: { readonly forceCompressed?: boolean },
  ): Promise<ApplyPlanBatchPatchResult | null> {
    const pending = entries.filter(
      (f) => f.status === "pending" || f.status === "proposing",
    );
    if (pending.length === 0) return null;

    const { batch, entryByPath } = await prepareBatchTargets(pending);
    if (batch.length === 0) return null;

    const apiBatch = uiOnlyPrompt
      ? batch.filter((f) => isUiCorePatchTarget(f.path))
      : gameplayPrompt && !gameplayPromptNeedsStylesheet(prompt)
        ? batch.filter((f) => normalizeApplyPlanPath(f.path) !== "src/index.css")
        : batch;
    if (apiBatch.length === 0) return null;

    if (gameplayPrompt && !gameplayPromptNeedsStylesheet(prompt)) {
      for (const [relPath, entry] of entryByPath) {
        if (normalizeApplyPlanPath(relPath) !== "src/index.css") continue;
        updatePlanApplyFile(entry.relPath, {
          status: "skipped",
          decision: "rejected",
          error: "Stylesheet omitted — gameplay logic edit does not require CSS changes.",
        });
      }
    }

    markEntriesProposing(apiBatch.map((f) => f.path));

    const basisByPath = new Map(batch.map((f) => [f.path, f.content] as const));

    const apiEntryByPath = new Map<string, PlanApplyFileEntry>();
    const apiBasisByPath = new Map<string, string>();
    for (const f of apiBatch) {
      const entry = entryByPath.get(f.path);
      if (entry) apiEntryByPath.set(f.path, entry);
      const basis = basisByPath.get(f.path);
      if (basis !== undefined) apiBasisByPath.set(f.path, basis);
    }

    async function proposeWithContext(
      compressed: boolean,
    ): Promise<ApplyPlanBatchPatchResult | null> {
      const budget = enforceContextTokenBudget({
        input: {
          userPrompt: prompt,
          planSummary: summary,
          taskType: uiOnlyPrompt
            ? "ui_edit"
            : gameplayPrompt
              ? "gameplay_edit"
              : "apply_plan",
          scan: projectScan,
          projectMemory: resolved.projectMemory,
          patchFiles: apiBatch.map((f) => ({ path: f.path, content: f.content })),
          uiAuditSummary,
          compressed,
          directRewrite,
        },
        provider: settingsProvider,
        stage: "coder",
        userPrompt: prompt,
      });

      if (compressed) {
        contextFailureMeta = buildContextFailureMeta(
          budget.package.estimatedTokens,
          budget.limit,
          true,
        );
      }

      if (!budget.withinLimit) {
        contextFailureMeta = buildContextFailureMeta(
          budget.package.estimatedTokens,
          budget.limit,
          compressed,
        );
        return null;
      }

      const ctx = budget.package;
      const promptFiles = ctx.patchFiles.map((f) => ({
        path: f.path,
        content: f.content,
      }));
      const promptEntryByPath = new Map<string, PlanApplyFileEntry>();
      const promptBasisByPath = new Map<string, string>();
      for (const f of promptFiles) {
        const entry = apiEntryByPath.get(f.path);
        if (entry) promptEntryByPath.set(f.path, entry);
        const basis = apiBasisByPath.get(f.path);
        if (basis !== undefined) promptBasisByPath.set(f.path, basis);
      }

      const invoke = async (provider: ProviderId) => {
        // eslint-disable-next-line no-console
        console.error(
          `[apply_plan:ipc:start] provider=${provider} files=${promptFiles.length}`,
        );
        // Paths only — main hydrates from disk. Serialize via JSON string IPC
        // (providers:applyPlanBatchJson) to avoid Chromium structured-clone hangs.
        const ipcFiles = promptFiles.map((f) => {
          const entry = promptEntryByPath.get(f.path);
          const isCreate = (entry?.action ?? "modify") === "create";
          return {
            path: f.path,
            content: "",
            ...(entry?.absPath && !isCreate ? { absPath: entry.absPath } : {}),
          };
        });
        const ipcContext = {
          framework: ctx.context.framework,
          language: ctx.context.language,
          bundler: ctx.context.bundler,
          packageManager: ctx.context.packageManager,
          entryPoints: (ctx.context.entryPoints ?? []).slice(0, 4),
          repositorySummary: String(ctx.context.repositorySummary ?? "").slice(0, 800),
          dependencies: [] as string[],
          totalFiles: ctx.context.totalFiles,
          totalFolders: ctx.context.totalFolders,
          files: [] as [],
          symbols: [] as [],
        };
        // Serialize in the renderer so only a string crosses contextBridge.
        // Passing file/context objects into preload was hanging Chromium clone.
        let payloadJson: string;
        try {
          payloadJson = JSON.stringify({
            provider,
            prompt,
            context: ipcContext,
            files: ipcFiles,
            meta: {
              planSummary: String(ctx.planSummary ?? prompt).slice(0, 1_500),
              targetPaths: promptFiles.map((f) => f.path),
              slimContext: true,
              ...(directRewrite ? { directRewrite: true } : {}),
              intelligenceBlock: String(ctx.intelligenceBlock ?? "").slice(0, 2_000),
              contextNotes: String(ctx.contextNotes ?? "").slice(0, 2_000),
              ...(ctx.uiEditMode ? { uiEditMode: true } : {}),
            },
          });
        } catch (err) {
          return {
            ok: false as const,
            provider,
            model: "",
            raw: null,
            latencyMs: 0,
            error: `Failed to serialize apply-plan payload: ${err instanceof Error ? err.message : String(err)}`,
            missingPaths: promptFiles.map((f) => f.path),
          };
        }
        // eslint-disable-next-line no-console
        console.error(
          `[apply_plan:ipc:json] bytes=${payloadJson.length} files=${ipcFiles.length}`,
        );
        const result = await studioApi.proposeApplyPlanPatchesJson(payloadJson);
        // eslint-disable-next-line no-console
        console.error(
          `[apply_plan:ipc:done] ok=${Boolean(result && typeof result === "object" && "ok" in result ? (result as { ok?: boolean }).ok : result)}`,
        );
        return result;
      };

      const batchResult = applyPlanSettings
        ? await resolved.invokeCoderCall(
            applyPlanSettings,
            ctx.estimatedTokens,
            invoke,
            {
              promptPayload: ctx.promptPreview,
              patchSize: uiOnlyPrompt ? "small" : "large",
              skipSmartRetry: true,
            },
          )
        : await invoke(settingsProvider);

      if (
        batchResult &&
        !batchResult.ok &&
        shouldRetryApplyPlanWithCompression(batchResult.error) &&
        !compressed
      ) {
        const compressedResult = await proposeWithContext(true);
        return compressedResult ?? batchResult;
      }

      if (!batchResult) {
        const nullErr = contextFailureMeta
          ? `Request too large (~${contextFailureMeta.estimated_tokens} tokens, limit ${contextFailureMeta.provider_limit}).`
          : "Provider patch generation returned no result.";
        for (const [relPath, entry] of promptEntryByPath) {
          const basis = promptBasisByPath.get(relPath);
          updatePlanApplyFile(entry.relPath, {
            status: "error",
            decision: "rejected",
            error: nullErr,
            ...(basis !== undefined ? { basisContent: basis } : {}),
          });
        }
        return null;
      }

      applyBatchPatchResult(batchResult, promptEntryByPath, promptBasisByPath);

      for (const [relPath, entry] of apiEntryByPath) {
        if (promptEntryByPath.has(relPath)) continue;
        updatePlanApplyFile(entry.relPath, {
          status: "skipped",
          decision: "rejected",
          error: uiOnlyPrompt
            ? "No CSS/layout change required for this file."
            : "Omitted from compressed context batch.",
        });
      }

      return batchResult;
    }

    try {
      let batchResult = await proposeWithContext(Boolean(passOpts?.forceCompressed));
      let usedDeterministicFallback = false;

      if (
        (!batchResult || !batchResult.ok) &&
        uiOnlyPrompt &&
        !isTruncatedRequestBodyError(batchResult?.error)
      ) {
        const uiAuditFallback = buildUiAuditFixDeterministicPatches({
          prompt,
          appTsx: apiBasisByPath.get("src/App.tsx") ?? null,
          indexCss: apiBasisByPath.get("src/index.css") ?? null,
          ...(resolved.uiAuditResult != null
            ? { uiAuditResult: resolved.uiAuditResult }
            : {}),
        });
        const premiumFallback =
          uiAuditFallback ??
          (apiBasisByPath.get("src/index.css")
            ? applyPremiumUiEditFallback({
                prompt,
                indexCss: apiBasisByPath.get("src/index.css")!,
              })
            : null);
        const fallback = premiumFallback;
        if (fallback?.ok) {
          usedDeterministicFallback = true;
          resolved.appendGreenfieldRunLog(
            "apply_plan",
            "success",
            "Using deterministic patch proposal (provider unavailable)",
            fallback.plan,
          );
          batchResult = {
            ok: true,
            provider: settingsProvider,
            model: coderRoutingModel,
            raw: { source: "deterministic_patch_fallback" },
            latencyMs: 0,
            files: fallback.files,
          };
          for (const [relPath, newContent] of Object.entries(fallback.files)) {
            const entry = apiEntryByPath.get(relPath);
            const basis = apiBasisByPath.get(relPath);
            if (!entry || basis === undefined) continue;
            const quality =
              entry.action === "create"
                ? validateCreateProposalQuality(newContent, relPath, projectScan)
                : validateProposalQuality(basis, newContent, relPath, projectScan);
            if (!quality.ok) continue;
            updatePlanApplyFile(entry.relPath, {
              status: "ready",
              decision: "pending",
              basisContent: basis,
              proposal: {
                summary: fallback.plan,
                newContent,
                reasoning: "",
                risks: [],
              },
              patchGenerated: true,
              diffStats: quality.stats,
            });
          }
          for (const [relPath, entry] of apiEntryByPath) {
            if (fallback.files[relPath]) continue;
            updatePlanApplyFile(entry.relPath, {
              status: "skipped",
              decision: "rejected",
              error: "Deterministic fallback only updated planned UI files.",
            });
          }
        }
      }

      if (!batchResult) {
        const budgetDiagnostics = applyPlanSettings
          ? readAiCallBudgetDiagnostics(
              resolved.aiCallTrackerRef.current,
              applyPlanSettings,
              1,
            )
          : null;
        if (budgetDiagnostics) {
          resolved.appendGreenfieldRunLog(
            "apply_plan",
            "failed",
            "Patch generation budget blocked",
            formatAiCallBudgetDiagnostics(budgetDiagnostics),
          );
        }
        const errMsg = contextFailureMeta
          ? `Request too large (~${contextFailureMeta.estimated_tokens} tokens, limit ${contextFailureMeta.provider_limit}).`
          : budgetDiagnostics
            ? formatApplyPatchBudgetFailureMessage(budgetDiagnostics)
            : "Provider patch generation returned no result.";
        if (!usedDeterministicFallback) {
          for (const [relPath, entry] of apiEntryByPath) {
            const basis = apiBasisByPath.get(relPath);
            updatePlanApplyFile(entry.relPath, {
              status: "error",
              decision: "rejected",
              error: errMsg,
              ...(basis !== undefined ? { basisContent: basis } : {}),
            });
          }
        }
        return null;
      }

      return batchResult;
    } catch {
      for (const [relPath, entry] of apiEntryByPath) {
        const basis = apiBasisByPath.get(relPath);
        updatePlanApplyFile(entry.relPath, {
          status: "error",
          decision: "rejected",
          error: "Provider request failed.",
          ...(basis !== undefined ? { basisContent: basis } : {}),
        });
      }
      return null;
    }
  }

  function mergeRetryTargets(retryTargets: ReturnType<typeof buildNarrowedRetryTargets>) {
    if (resolved.isStaleApplyPlanRun(runId)) return;
    for (const t of retryTargets) {
      const prior = sessionFiles.find((f) => f.relPath === t.relPath);
      if (prior?.status === "ready") continue;

      const nextEntry: PlanApplyFileEntry = {
        relPath: t.relPath,
        absPath: t.absPath,
        selectionReason: t.selectionReason,
        planReason: t.planReason,
        ...(t.relevanceScore !== undefined ? { relevanceScore: t.relevanceScore } : {}),
        ...(t.symbolMatches && t.symbolMatches.length > 0
          ? { symbolMatches: t.symbolMatches }
          : {}),
        status: "pending",
        decision: "pending",
      };
      const existing = sessionFiles.some((f) => f.relPath === t.relPath);
      sessionFiles = existing
        ? sessionFiles.map((f) => (f.relPath === t.relPath ? nextEntry : f))
        : [...sessionFiles, nextEntry];
    }
    resolved.setPlanApplySession((prev) =>
      prev ? { ...prev, files: sessionFiles } : prev,
    );
  }

  let lastBatchResult: ApplyPlanBatchPatchResult | null = null;
  let lastProviderRaw: string | null = null;

  function rememberProviderRaw(batchResult: ApplyPlanBatchPatchResult | null): void {
    if (!batchResult) return;
    const raw =
      batchResult.lastModelRawText?.trim() ||
      batchResult.rawText?.trim() ||
      null;
    if (raw) lastProviderRaw = raw;
  }

  lastBatchResult = null;
  lastProviderRaw = null;

  const useMultiPhase = shouldUseMultiPhaseEdit({
    prompt,
    targetCount: targets.length,
  });
  let editPhasePlan = useMultiPhase
    ? buildApplyPlanEditPhases({
        prompt,
        targetPaths: targets.map((t) => t.relPath),
        runId,
      })
    : null;

  if (editPhasePlan) {
    editPhasePlan = { ...editPhasePlan, status: "running" };
    saveEditPhaseCheckpointLocal(resolved.project.path, editPhasePlan);
    resolved.appendGreenfieldRunLog(
      "apply_plan",
      "running",
      "Multi-phase edit plan",
      formatEditPhasePlanLog(editPhasePlan),
    );
    resolved.updateGreenfieldRun({
      latestAction: {
        status: "running",
        summary: `Multi-phase edit · ${editPhasePlan.phases.length} phases`,
        detail: formatEditPhasePlanLog(editPhasePlan),
        stage: "apply_plan",
        at: new Date().toISOString(),
      },
    });

    const chunks = chunkTargetsForPhases(targets, editPhasePlan);
    for (const chunk of chunks) {
      if (chunk.targets.length === 0) continue;
      if (resolved.isStaleApplyPlanRun(runId)) break;

      const chunkPaths = new Set(chunk.targets.map((t) => t.relPath));
      // Defer other phases: only current phase files stay pending for this propose.
      sessionFiles = sessionFiles.map((f) => {
        if (f.status === "ready" || f.status === "error") return f;
        if (chunkPaths.has(f.relPath)) {
          return { ...f, status: "pending" as const, decision: "pending" as const };
        }
        if (f.status === "pending" || f.status === "proposing") {
          return {
            ...f,
            status: "skipped" as const,
            error: "Deferred to a later edit phase",
          };
        }
        return f;
      });
      resolved.setPlanApplySession((prev) =>
        prev ? { ...prev, files: sessionFiles } : prev,
      );

      editPhasePlan = markPhaseStatus(editPhasePlan, chunk.phaseId, {
        status: "generating",
        startedAt: Date.now(),
        attempt: (editPhasePlan.phaseStates[chunk.phaseId]?.attempt ?? 0) + 1,
      });
      saveEditPhaseCheckpointLocal(resolved.project.path, editPhasePlan);
      resolved.appendGreenfieldRunLog(
        "apply_plan",
        "running",
        chunk.title,
        `Generating patches for: ${chunk.targets.map((t) => t.relPath).join(", ")}`,
      );

      lastBatchResult = await runProposalPass(sessionFiles);
      rememberProviderRaw(lastBatchResult);

      // One compressed retry for this phase only — never a global recovery storm.
      const phaseFailed = sessionFiles.some(
        (f) =>
          chunkPaths.has(f.relPath) &&
          (f.status === "error" || f.status === "pending"),
      );
      if (phaseFailed && !directRewrite) {
        resolved.appendGreenfieldRunLog(
          "apply_plan",
          "running",
          `${chunk.title} — one bounded retry`,
        );
        lastBatchResult = await runProposalPass(sessionFiles, {
          forceCompressed: true,
        });
        rememberProviderRaw(lastBatchResult);
      }

      const phaseReady = sessionFiles.filter(
        (f) => chunkPaths.has(f.relPath) && f.status === "ready",
      ).length;
      editPhasePlan = markPhaseStatus(editPhasePlan, chunk.phaseId, {
        status: phaseReady > 0 ? "completed" : "failed",
        completedAt: Date.now(),
        providerCalls: (editPhasePlan.phaseStates[chunk.phaseId]?.providerCalls ?? 0) + 1,
        error:
          phaseReady > 0
            ? null
            : "Phase generation produced no valid patches",
      });
      saveEditPhaseCheckpointLocal(resolved.project.path, editPhasePlan);

      // Restore deferred files for subsequent phases.
      sessionFiles = sessionFiles.map((f) => {
        if (
          f.status === "skipped" &&
          f.error === "Deferred to a later edit phase"
        ) {
          const { error: _ignored, ...rest } = f;
          return { ...rest, status: "pending" as const };
        }
        return f;
      });
    }
  } else {
    lastBatchResult = await runProposalPass(sessionFiles);
    rememberProviderRaw(lastBatchResult);
  }

  let validReady = countValidProposals();

  const hasRetryableFailures =
    !editPhasePlan &&
    sessionFiles.some(
      (f) =>
        targets.some((t) => t.relPath === f.relPath) &&
        (f.status === "error" || f.status === "pending"),
    );

  if (!directRewrite && hasRetryableFailures) {
    const retryTargets = buildNarrowedRetryTargets(
      plan,
      resolved.aiPlan,
      projectScan,
      prompt,
      {
        projectPath: resolved.project.path,
        projectMemory: resolved.projectMemory,
        sessionMemory: resolved.sessionMemory,
      },
    );
    const errorPaths = new Set(
      sessionFiles.filter((f) => f.status === "error" || f.status === "pending").map((f) => f.relPath),
    );
    const retryOnlyFailed = (
      retryTargets.length > 0 ? retryTargets : targets
    ).filter((t) => errorPaths.has(t.relPath));

    if (retryOnlyFailed.length > 0) {
      resolved.appendGreenfieldRunLog(
        "apply_plan",
        "running",
        `Apply Plan — retrying failed files (${retryOnlyFailed.map((t) => t.relPath).join(", ")})`,
      );
      mergeRetryTargets(retryOnlyFailed);
      lastBatchResult = await runProposalPass(sessionFiles, {
        forceCompressed: true,
      });
      rememberProviderRaw(lastBatchResult);
      validReady = countValidProposals();
    }
  }

  // Second recovery pass for remaining gaps after a partial batch (common on
  // large Kanban-style expansions where the first response omits page files).
  const stillFailed = sessionFiles.filter(
    (f) =>
      targets.some((t) => t.relPath === f.relPath) &&
      (f.status === "error" || f.status === "pending"),
  );
  if (
    !editPhasePlan &&
    !directRewrite &&
    !pipelineMode &&
    validReady > 0 &&
    stillFailed.length > 0 &&
    stillFailed.length <= 6
  ) {
    resolved.appendGreenfieldRunLog(
      "apply_plan",
      "running",
      `Apply Plan — recovery pass for ${stillFailed.map((f) => f.relPath).join(", ")}`,
    );
    mergeRetryTargets(
      stillFailed.map((f) => {
        const t = targets.find((x) => x.relPath === f.relPath)!;
        return t;
      }),
    );
    lastBatchResult = await runProposalPass(sessionFiles);
    rememberProviderRaw(lastBatchResult);
    validReady = countValidProposals();
  }

  const budgetOrContextBlocked =
    contextFailureMeta != null ||
    sessionFiles.some((f) =>
      /budget|max ai calls|request too large/i.test(
        `${f.error ?? ""} ${f.rejectionReason ?? ""}`,
      ),
    );

  const shouldAutoDirectRewrite =
    !directRewrite &&
    validReady === 0 &&
    !pipelineMode &&
    lastBatchResult != null &&
    !budgetOrContextBlocked;

  if (shouldAutoDirectRewrite) {
    const fallbackSession: PlanApplySession = {
      ...applySession,
      applyRunId: runId,
      files: sessionFiles,
      phase: "proposing",
      totals: computePlanApplyTotals(sessionFiles),
      selectedRelPath: applySession.selectedRelPath,
      directRewriteAvailable: false,
      lastModelRawText:
        lastBatchResult?.lastModelRawText ?? lastBatchResult?.rawText ?? null,
    };
    resolved.setPlanApplySession(fallbackSession);
    resolved.appendGreenfieldRunLog(
      "apply_plan",
      "running",
      "Apply Plan — direct rewrite fallback",
      lastBatchResult?.error ?? "Patch format retry",
    );
    return executeApplyPlanOrchestration(
      { ...resolved, planApplySession: fallbackSession },
      {
        directRewrite: true,
        pipelineMode,
        autoContinue,
      },
    );
  }

  const proposeTotals = computePlanApplyTotals(sessionFiles);
  const readyFiles = sessionFiles
    .filter((f) => f.status === "ready")
    .map((f) => f.relPath);
  const firstReady = sessionFiles.find(
    (f) => f.status === "ready" && f.diffStats?.changed,
  );
  const lastRaw =
    lastProviderRaw ??
    lastBatchResult?.lastModelRawText ??
    lastBatchResult?.rawText ??
    null;
  const showDirectRewrite =
    validReady === 0 && !directRewrite && Boolean(lastBatchResult?.repairAttempted);

  const reviewPhase: PlanApplySession["phase"] =
    validReady === 0
      ? "failed"
      : validReady > 0 && !autoContinue
        ? "waiting_for_review"
        : "review";

  const reviewSession: PlanApplySession = {
    ...applySession,
    applyRunId: runId,
    files: sessionFiles,
    phase: reviewPhase,
    totals: proposeTotals,
    selectedRelPath: firstReady?.relPath ?? applySession.selectedRelPath,
    directRewriteAvailable: showDirectRewrite,
    lastModelRawText: validReady === 0 ? lastRaw : null,
  };
  applySession = reviewSession;

  recordRunTimelineStage(
    "coder_complete",
    validReady > 0 ? `${validReady} ready` : "0 ready",
  );

  if (validReady > 0) {
    resolved.setPlanApplySession(reviewSession);
    markPatchGenerated();
    notifyPatchApplyStageReached(reviewSession.phase);
    logPatchGenerated(readyFiles);
    logPatchReadyForApply(readyFiles);
    logPatchReviewMode(!autoContinue);
    recordRunTimelineStage("patch_generated", readyFiles.join(","));
    const shadow = await stagePlanApplyShadowRun(studioApi, runId, sessionFiles);
    if (!shadow.ok) {
      resolved.appendGreenfieldRunLog(
        "apply_plan",
        "failed",
        `Shadow staging skipped: ${shadow.reason ?? "unknown"}`,
      );
    }
  }

  if (staleResult("propose patches")) {
    if (validReady > 0 && !autoContinue) {
      resolved.releaseBuildRunForReview?.();
      return {
        validReady,
        autoContinued: false,
        waitingForReview: true,
      };
    }
    return { ...EMPTY_RESULT, validReady };
  }

  let coderProposalError: string | undefined;
  if (validReady === 0) {
    const uiOnlyPromptForReport = uiOnlyPrompt;
    const patchTargetPaths = targets
      .filter((t) => !uiOnlyPromptForReport || isUiCorePatchTarget(t.relPath))
      .map((t) => normalizeApplyPlanPath(t.relPath));
    const formatError =
      lastBatchResult?.errorCode === APPLY_PLAN_PATCH_FORMAT_ERROR;
    const diagnostics = buildPlanApplyProposalDiagnostics(sessionFiles, skipped, {
      omitBlockedCollectionNoise: uiOnlyPromptForReport,
    });
    const routeSelectionWrong =
      resolved.greenfieldRun != null &&
      !greenfieldSetupReachedSuccess(resolved.greenfieldRun);
    const report = buildApplyPlanZeroProposalsReport({
      diagnostics,
      collectionSkipped: uiOnlyPromptForReport ? [] : skipped,
      selectedFiles: targets.map((t) => t.relPath),
      patchTargets: patchTargetPaths,
      plannerOutput: summary,
      ...(routeSelectionWrong
        ? {
            routeSelectionHint:
              "Route selection likely wrong: previous greenfield run failed before build completed. Submit the same prompt again to enter greenfield_recovery instead of apply_plan.",
          }
        : {}),
      ...(formatError
        ? {
            rootCauseLine: buildApplyPlanPatchFormatRootCause(patchTargetPaths),
          }
        : {}),
      ...(lastRaw?.trim() ? { rawModelOutput: lastRaw } : {}),
    });
    const diagDetail = diagnostics.map((d) => `${d.path}: ${d.reason}`).join("; ");
    coderProposalError = report.rootCauseLine;
    resolved.publishFailureReport(report);
    if (!pipelineMode) {
      const failurePatch: Partial<import("@/core/greenfield/runState").GreenfieldRunSnapshot> = {
        failureReport: report,
        finalMessage: report.rootCauseLine,
        workflow: {
          prompt,
          planSource: source,
          planSummary: summary,
          filesProposed: patchTargetCount,
          filesAccepted: 0,
          linesAdded: proposeTotals.linesAdded,
          linesRemoved: proposeTotals.linesRemoved,
          errors: [report.rootCauseLine],
          routingIntent: {
            ...routingIntentPatch,
            files_written: readyFiles,
          },
          ...(contextFailureMeta ? { contextFailure: contextFailureMeta } : {}),
        },
      };
      if (lastRaw?.trim()) {
        const priorDebug = resolved.greenfieldRun?.debug;
        failurePatch.debug = {
          ...(priorDebug ?? {}),
          stage: "apply_plan:patch_propose",
          requestStartedAt: new Date().toISOString(),
          elapsedMs:
            resolved.greenfieldRun?.runStartedAt != null
              ? Math.max(0, Date.now() - resolved.greenfieldRun.runStartedAt)
              : 0,
          errorMessage: report.rootCauseLine,
          rawProviderPayload: lastRaw.slice(0, 8000),
        };
      }
      resolved.finishStudioAction(
        "apply_plan",
        "apply_plan",
        false,
        "Apply Plan — no proposals generated",
        {
          details: diagDetail || report.rootCauseLine,
          patch: failurePatch,
        },
      );
    }
    resolved.setPlanApplySession(reviewSession);
  } else if (!pipelineMode && !autoContinue && validReady > 0) {
    resolved.finishStudioAction(
      "apply_plan",
      "apply_plan",
      true,
      "Changes ready for review",
      {
        details: `${validReady} ready · ${patchTargetCount} patch target(s)`,
        patch: {
          failureReport: null,
          workflow: {
            prompt,
            planSource: source,
            planSummary: summary,
            filesProposed: patchTargetCount,
            linesAdded: proposeTotals.linesAdded,
            linesRemoved: proposeTotals.linesRemoved,
            errors: [],
            routingIntent: {
              ...routingIntentPatch,
              files_written: readyFiles,
            },
          },
        },
      },
    );
    resolved.releaseBuildRunForReview?.();
    recordRunTimelineStage("waiting_for_review", `${validReady} file(s)`);
    return {
      validReady,
      autoContinued: false,
      waitingForReview: true,
    };
  }

  if (autoContinue && validReady > 0 && !pipelineMode) {
    const incompleteBeforeWrite = evaluateIncompleteCoordinatedApply({
      prompt,
      targetPaths: targets.map((t) => t.relPath),
      files: sessionFiles,
    });
    if (incompleteBeforeWrite.incomplete) {
      const message =
        incompleteBeforeWrite.message ??
        `Incomplete patch batch: ${validReady}/${patchTargetCount} files ready`;
      resolved.appendGreenfieldRunLog(
        "apply_plan",
        "failed",
        `Refusing incomplete apply (${validReady}/${patchTargetCount} ready)`,
        message,
      );
      resolved.setPlanApplyError(message);
      resolved.publishFailureReport(
        buildApplyPlanFailureReport({ applyError: message }),
      );
      resolved.finishStudioAction("apply_plan", "apply_plan", false, message, {
        details: message,
        patch: {
          workflow: {
            prompt,
            planSource: source,
            planSummary: summary,
            errors: [message],
            routingIntent: routingIntentPatch,
          },
        },
      });
      resolved.releaseBuildRunForReview?.();
      return {
        validReady,
        autoContinued: false,
        applyOk: false,
        error: message,
      };
    }

    const approved = withAllReadyFilesApproved(reviewSession);
    const applyingSession = { ...approved, phase: "applying" as const };
    applySession = applyingSession;
    resolved.setPlanApplySession(applyingSession);
    notifyPatchApplyStageReached("applying");
    startPatchApplyWatchdog((message) => {
      failRunTimeline(message);
      resolved.setPlanApplyError(message);
      resolved.setBuildError?.(message);
      resolved.releaseBuildRunForReview?.();
      resolved.finishStudioAction("apply_plan", "apply_plan", false, message, {
        details: message,
      });
    });
    const applyResult = await applyApprovedPlanFilesOrchestration(
      { ...resolved, planApplySession: applyingSession },
    );
    clearPatchGeneratedWatchdog();
    return {
      validReady,
      autoContinued: true,
      applyOk: applyResult.ok,
      ...(applyResult.error ? { error: applyResult.error } : {}),
    };
  }

  if (validReady > 0) {
    resolved.setPlanApplySession(reviewSession);
  }

  if (validReady > 0) {
    const intelHost = getIntelligenceHost();
    resolved.setSessionMemory((m) =>
      recordProviderUsage(m, {
        provider: settingsProvider,
        model: coderRoutingModel,
        operation: pipelineMode ? "pipeline_coder" : "apply_plan",
      }),
    );
    void intelHost?.persistSessionMemory();
  }

  if (pipelineMode) {
    resolved.pipelineCoderResultRef.current = {
      ok: validReady > 0,
      fileCount: validReady,
      ...(coderProposalError ? { error: coderProposalError } : {}),
      routing: {
        provider: settingsProvider,
        model: coderRoutingModel,
      },
      contextSnapshotId: resolved.lastContextSnapshotIdRef.current,
    };
  }

  return {
    validReady,
    autoContinued: false,
    ...(coderProposalError ? { error: coderProposalError } : {}),
  };
}
