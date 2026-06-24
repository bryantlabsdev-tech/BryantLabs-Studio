import {
  appendAgentFeed,
  appendAgentHistory,
  mergeAgentArtifacts,
  setTimelineStage,
} from "@/core/agentWorkspace";
import {
  buildAutoFixContext,
  formatOriginalFailureSummary,
  resumeAutoFixAfterApproval,
  runAutoFixLoop,
  serializeAutoFixContext,
} from "@/core/autoFix";
import { getIntelligenceHost } from "@/app/intelligence/intelligenceHost";
import { recordPromptVisibility } from "@/core/intelligence/promptVisibility";
import { buildAutoFixCallbacks } from "@/app/orchestration/autoFixCallbacks";
import type { AutoFixOrchestrationHost } from "@/app/orchestration/autoFixTypes";
import { effectiveMaxRepairAttempts } from "@/core/providers/costControls";
import {
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import type { AutoFixMode, ProviderId, ProviderSettings } from "@/core/providers/types";
import { recordAutoFix } from "@/core/sessionMemory";
import type { VerificationResult } from "@/types";

function requireAutoFixHost(
  host: AutoFixOrchestrationHost | null,
): AutoFixOrchestrationHost & {
  api: NonNullable<AutoFixOrchestrationHost["api"]>;
  scan: NonNullable<AutoFixOrchestrationHost["scan"]>;
  project: NonNullable<AutoFixOrchestrationHost["project"]>;
} | null {
  if (!host?.api || !host.scan || !host.project) return null;
  return host as AutoFixOrchestrationHost & {
    api: NonNullable<AutoFixOrchestrationHost["api"]>;
    scan: NonNullable<AutoFixOrchestrationHost["scan"]>;
    project: NonNullable<AutoFixOrchestrationHost["project"]>;
  };
}

function createCallbacksFromHost(
  host: AutoFixOrchestrationHost & {
    api: NonNullable<AutoFixOrchestrationHost["api"]>;
    scan: NonNullable<AutoFixOrchestrationHost["scan"]>;
    project: NonNullable<AutoFixOrchestrationHost["project"]>;
  },
  mode: AutoFixMode,
  provider: ProviderId,
  originalFailureLine: string,
  workflow: {
    originalRequest: string;
    planSummary: string;
    planSource: string;
    modifiedFiles: readonly string[];
  },
  orchestrationSettings?: ProviderSettings,
) {
  return buildAutoFixCallbacks(
    {
      api: host.api,
      scan: host.scan,
      projectRoot: host.project.path,
      appendGreenfieldRunLog: host.appendGreenfieldRunLog,
      setAutoFixSession: (updater) => host.setAutoFixSession(updater),
      invokeRepairCall: host.invokeRepairCall,
    },
    mode,
    provider,
    originalFailureLine,
    workflow,
    orchestrationSettings,
  );
}

async function loadAutoFixSettings(host: AutoFixOrchestrationHost): Promise<{
  settingsProvider: ProviderId;
  autoFixMode: AutoFixMode;
  autoFixSettings: ProviderSettings;
  maxRepairAttempts: number;
} | null> {
  if (!host.api) return null;
  try {
    const settings = normalizeProviderSettings(await host.api.getProviderSettings());
    return {
      settingsProvider:
        resolveStageRouting(settings, "repair")?.provider ?? settings.provider,
      autoFixMode: settings.autoFixMode ?? "ask",
      autoFixSettings: settings,
      maxRepairAttempts: effectiveMaxRepairAttempts(settings),
    };
  } catch {
    return null;
  }
}

export async function runAutoFixAutomaticOrchestration(
  host: AutoFixOrchestrationHost | null,
  opts: {
    verification: VerificationResult;
    applied: readonly string[];
    prompt: string;
    planSummary: string;
    planSource: string;
    failureLine: string;
  },
): Promise<{
  ok: boolean;
  verification: VerificationResult | null;
}> {
  const resolved = requireAutoFixHost(host);
  if (!resolved) return { ok: false, verification: null };

  const loaded = await loadAutoFixSettings(resolved);
  if (!loaded) return { ok: false, verification: null };

  const { settingsProvider, autoFixSettings, maxRepairAttempts } = loaded;
  const ctxBase = buildAutoFixContext({
    verification: opts.verification,
    originalRequest: opts.prompt,
    planSummary: opts.planSummary,
    planSource: opts.planSource,
    modifiedFiles: opts.applied,
    attemptNumber: 1,
    projectRoot: resolved.project.path,
    maxAttempts: maxRepairAttempts,
  });
  if (!ctxBase) return { ok: false, verification: null };

  const intelHost = getIntelligenceHost();
  const intelligenceBlock =
    intelHost?.buildIntelligenceForOperation({
      prompt: opts.prompt,
      operation: "auto_fix",
    }).promptBlock ?? "";
  const ctx = { ...ctxBase, intelligenceBlock };
  recordPromptVisibility({
    stage: "repair",
    prompt: [opts.prompt, "", intelligenceBlock].join("\n"),
    provider: settingsProvider,
    model: null,
  });

  const originalFailureLine = formatOriginalFailureSummary(
    ctx.diagnostics,
    opts.failureLine,
  );
  const callbacks = {
    mode: "automatic" as const,
    provider: settingsProvider,
    scan: resolved.scan,
    projectRoot: resolved.project.path,
    originalRequest: opts.prompt,
    planSummary: opts.planSummary,
    planSource: opts.planSource,
    modifiedFiles: opts.applied,
    originalFailureLine,
    proposeFix: async (input: {
      provider: ProviderId;
      context: import("@/core/autoFix/types").AutoFixContext;
      relPath: string;
      absPath: string;
      content: string;
    }) => {
      const patch = await resolved.invokeRepairCall(autoFixSettings, 4096, (provider) =>
        resolved.api.proposeAutoFix(
          provider,
          serializeAutoFixContext(input.context),
          { path: input.relPath, content: input.content },
        ),
      );
      if (!patch) {
        return {
          ok: false,
          provider: input.provider,
          model: "",
          targetPath: input.relPath,
          raw: null,
          latencyMs: 0,
          error: "Repair stopped — provider budget exceeded or run cancelled.",
        };
      }
      return patch;
    },
    readFile: async (absPath: string) => {
      try {
        const res = await resolved.api.readFile(absPath);
        return res.readable && res.content !== undefined ? res.content : null;
      } catch {
        return null;
      }
    },
    applyEdit: (absPath: string, before: string, after: string) =>
      resolved.api.applyEdit(absPath, before, after),
    verify: () => resolved.api.verify(),
    onAttemptLog: () => {},
    onPhase: () => {},
    onPendingRepair: () => {},
  };

  resolved.pushAgent((s) => {
    let n = setTimelineStage(s, "repair", "active");
    return appendAgentFeed(
      n,
      "repairing",
      "Fixing verification errors",
      opts.failureLine,
    );
  });

  const result = await runAutoFixLoop(opts.verification, callbacks, {
    maxAttempts: maxRepairAttempts,
  });
  resolved.setAutoFixSession(result.session);

  if (result.ok && result.verification) {
    resolved.setVerification(result.verification);
    resolved.setVerifyStatus("done");
    resolved.pushAgent((s) => {
      let n = appendAgentHistory(
        s,
        "auto_fix",
        "Auto Fix succeeded",
        result.session.filesChanged.join(", "),
      );
      n = mergeAgentArtifacts(s, {
        errorsFixed: [opts.failureLine],
        filesModified: [...result.session.filesChanged],
      });
      n = setTimelineStage(n, "repair", "done");
      return n;
    });
    return { ok: true, verification: result.verification };
  }

  resolved.pushAgent((s) =>
    appendAgentHistory(s, "auto_fix", "Auto Fix finished", opts.failureLine),
  );
  return { ok: false, verification: result.verification };
}

export async function startAutoFixAfterApplyOrchestration(
  host: AutoFixOrchestrationHost | null,
  opts: {
    verification: VerificationResult;
    applied: string[];
    prompt: string;
    planSummary: string;
    planSource: string;
    failureLine: string;
  },
): Promise<{
  ok: boolean;
  verification: VerificationResult | null;
  awaitingApproval: boolean;
}> {
  const resolved = requireAutoFixHost(host);
  if (!resolved) {
    return { ok: false, verification: null, awaitingApproval: false };
  }

  const loaded = await loadAutoFixSettings(resolved);
  if (!loaded) {
    return { ok: false, verification: null, awaitingApproval: false };
  }

  const { settingsProvider, autoFixMode, autoFixSettings, maxRepairAttempts } =
    loaded;
  if (autoFixMode === "off") {
    return { ok: false, verification: null, awaitingApproval: false };
  }

  const ctx = buildAutoFixContext({
    verification: opts.verification,
    originalRequest: opts.prompt,
    planSummary: opts.planSummary,
    planSource: opts.planSource,
    modifiedFiles: opts.applied,
    attemptNumber: 1,
    projectRoot: resolved.project.path,
    maxAttempts: maxRepairAttempts,
  });
  if (!ctx) {
    return { ok: false, verification: null, awaitingApproval: false };
  }

  const originalFailureLine = formatOriginalFailureSummary(
    ctx.diagnostics,
    opts.failureLine,
  );

  resolved.setAutoFixSession({
    verification: opts.verification,
    originalFailureLine,
    context: ctx,
    phase: "proposing",
    attempts: [],
    pendingRepair: null,
    filesChanged: [],
    finalOutcome: null,
    error: null,
  });

  resolved.appendGreenfieldRunLog(
    "auto_fix",
    "running",
    "Autonomous fix loop started",
    autoFixMode === "automatic" ? "Automatic mode" : "Ask before repair",
  );

  const callbacks = createCallbacksFromHost(
    resolved,
    autoFixMode,
    settingsProvider,
    originalFailureLine,
    {
      originalRequest: opts.prompt,
      planSummary: opts.planSummary,
      planSource: opts.planSource,
      modifiedFiles: opts.applied,
    },
    autoFixSettings,
  );

  const result = await runAutoFixLoop(opts.verification, callbacks, {
    maxAttempts: maxRepairAttempts,
  });

  resolved.setAutoFixSession(result.session);
  if (result.ok && result.verification) {
    resolved.setVerification(result.verification);
    resolved.setVerifyStatus("done");
    resolved.setPlanApplyError(null);
    resolved.appendGreenfieldRunLog("auto_fix", "success", "Auto Fix completed");
    resolved.setSessionMemory((m) =>
      recordAutoFix(m, "Auto Fix completed", result.session.filesChanged),
    );
    void resolved.runScan();
    return {
      ok: true,
      verification: result.verification,
      awaitingApproval: false,
    };
  }
  if (result.awaitingApproval) {
    resolved.appendGreenfieldRunLog(
      "auto_fix",
      "running",
      "Repair proposal ready — awaiting approval",
    );
    return {
      ok: false,
      verification: result.verification,
      awaitingApproval: true,
    };
  }
  resolved.appendGreenfieldRunLog(
    "auto_fix",
    "failed",
    result.session.error ?? "Auto Fix exhausted attempts",
  );
  return {
    ok: false,
    verification: result.verification,
    awaitingApproval: false,
  };
}

export async function approveAutoFixRepairOrchestration(
  host: AutoFixOrchestrationHost | null,
): Promise<void> {
  const resolved = requireAutoFixHost(host);
  if (!resolved?.autoFixSession) return;

  const loaded = await loadAutoFixSettings(resolved);
  if (!loaded) return;

  const { settingsProvider, autoFixMode, autoFixSettings } = loaded;
  const callbacks = createCallbacksFromHost(
    resolved,
    autoFixMode,
    settingsProvider,
    resolved.autoFixSession.originalFailureLine,
    {
      originalRequest: resolved.autoFixSession.context.originalRequest,
      planSummary: resolved.autoFixSession.context.planSummary,
      planSource: resolved.autoFixSession.context.planSource,
      modifiedFiles: resolved.autoFixSession.context.modifiedFiles,
    },
    autoFixSettings,
  );

  resolved.setAutoFixSession((prev) =>
    prev ? { ...prev, phase: "applying", pendingRepair: prev.pendingRepair } : prev,
  );

  const result = await resumeAutoFixAfterApproval(resolved.autoFixSession, callbacks);
  resolved.setAutoFixSession(result.session);

  if (result.ok && result.verification) {
    resolved.setVerification(result.verification);
    resolved.setVerifyStatus("done");
    resolved.setPlanApplyError(null);
    resolved.setPlanApplySession(null);
    resolved.appendGreenfieldRunLog("auto_fix", "success", "Auto Fix completed");
    resolved.setSessionMemory((m) =>
      recordAutoFix(m, "Auto Fix completed", result.session.filesChanged),
    );
    void resolved.runScan();
  }
}

export function cancelAutoFixOrchestration(
  host: AutoFixOrchestrationHost | null,
): void {
  if (!host) return;
  host.setAutoFixSession((prev) =>
    prev
      ? {
          ...prev,
          phase: "failed",
          finalOutcome: "cancelled",
          pendingRepair: null,
        }
      : prev,
  );
  host.appendGreenfieldRunLog("auto_fix", "failed", "Auto Fix cancelled by user");
}
