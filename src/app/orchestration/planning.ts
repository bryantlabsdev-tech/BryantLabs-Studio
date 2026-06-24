import { flushSync } from "react-dom";
import { NO_PROJECT_FILES_MESSAGE } from "@/core/agent/agentReadiness";
import {
  incompleteGreenfieldEditBlockMessage,
  shouldBlockEditForIncompleteGreenfield,
} from "@/core/agent/greenfieldRecoveryRouting";
import { resolveEffectiveProjectScan } from "@/core/agent/resolveEffectiveProjectScan";
import {
  appendAgentFeed,
  appendAgentHistory,
  recordAgentDecision,
  setTimelineStage,
} from "@/core/agentWorkspace";
import { buildAgentPlanContext } from "@/core/context/buildAgentContext";
import { attachReferencedFileContents } from "@/core/context/referencedFileContext";
import { mergeProjectMemoryIntoPlannerPreview } from "@/core/projectIntelligence/buildProjectMemoryContext";
import { getIntelligenceHost } from "@/app/intelligence/intelligenceHost";
import { recordPromptVisibility } from "@/core/intelligence/promptVisibility";
import { generatePlan as buildPlan, type Plan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import {
  buildDeterministicAiPlanFallback,
  canUseDeterministicPlanFallback,
} from "@/core/planner/deterministicAiPlanFallback";
import {
  buildBlockedPlannerResult,
  buildPlannerPreflightDiagnostics,
  canUseDeterministicPlanWithoutProviderCall,
  formatPlannerPreflightDiagnostics,
  preflightGateUserMessage,
  readPreflightDiagnostics,
  readPreflightGate,
  type PlannerPreflightGate,
} from "@/core/planner/plannerPreflight";
import { isDisallowedPlanPrompt, resolveUserPlanPrompt } from "@/core/planApply";
import {
  estimateAiCalls,
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import { verifyStageProviderConnection } from "@/core/providers/providerConnectionGate";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import {
  effectivePlanPrompt,
  recordAiPlan,
  recordDeterministicPlan,
  recordPrompt,
  recordProviderUsage,
} from "@/core/sessionMemory";
import { activeProviderModel } from "@/core/studioRun/types";
import type { PlanningOrchestrationHost } from "@/app/orchestration/planningTypes";
import type { BryantLabsApi, ProjectScan } from "@/types";

export function createPlanOrchestration(
  host: PlanningOrchestrationHost | null,
  prompt: string,
  planOpts?: { readonly semanticBoostPaths?: readonly string[] },
): Plan | null {
  if (!host) return null;
  host.createPlanErrorRef.current = null;

  if (
    host.project &&
    shouldBlockEditForIncompleteGreenfield({
      projectPath: host.project.path,
      greenfieldRun: host.greenfieldRun,
    })
  ) {
    host.createPlanErrorRef.current = incompleteGreenfieldEditBlockMessage(
      host.greenfieldRun,
    );
    return null;
  }

  const effectiveScan = resolveEffectiveProjectScan({
    scan: host.scan,
    projectPath: host.project?.path ?? null,
    greenfieldRun: host.greenfieldRun,
  });
  if (!effectiveScan) {
    host.createPlanErrorRef.current = "Project scan not available.";
    return null;
  }
  if (prompt.trim() === "") {
    host.createPlanErrorRef.current = "Plan prompt is empty.";
    return null;
  }
  if (effectiveScan.files.length === 0) {
    host.createPlanErrorRef.current = NO_PROJECT_FILES_MESSAGE;
    return null;
  }

  const trimmed = prompt.trim();
  const scan = effectiveScan;
  let planOut: Plan | null = null;
  let memoryAfterPlan = host.sessionMemory;

  flushSync(() => {
    host.setSessionMemory((mem) => {
      let next = recordPrompt(mem, trimmed);
      memoryAfterPlan = next;
      const effective = effectivePlanPrompt(trimmed, next, {
        appNameHint: host.projectMemory.projectName || null,
      });
      try {
        planOut = buildPlan(effective, scan, {
          projectPath: host.project?.path ?? null,
          projectMemory: host.projectMemory,
          sessionMemory: next,
          ...(planOpts?.semanticBoostPaths
            ? { semanticBoostPaths: planOpts.semanticBoostPaths }
            : {}),
        });
      } catch (err) {
        console.error("[createPlan]", err);
        host.createPlanErrorRef.current =
          err instanceof Error ? err.message : "Planner threw an error.";
        return next;
      }
      if (!planOut) {
        host.createPlanErrorRef.current = "Deterministic planner returned no plan.";
        return next;
      }
      next = recordDeterministicPlan(next, effective, {
        summary: planOut.summary,
        files: planOut.files,
      });
      return next;
    });
  });

  if (!planOut) {
    host.createPlanErrorRef.current ??=
      "Could not build deterministic plan (see console).";
    return null;
  }

  host.setPlan(planOut);
  host.planRef.current = planOut;
  host.refreshSmartFileSelection(trimmed, memoryAfterPlan);
  if (!isDisallowedPlanPrompt(trimmed)) {
    host.setLastPlanPrompt(trimmed);
  }
  host.setAiPlan(null);
  host.setAiPlanStatus("idle");
  host.setSessionMemoryDiagnostics(null);
  return planOut;
}

type ResolvedAiPlanHost = PlanningOrchestrationHost & {
  api: BryantLabsApi;
  scan: ProjectScan;
  plan: Plan;
};

function resolvePlannerRoute(host: PlanningOrchestrationHost): string | null {
  return host.greenfieldRun?.runTimeline?.route ?? null;
}

function resolveActivePlan(host: PlanningOrchestrationHost): Plan | null {
  return host.planRef.current ?? host.plan;
}

function publishPlannerResult(
  resolved: ResolvedAiPlanHost,
  userPrompt: string,
  effectiveResult: AIPlanResult,
  routingProvider: ProviderId,
  routingModel: string,
): boolean {
  resolved.setAiPlan(effectiveResult);
  resolved.aiPlanRef.current = effectiveResult;
  resolved.setAiPlanStatus(effectiveResult.ok ? "done" : "error");
  resolved.setSessionMemory((m) => {
    const next = recordAiPlan(m, userPrompt, effectiveResult);
    return recordProviderUsage(next, {
      provider: effectiveResult.provider ?? routingProvider,
      model: effectiveResult.model ?? routingModel,
      operation: "ai_plan",
    });
  });

  const fileCount = effectiveResult.plan?.files.length ?? 0;
  if (effectiveResult.ok && effectiveResult.plan) {
    resolved.pushAgent((s) => {
      let n = appendAgentFeed(
        s,
        "planning",
        `Identified ${fileCount} file(s)`,
        effectiveResult.plan!.summary,
      );
      n = appendAgentHistory(n, "plan", "AI plan", effectiveResult.plan!.summary);
      for (const f of effectiveResult.plan!.files) {
        n = recordAgentDecision(n, f.path, f.reason);
      }
      return n;
    });
  }

  resolved.finishStudioAction(
    "ai_plan",
    "ai_plan",
    effectiveResult.ok,
    effectiveResult.ok ? "AI Plan completed" : "AI Plan failed",
    {
      details: effectiveResult.ok
        ? `${fileCount} file(s) in plan · ${effectiveResult.latencyMs}ms`
        : (effectiveResult.error ?? effectiveResult.parseError ?? "Unknown error"),
      patch: {
        provider: effectiveResult.provider,
        model: effectiveResult.model,
        workflow: {
          prompt: userPrompt,
          filesProposed: fileCount,
          errors: effectiveResult.ok
            ? []
            : [effectiveResult.error ?? effectiveResult.parseError ?? "AI Plan failed"],
        },
      },
    },
  );
  return effectiveResult.ok;
}

function tryDeterministicFallbackWithoutProvider(
  resolved: ResolvedAiPlanHost,
  userPrompt: string,
  provider: ProviderId,
  model: string,
  blockedResult: AIPlanResult,
): AIPlanResult | null {
  const route = resolvePlannerRoute(resolved);
  if (!canUseDeterministicPlanWithoutProviderCall(userPrompt, resolved.plan, route)) {
    return null;
  }
  const blockedPreflight = readPreflightDiagnostics(blockedResult);
  const fallback = buildDeterministicAiPlanFallback(
    userPrompt,
    resolved.plan,
    provider,
    model,
    blockedResult,
  );
  const providerBlockedReason =
    blockedPreflight?.providerBlockedReason ?? blockedResult.error ?? null;
  const preflight = buildPlannerPreflightDiagnostics({
    userPrompt,
    plan: resolved.plan,
    route,
    gate: blockedPreflight?.gate ?? readPreflightGate(blockedResult),
    providerCallAttempted: blockedPreflight?.providerCallAttempted ?? false,
    ...(providerBlockedReason ? { providerBlockedReason } : {}),
    skipReason: blockedPreflight?.skipReason ?? blockedResult.error ?? null,
    message: blockedPreflight?.message ?? blockedResult.error ?? null,
    fallbackAttempted: true,
    fallbackUsed: true,
    fallbackNotUsedReason: null,
  });
  return {
    ...fallback,
    raw: {
      ...(typeof fallback.raw === "object" && fallback.raw !== null ? fallback.raw : {}),
      preflightGate: preflight.gate,
      preflight,
    },
  };
}

function blockPlanner(
  host: PlanningOrchestrationHost & { api: BryantLabsApi; scan: ProjectScan },
  plan: Plan | null,
  input: {
    readonly userPrompt: string | null;
    readonly gate: PlannerPreflightGate;
    readonly message: string;
    readonly provider: ProviderId;
    readonly model: string;
    readonly providerCallAttempted?: boolean;
    readonly fallbackAttempted?: boolean;
    readonly fallbackUsed?: boolean;
  },
): false {
  const route = resolvePlannerRoute(host);
  const preflight = buildPlannerPreflightDiagnostics({
    userPrompt: input.userPrompt,
    plan,
    route,
    gate: input.gate,
    providerCallAttempted: input.providerCallAttempted ?? false,
    providerBlockedReason:
      input.gate === "provider_not_connected" ||
      input.gate === "budget_exceeded" ||
      input.gate === "provider_routing_missing"
        ? input.message
        : null,
    skipReason: input.message,
    message: input.message,
    fallbackAttempted: input.fallbackAttempted ?? false,
    fallbackUsed: input.fallbackUsed ?? false,
  });
  const blocked = buildBlockedPlannerResult({
    gate: input.gate,
    message: input.message,
    provider: input.provider,
    model: input.model,
    preflight,
    ...(input.providerCallAttempted !== undefined
      ? { providerCallAttempted: input.providerCallAttempted }
      : {}),
  });
  host.setAiPlan(blocked);
  host.aiPlanRef.current = blocked;
  host.setAiPlanStatus("error");
  host.appendGreenfieldRunLog(
    "ai_plan",
    "failed",
    preflightGateUserMessage(input.gate, input.message),
    formatPlannerPreflightDiagnostics(preflight),
  );
  if (input.userPrompt) {
    host.finishStudioAction("ai_plan", "ai_plan", false, "AI Plan blocked", {
      details: input.message,
      patch: {
        workflow: {
          prompt: input.userPrompt,
          errors: [input.message],
        },
      },
    });
  }
  return false;
}

export async function runAIPlanOrchestration(
  host: PlanningOrchestrationHost | null,
  explicitPrompt?: string,
): Promise<boolean> {
  const fallbackProvider: ProviderId = "gemini";
  const fallbackModel = "";

  const effectiveScan =
    host?.project != null
      ? resolveEffectiveProjectScan({
          scan: host.scan,
          projectPath: host.project.path,
          ...(host.greenfieldRun ? { greenfieldRun: host.greenfieldRun } : {}),
        })
      : null;

  if (!host?.api || !effectiveScan) {
    return false;
  }

  const api = host.api;
  const scan = effectiveScan;
  const plan = resolveActivePlan(host);
  if (!plan) {
    return blockPlanner({ ...host, api, scan }, null, {
      userPrompt: explicitPrompt ?? host.lastPlanPrompt,
      gate: "plan_missing",
      message: preflightGateUserMessage("plan_missing"),
      provider: fallbackProvider,
      model: fallbackModel,
    });
  }

  const resolved: ResolvedAiPlanHost = { ...host, api, scan, plan };
  const userPrompt = resolveUserPlanPrompt(
    resolved.plan,
    resolved.lastPlanPrompt,
    explicitPrompt,
  );
  if (!userPrompt) {
    return blockPlanner(resolved, resolved.plan, {
      userPrompt: explicitPrompt ?? resolved.lastPlanPrompt,
      gate: "prompt_validation",
      message: preflightGateUserMessage("prompt_validation"),
      provider: fallbackProvider,
      model: fallbackModel,
    });
  }

  if (resolved.plan.files.length === 0) {
    return blockPlanner(resolved, resolved.plan, {
      userPrompt,
      gate: "no_editable_files",
      message: preflightGateUserMessage("no_editable_files"),
      provider: fallbackProvider,
      model: fallbackModel,
    });
  }

  const proactiveRoute = resolvePlannerRoute(resolved);
  if (
    canUseDeterministicPlanWithoutProviderCall(
      userPrompt,
      resolved.plan,
      proactiveRoute,
    )
  ) {
    const preflight = buildPlannerPreflightDiagnostics({
      userPrompt,
      plan: resolved.plan,
      route: proactiveRoute,
      providerCallAttempted: false,
      skipReason: "Skipped — deterministic plan sufficient for UI-only follow-up",
      fallbackAttempted: true,
      fallbackUsed: true,
    });
    const blockedStub = buildBlockedPlannerResult({
      gate: "deterministic_fallback_unavailable",
      message: "Skipped — deterministic plan sufficient for UI-only follow-up",
      provider: fallbackProvider,
      model: fallbackModel,
      preflight,
    });
    const skipped = {
      ...buildDeterministicAiPlanFallback(
        userPrompt,
        resolved.plan,
        fallbackProvider,
        fallbackModel,
        blockedStub,
      ),
      raw: {
        source: "deterministic_fallback",
        prompt: userPrompt,
        preflight,
        proactiveSkip: true,
      },
    };
    resolved.appendGreenfieldRunLog(
      "ai_plan",
      "success",
      "Skipping AI planner — deterministic plan sufficient",
      userPrompt,
    );
    return publishPlannerResult(
      resolved,
      userPrompt,
      skipped,
      fallbackProvider,
      fallbackModel,
    );
  }

  resolved.setAiPlanStatus("running");
  resolved.setAiPlan(null);
  resolved.pushAgent((s) => {
    let n = setTimelineStage(s, "plan", "active");
    n = appendAgentFeed(n, "planning", "Building AI plan", userPrompt);
    n = appendAgentHistory(n, "prompt", "Plan prompt", userPrompt);
    return n;
  });
  resolved.beginStudioAction("ai_plan", "ai_plan", "AI Plan started", {
    details: userPrompt,
    patch: { workflow: { prompt: userPrompt } },
  });

  try {
    let settings: ProviderSettings = normalizeProviderSettings(
      await resolved.api.getProviderSettings(),
    );
    const intelHost = getIntelligenceHost();
    if (intelHost) {
      const routed = await intelHost.applyComplexityRouting(
        userPrompt,
        resolved.scan.files.length,
        settings,
      );
      settings = routed.settings;
      resolved.appendGreenfieldRunLog(
        "ai_plan",
        "running",
        `Complexity advisory: ${routed.decision.tier} · ${routed.decision.provider} · ${routed.decision.model}`,
        routed.decision.reason,
      );
    }
    const routing = resolveStageRouting(settings, "planner");
    const routingProvider = routing?.provider ?? settings.provider;
    const routingModel = routing?.model ?? activeProviderModel(settings);

    if (!routing) {
      return blockPlanner(resolved, resolved.plan, {
        userPrompt,
        gate: "provider_routing_missing",
        message: preflightGateUserMessage("provider_routing_missing"),
        provider: settings.provider,
        model: routingModel,
      });
    }

    const connection = await verifyStageProviderConnection(
      resolved.api,
      settings,
      "planner",
    );
    if (!connection.ok) {
      resolved.appendGreenfieldRunLog(
        "provider_call",
        "failed",
        `[provider:error] ${connection.failure.status}`,
        connection.message,
      );
      const blocked = buildBlockedPlannerResult({
        gate: "provider_not_connected",
        message: connection.message,
        provider: connection.failure.provider ?? routingProvider,
        model: connection.failure.model ?? routingModel,
        preflight: buildPlannerPreflightDiagnostics({
          userPrompt,
          plan: resolved.plan,
          route: resolvePlannerRoute(resolved),
          gate: "provider_not_connected",
          providerCallAttempted: false,
          providerBlockedReason: connection.message,
          skipReason: connection.message,
          message: connection.message,
          fallbackAttempted: true,
        }),
      });
      const fallback = tryDeterministicFallbackWithoutProvider(
        resolved,
        userPrompt,
        connection.failure.provider ?? routingProvider,
        connection.failure.model ?? routingModel,
        blocked,
      );
      if (fallback) {
        resolved.appendGreenfieldRunLog(
          "ai_plan",
          "success",
          "Using deterministic plan (provider unavailable)",
          connection.message,
        );
        void intelHost?.persistSessionMemory();
        return publishPlannerResult(
          resolved,
          userPrompt,
          fallback,
          routingProvider,
          routingModel,
        );
      }
      return blockPlanner(resolved, resolved.plan, {
        userPrompt,
        gate: "provider_not_connected",
        message: connection.message,
        provider: connection.failure.provider ?? routingProvider,
        model: connection.failure.model ?? routingModel,
        fallbackAttempted: true,
        fallbackUsed: false,
      });
    }

    const estimatedCalls = estimateAiCalls(settings, "ai_plan");
    resolved.updateGreenfieldRun({
      provider: routingProvider,
      model: routingModel,
    });
    resolved.appendGreenfieldRunLog(
      "ai_plan",
      "running",
      `Estimated AI calls: ${estimatedCalls}`,
      `Max ${settings.maxAiCalls} per run`,
    );
    const memForPlan =
      resolved.sessionMemory.lastPrompt === userPrompt.trim()
        ? resolved.sessionMemory
        : recordPrompt(resolved.sessionMemory, userPrompt);
    if (memForPlan !== resolved.sessionMemory) {
      resolved.setSessionMemory(memForPlan);
    }
    const memoryRetrieval = resolved.resolveMemoriesForPrompt(userPrompt, "ai_plan");
    const intelligence =
      intelHost?.buildIntelligenceForOperation({
        prompt: userPrompt,
        operation: "ai_plan",
        memoryRetrieval,
      }) ?? null;
    const { context, diagnostics, projectMemoryInjection } = buildAgentPlanContext(
      resolved.scan,
      userPrompt,
      memForPlan,
      resolved.projectMemory,
      resolved.project?.path ?? null,
      memoryRetrieval,
      intelligence,
      resolved.projectIntelligence,
      resolvePlannerRoute(resolved),
    );
    const planContext = attachReferencedFileContents(
      context,
      resolved.editExplorationContentsRef.current,
    );
    resolved.setSessionMemoryDiagnostics(diagnostics);
    if (projectMemoryInjection.injected) {
      resolved.updateGreenfieldRun({
        projectMemoryInjection: projectMemoryInjection.meta,
      });
      resolved.appendGreenfieldRunLog(
        "ai_plan",
        "running",
        "Project memory context injected",
        `size=${projectMemoryInjection.meta.contextSize}${
          projectMemoryInjection.meta.recommendationUsed ? "; recommendation=true" : ""
        }`,
      );
    }
    resolved.refreshSmartFileSelection(userPrompt, memForPlan);
    const plannerPromptPreview = mergeProjectMemoryIntoPlannerPreview(
      [
        userPrompt,
        "",
        intelligence?.promptBlock ?? "",
      ]
        .filter((line, index, arr) => !(line === "" && arr[index + 1] === ""))
        .join("\n"),
      projectMemoryInjection.text,
    );
    recordPromptVisibility({
      stage: "planner",
      prompt: plannerPromptPreview,
      provider: routingProvider,
      model: routingModel,
    });
    resolved.commitContextCapture({
      operation: "ai_plan",
      provider: routingProvider,
      model: routingModel,
      originalPrompt: userPrompt,
      planContext,
      settings,
      estimatedAiCalls: estimatedCalls,
      expandedPrompt: plannerPromptPreview,
    });
    const result = await resolved.invokePlannerCall<AIPlanResult>(
      settings,
      1024,
      (provider) => resolved.api.planWithProvider(provider, userPrompt, planContext),
    );
    if (!result) {
      const budgetMessage = preflightGateUserMessage("budget_exceeded");
      const blocked = buildBlockedPlannerResult({
        gate: "budget_exceeded",
        message: budgetMessage,
        provider: routingProvider,
        model: routingModel,
        preflight: buildPlannerPreflightDiagnostics({
          userPrompt,
          plan: resolved.plan,
          route: resolvePlannerRoute(resolved),
          gate: "budget_exceeded",
          providerCallAttempted: false,
          providerBlockedReason: budgetMessage,
          skipReason: budgetMessage,
          message: budgetMessage,
          fallbackAttempted: true,
        }),
      });
      const fallback = tryDeterministicFallbackWithoutProvider(
        resolved,
        userPrompt,
        routingProvider,
        routingModel,
        blocked,
      );
      if (fallback) {
        resolved.appendGreenfieldRunLog(
          "ai_plan",
          "success",
          "Using deterministic plan (planner budget exceeded)",
          budgetMessage,
        );
        void intelHost?.persistSessionMemory();
        return publishPlannerResult(
          resolved,
          userPrompt,
          fallback,
          routingProvider,
          routingModel,
        );
      }
      return blockPlanner(resolved, resolved.plan, {
        userPrompt,
        gate: "budget_exceeded",
        message: budgetMessage,
        provider: routingProvider,
        model: routingModel,
        fallbackAttempted: true,
        fallbackUsed: false,
      });
    }

    let effectiveResult = result;
    if (canUseDeterministicPlanFallback(userPrompt, resolved.plan, result)) {
      effectiveResult = buildDeterministicAiPlanFallback(
        userPrompt,
        resolved.plan,
        result.provider ?? routingProvider,
        result.model ?? routingModel,
        result,
      );
      resolved.appendGreenfieldRunLog(
        "ai_plan",
        "success",
        "Using deterministic plan (AI planner unavailable)",
        result.parseError ?? result.error ?? "Planner parse failed",
      );
    }

    void intelHost?.persistSessionMemory();
    return publishPlannerResult(
      resolved,
      userPrompt,
      effectiveResult,
      routingProvider,
      routingModel,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : preflightGateUserMessage("provider_request_failed");
    return blockPlanner(resolved, resolved.plan, {
      userPrompt,
      gate: "provider_request_failed",
      message,
      provider: fallbackProvider,
      model: fallbackModel,
      providerCallAttempted: true,
    });
  }
}

export async function executeAIPlanForPromptOrchestration(
  host: PlanningOrchestrationHost | null,
  userPrompt: string,
  deterministicPlan: Plan,
): Promise<AIPlanResult | null> {
  const effectiveScan =
    host?.project != null
      ? resolveEffectiveProjectScan({
          scan: host.scan,
          projectPath: host.project.path,
          greenfieldRun: host.greenfieldRun,
        })
      : null;
  if (!host?.api || !effectiveScan) return null;

  host.setAiPlanStatus("running");
  host.setAiPlan(null);
  try {
    const settings = normalizeProviderSettings(await host.api.getProviderSettings());
    const routing = resolveStageRouting(settings, "planner");
    host.updateGreenfieldRun({
      provider: routing?.provider ?? settings.provider,
      model: routing?.model ?? activeProviderModel(settings),
    });
    let mem = host.sessionMemory;
    if (mem.lastPrompt !== userPrompt.trim()) {
      mem = recordPrompt(mem, userPrompt);
      host.setSessionMemory(mem);
    }
    const memoryRetrieval = host.resolveMemoriesForPrompt(userPrompt, "agent");
    const { context, diagnostics, projectMemoryInjection } = buildAgentPlanContext(
      effectiveScan,
      userPrompt,
      mem,
      host.projectMemory,
      host.project?.path ?? null,
      memoryRetrieval,
      undefined,
      host.projectIntelligence,
      host.greenfieldRun?.runTimeline?.route ?? null,
    );
    const planContext = attachReferencedFileContents(
      context,
      host.editExplorationContentsRef.current,
    );
    host.setSessionMemoryDiagnostics(diagnostics);
    if (projectMemoryInjection.injected) {
      host.updateGreenfieldRun({
        projectMemoryInjection: projectMemoryInjection.meta,
      });
      host.appendGreenfieldRunLog(
        "ai_plan",
        "running",
        "Project memory context injected",
        `size=${projectMemoryInjection.meta.contextSize}`,
      );
    }
    host.refreshSmartFileSelection(userPrompt, mem);
    host.commitContextCapture({
      operation: "agent",
      provider: routing?.provider ?? settings.provider,
      model: routing?.model ?? activeProviderModel(settings),
      originalPrompt: userPrompt,
      planContext,
      settings,
      estimatedAiCalls: estimateAiCalls(settings, "agent"),
    });
    const result = await host.invokePlannerCall(settings, 1024, (provider) =>
      host.api!.planWithProvider(provider, userPrompt, planContext),
    );
    if (!result) {
      host.setAiPlanStatus("error");
      return null;
    }
    host.setAiPlan(result);
    host.setAiPlanStatus(result.ok ? "done" : "error");
    host.setSessionMemory((m) => recordAiPlan(m, userPrompt, result));
    host.setPlan(deterministicPlan);
    host.setLastPlanPrompt(userPrompt);
    if (result.ok && result.plan) {
      const fileCount = result.plan.files.length;
      host.pushAgent((s) => {
        let n = appendAgentFeed(
          s,
          "planning",
          `Identified ${fileCount} file(s)`,
          result.plan!.summary,
        );
        n = appendAgentHistory(n, "plan", "AI plan", result.plan!.summary);
        for (const f of result.plan!.files) {
          n = recordAgentDecision(n, f.path, f.reason);
        }
        return n;
      });
    }
    return result;
  } catch {
    host.setAiPlanStatus("error");
    return null;
  }
}
