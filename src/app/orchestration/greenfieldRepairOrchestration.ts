import {
  buildAutoFixContext,
  serializeAutoFixContext,
} from "@/core/autoFix";
import {
  buildGreenfieldSetupFailureReport,
  pipelineStageToRunLogStage,
} from "@/core/diagnostics/failureReport";
import { buildPreviewFailureReport } from "@/core/preview/diagnostics";
import {
  buildGreenfieldRepairPromptText,
  createGreenfieldRepairSnapshot,
  DEFAULT_GREENFIELD_REPAIR_ATTEMPTS,
  GREENFIELD_AI_REPAIR_ATTEMPTS,
  GREENFIELD_ESCALATION_REPAIR_ATTEMPTS,
  greenfieldRepairFailureKind,
  mergeSetupAfterBuild,
  mergeSetupAfterTypecheck,
  pickGreenfieldRepairTarget,
  primaryErrorLineFromSetup,
  greenfieldRepairAskHeadline,
  resolveGreenfieldRepairMaxOutputTokens,
  type GreenfieldRepairSnapshot,
} from "@/core/greenfield/repair";
import { commandResultLine, createLatestAction } from "@/core/greenfield/runLog";
import type { RunLogStage } from "@/core/greenfield/runLog";
import { buildTypeScriptCheckDetailsFromCommand, resolveTypecheckDetails } from "@/core/greenfield/tscDiagnostics";
import { applyDeterministicRepairsForGreenfieldSetup } from "@/app/orchestration/deterministicProjectRepairOrchestration";
import { collectRelatedTypeDefinitions } from "@/core/typescript/missingPropertyRepair";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import {
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import {
  strongerModelSettingsPatch,
  suggestStrongerModelStep,
} from "@/core/build/modelEscalation";
import { logProviderFallback } from "@/core/providers/providerDiagnostics";
import {
  isRepairParseError,
  REPAIR_EXHAUSTED_USER,
  REPAIR_INVALID_FORMAT_USER,
} from "@/core/greenfield/repairParse";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import type { AutoFixMode, ProviderSettings } from "@/core/providers/types";
import {
  markGreenfieldUiAuditAdvisorySuccess,
  runGreenfieldUiAuditAndRepair,
  type GreenfieldUiRepairHost,
} from "@/app/orchestration/greenfieldUiRepairOrchestration";
import { runGreenfieldRuntimeSmokeCheck } from "@/app/orchestration/greenfieldRuntimeSmokeOrchestration";
import type { BryantLabsApi, ProjectInfo, AIPatchResult } from "@/types";

export interface GreenfieldRepairHost {
  readonly api: BryantLabsApi;
  readonly project: ProjectInfo;
  readonly appendGreenfieldRunLog: (
    stage: RunLogStage,
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => void;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly setAppPreview: (state: {
    url: string | null;
    running: boolean;
    root: string;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }) => void;
  readonly requestPreviewTab: () => void;
  readonly invokeRepairCall?: <T extends StageProviderResult>(
    settings: ProviderSettings,
    maxTokens: number,
    call: (provider: import("@/core/providers/types").ProviderId) => Promise<T>,
  ) => Promise<T | null>;
}

async function loadRepairSettings(api: BryantLabsApi): Promise<{
  autoFixMode: AutoFixMode;
  settings: ProviderSettings;
  repairProvider: import("@/core/providers/types").ProviderId;
} | null> {
  try {
    const settings = normalizeProviderSettings(await api.getProviderSettings());
    return {
      autoFixMode: settings.autoFixMode ?? "ask",
      settings,
      repairProvider:
        resolveStageRouting(settings, "repair")?.provider ?? settings.provider,
    };
  } catch {
    return null;
  }
}

function canRepairSetup(setup: GreenfieldSetupResult): boolean {
  return Boolean(
    setup.install.ok &&
      ((setup.typecheck && !setup.typecheck.ok) ||
        (setup.typecheck?.ok && setup.build && !setup.build.ok)),
  );
}

export function shouldOfferGreenfieldRepair(
  setup: GreenfieldSetupResult,
  autoFixMode: AutoFixMode,
): boolean {
  return autoFixMode !== "off" && canRepairSetup(setup);
}

async function readProjectFile(
  api: BryantLabsApi,
  projectRoot: string,
  relPath: string,
): Promise<string | null> {
  const abs = `${projectRoot.replace(/\/$/, "")}/${relPath}`;
  try {
    const res = await api.readFile(abs);
    return res.readable && res.content !== undefined ? res.content : null;
  } catch {
    return null;
  }
}

async function runTypecheck(
  api: BryantLabsApi,
  root: string,
  previous: GreenfieldSetupResult,
): Promise<GreenfieldSetupResult> {
  const res = await api.greenfieldTypecheck(root);
  if ("error" in res) {
    return { ...previous, ok: false, error: res.error };
  }
  const details = res.typecheckDetails ?? buildTypeScriptCheckDetailsFromCommand(res.typecheck);
  return mergeSetupAfterTypecheck(previous, res.typecheck, details);
}

async function runBuildStep(
  api: BryantLabsApi,
  root: string,
  previous: GreenfieldSetupResult,
): Promise<GreenfieldSetupResult> {
  const res = await api.greenfieldBuild(root);
  if ("error" in res) {
    return { ...previous, ok: false, error: res.error };
  }
  return mergeSetupAfterBuild(previous, res.build);
}

async function startPreview(
  host: GreenfieldRepairHost,
  folderPath: string,
  setup: GreenfieldSetupResult,
  userPrompt = "",
): Promise<{ ok: boolean; message: string }> {
  if (setup.ok) {
    await runGreenfieldRuntimeSmokeCheck({
      api: host.api,
      projectRoot: folderPath,
      userPrompt,
      appendGreenfieldRunLog: host.appendGreenfieldRunLog,
    });
  }
  host.appendGreenfieldRunLog("preview", "running", "Preview started");
  const preview = await host.api.greenfieldPreviewStart(folderPath);
  if (preview.ok && preview.url) {
    host.appendGreenfieldRunLog("preview", "success", "Preview started", preview.url);
    host.setAppPreview({
      url: preview.url,
      running: true,
      root: folderPath,
      lastSuccessfulPreviewAt: Date.now(),
      port: (() => {
        try {
          const p = new URL(preview.url).port;
          return p ? Number(p) : 4173;
        } catch {
          return 4173;
        }
      })(),
    });
    host.requestPreviewTab();

    const uiHost: GreenfieldUiRepairHost = {
      api: host.api,
      appendGreenfieldRunLog: host.appendGreenfieldRunLog,
      updateGreenfieldRun: host.updateGreenfieldRun,
      setAppPreview: host.setAppPreview,
      requestPreviewTab: host.requestPreviewTab,
    };
    const uiOutcome = await runGreenfieldUiAuditAndRepair(uiHost, {
      folderPath,
      previewUrl: preview.url,
      setup,
      userPrompt,
      uiAuditHistory: [],
    });
    if (!uiOutcome.ok) {
      if (setup.ok) {
        markGreenfieldUiAuditAdvisorySuccess(
          uiOutcome.audit,
          host.updateGreenfieldRun,
          uiOutcome.uiAuditHistory,
          null,
          uiOutcome.repaired,
        );
        return { ok: true, message: uiOutcome.finalMessage };
      }
      host.updateGreenfieldRun({
        runResult: "failed",
        uiAuditResult: uiOutcome.audit,
        uiAuditHistory: uiOutcome.uiAuditHistory,
        finalMessage: uiOutcome.finalMessage,
        latestAction: createLatestAction("failed", "UI audit failed", {
          stage: "ui_audit",
          detail: uiOutcome.finalMessage,
        }),
      });
      return { ok: false, message: uiOutcome.finalMessage };
    }

    host.updateGreenfieldRun({
      setupStatus: "done",
      setupResult: setup,
      runResult: "success",
      lastSuccessfulRunAt: Date.now(),
      finalMessage: uiOutcome.finalMessage,
      failureReport: null,
      greenfieldRepair: null,
      uiAuditResult: uiOutcome.audit,
      uiAuditHistory: uiOutcome.uiAuditHistory,
      latestAction: createLatestAction("success", "Greenfield run complete", {
        stage: "ui_audit",
        detail: uiOutcome.finalMessage,
      }),
    });
    return { ok: true, message: uiOutcome.finalMessage };
  }

  const rootCause = preview.diagnostics?.rootCause ?? preview.error ?? "unknown";
  host.appendGreenfieldRunLog("preview", "failed", "Preview failed to start", rootCause);
  const previewReport = preview.diagnostics
    ? buildPreviewFailureReport(preview.diagnostics)
    : buildGreenfieldSetupFailureReport(setup, rootCause, {
        exitCode: 1,
        port: 4173,
        crashed: false,
      });
  host.updateGreenfieldRun({
    runResult: "failed",
    failureReport: previewReport,
    finalMessage: previewReport.rootCauseLine,
    latestAction: createLatestAction("failed", previewReport.rootCauseLine, {
      stage: "preview",
      detail: previewReport.rootCauseLine,
    }),
  });
  return { ok: false, message: previewReport.rootCauseLine };
}


async function proposeGreenfieldRepairWithFallback(
  host: GreenfieldRepairHost,
  opts: {
    api: BryantLabsApi;
    target: string;
    content: string;
    ctx: NonNullable<ReturnType<typeof buildAutoFixContext>>;
    settings: ProviderSettings;
    repairProvider: import("@/core/providers/types").ProviderId;
  },
): Promise<AIPatchResult> {
  const repairRouting = resolveStageRouting(opts.settings, "repair");
  const currentModel =
    repairRouting?.model ??
    opts.settings.geminiModel ??
    opts.settings.anthropicModel ??
    "";

  const proposeOnce = async (
    provider: import("@/core/providers/types").ProviderId,
    strictFormat: boolean,
  ): Promise<AIPatchResult> => {
    const serialized = serializeAutoFixContext({
      ...opts.ctx,
      ...(strictFormat ? { strictFormat: true } : {}),
    });
    const call = () =>
      opts.api.proposeAutoFix(provider, serialized, {
        path: opts.target,
        content: opts.content,
      });
    if (host.invokeRepairCall) {
      const repairTokens = resolveGreenfieldRepairMaxOutputTokens(opts.settings);
      const result = await host.invokeRepairCall<AIPatchResult>(opts.settings, repairTokens, () => call());
      return (
        result ?? {
          ok: false,
          provider,
          model: currentModel,
          targetPath: opts.target,
          raw: null,
          latencyMs: 0,
          error: "Repair call blocked.",
        }
      );
    }
    return call();
  };

  let lastError = REPAIR_EXHAUSTED_USER;

  for (let aiTry = 1; aiTry <= GREENFIELD_AI_REPAIR_ATTEMPTS; aiTry++) {
    const strict = aiTry > 1;
    const patch = await proposeOnce(opts.repairProvider, strict);
    if (patch.ok && patch.proposal) return patch;
    lastError = patch.error ?? REPAIR_EXHAUSTED_USER;
    if (isRepairParseError(lastError)) {
      host.appendGreenfieldRunLog(
        "greenfield_repair",
        "running",
        REPAIR_INVALID_FORMAT_USER,
      );
      continue;
    }
    return patch;
  }

  const step = suggestStrongerModelStep(
    opts.repairProvider,
    currentModel,
    opts.settings,
  );
  if (step) {
    logProviderFallback({
      from: currentModel,
      to: step.model,
      reason: "greenfield_repair_escalation",
      stage: "repair",
    });
    host.appendGreenfieldRunLog(
      "greenfield_repair",
      "running",
      `Escalating repair to ${step.label}…`,
    );
    try {
      await opts.api.saveProviderSettings(strongerModelSettingsPatch(step));
    } catch {
      /* use existing provider settings */
    }
    for (let i = 0; i < GREENFIELD_ESCALATION_REPAIR_ATTEMPTS; i++) {
      const patch = await proposeOnce(step.provider, true);
      if (patch.ok && patch.proposal) return patch;
      lastError = patch.error ?? REPAIR_EXHAUSTED_USER;
    }
  }

  return {
    ok: false,
    provider: opts.repairProvider,
    model: currentModel,
    targetPath: opts.target,
    raw: null,
    latencyMs: 0,
    error: isRepairParseError(lastError) ? REPAIR_EXHAUSTED_USER : lastError,
  };
}

async function applyRepairAttempt(
  host: GreenfieldRepairHost,
  opts: {
    setup: GreenfieldSetupResult;
    userPrompt: string;
    filesWritten: readonly string[];
    attempt: number;
    maxAttempts: number;
    settings: ProviderSettings;
    repairProvider: import("@/core/providers/types").ProviderId;
  },
): Promise<{
  ok: boolean;
  relPath: string | null;
  detail: string;
  setup: GreenfieldSetupResult;
}> {
  const { api, project } = host;
  const target = pickGreenfieldRepairTarget(
    opts.setup,
    opts.filesWritten,
    project.path,
  );
  if (!target) {
    return {
      ok: false,
      relPath: null,
      detail: "No repairable generated file in scope.",
      setup: opts.setup,
    };
  }

  const content = await readProjectFile(api, project.path, target);
  if (content == null) {
    return {
      ok: false,
      relPath: target,
      detail: `Could not read ${target}.`,
      setup: opts.setup,
    };
  }

  host.appendGreenfieldRunLog(
    "greenfield_repair",
    "running",
    `Repair attempt ${opts.attempt} running`,
    target,
  );

  const abs = `${project.path.replace(/\/$/, "")}/${target}`;
  let workingContent = content;

  const verification = {
    typecheck:
      opts.setup.typecheck ??
      ({
        command: "npx tsc --noEmit",
        ok: false,
        exitCode: 2,
        stdout: "",
        stderr: "",
        durationMs: 0,
        errorCount: 1,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      } as const),
    build:
      opts.setup.build ??
      ({
        command: "npm run build",
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 0,
        errorCount: 0,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      } as const),
    ranAt: Date.now(),
  };

  const ctx = buildAutoFixContext({
    verification,
    originalRequest: opts.userPrompt,
    planSummary: "Greenfield generated app",
    planSource: "greenfield",
    modifiedFiles: opts.filesWritten,
    attemptNumber: opts.attempt,
    projectRoot: project.path,
    maxAttempts: opts.maxAttempts,
  });
  if (!ctx) {
    return {
      ok: false,
      relPath: target,
      detail: "Could not build repair context.",
      setup: opts.setup,
    };
  }

  const details = resolveTypecheckDetails(opts.setup);
  const relatedTypeDefinitions = details
    ? await collectRelatedTypeDefinitions(
        target,
        workingContent,
        details.diagnostics,
        (path) => readProjectFile(api, project.path, path),
      )
    : "";

  const ctxWithTypes = {
    ...ctx,
    ...(relatedTypeDefinitions ? { relatedTypeDefinitions } : {}),
  };

  const patch = await proposeGreenfieldRepairWithFallback(host, {
    api,
    target,
    content: workingContent,
    ctx: ctxWithTypes,
    settings: opts.settings,
    repairProvider: opts.repairProvider,
  });

  if (!patch.ok || !patch.proposal) {
    const err = patch.error ?? REPAIR_EXHAUSTED_USER;
    host.appendGreenfieldRunLog(
      "greenfield_repair",
      "failed",
      `Repair attempt ${opts.attempt} failed`,
      err,
    );
    return { ok: false, relPath: target, detail: err, setup: opts.setup };
  }

  const edit = await api.applyEdit(abs, workingContent, patch.proposal.newContent);
  if (!edit.ok) {
    const err = edit.reason ?? "Could not apply repair.";
    host.appendGreenfieldRunLog(
      "greenfield_repair",
      "failed",
      `Repair attempt ${opts.attempt} apply failed`,
      err,
    );
    return { ok: false, relPath: target, detail: err, setup: opts.setup };
  }

  host.appendGreenfieldRunLog(
    "greenfield_repair",
    "success",
    `Repair attempt ${opts.attempt} applied`,
    target,
  );

  return { ok: true, relPath: target, detail: target, setup: opts.setup };
}

export function prepareGreenfieldRepairState(opts: {
  setup: GreenfieldSetupResult;
  userPrompt: string;
  filesWritten: readonly string[];
  projectRoot: string;
  maxAttempts?: number;
}): GreenfieldRepairSnapshot | null {
  const target = pickGreenfieldRepairTarget(
    opts.setup,
    opts.filesWritten,
    opts.projectRoot,
  );
  if (!target) return null;
  return createGreenfieldRepairSnapshot({
    setup: opts.setup,
    userPrompt: opts.userPrompt,
    generatedFiles: opts.filesWritten,
    targetPath: target,
    targetContent: "",
    maxAttempts: opts.maxAttempts ?? DEFAULT_GREENFIELD_REPAIR_ATTEMPTS,
  });
}

export async function runGreenfieldRepairPipeline(
  host: GreenfieldRepairHost,
  opts: {
    folderPath: string;
    userPrompt: string;
    filesWritten: readonly string[];
    setup: GreenfieldSetupResult;
    maxAttempts?: number;
  },
): Promise<{
  ok: boolean;
  setup: GreenfieldSetupResult;
  repair: GreenfieldRepairSnapshot | null;
  message: string | null;
}> {
  const loaded = await loadRepairSettings(host.api);
  if (!loaded) {
    return { ok: false, setup: opts.setup, repair: null, message: null };
  }

  const maxAttempts = opts.maxAttempts ?? DEFAULT_GREENFIELD_REPAIR_ATTEMPTS;
  let setup = opts.setup;
  const attempts: GreenfieldRepairSnapshot["attempts"][number][] = [];
  const filesRepaired: string[] = [];

  host.appendGreenfieldRunLog("greenfield_repair", "running", "Repair needed");
  host.updateGreenfieldRun({
    setupStatus: "repairing",
    greenfieldRepair: {
      status: "repairing",
      failureKind: greenfieldRepairFailureKind(setup),
      primaryErrorLine: primaryErrorLineFromSetup(setup),
      repairPrompt: "",
      attempts,
      filesRepaired,
      pendingRelPath: null,
      pendingSummary: null,
    },
  });

  const detPass = await applyDeterministicRepairsForGreenfieldSetup(
    host.api,
    opts.folderPath,
    setup,
    host,
  );
  setup = detPass.setup;
  host.updateGreenfieldRun({ setupResult: setup });

  let failureKind = greenfieldRepairFailureKind(setup);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (failureKind === "typescript" || (setup.typecheck && !setup.typecheck.ok)) {
      const repair = await applyRepairAttempt(host, {
        setup,
        userPrompt: opts.userPrompt,
        filesWritten: opts.filesWritten,
        attempt,
        maxAttempts,
        settings: loaded.settings,
        repairProvider: loaded.repairProvider,
      });
      attempts.push({
        attempt,
        targetPath: repair.relPath ?? "—",
        outcome: repair.ok ? "applied" : "failed",
        detail: repair.detail,
      });
      if (repair.ok && repair.relPath) filesRepaired.push(repair.relPath);

      host.appendGreenfieldRunLog("typescript", "running", "TypeScript check started");
      setup = await runTypecheck(host.api, opts.folderPath, setup);

      if (!setup.typecheck?.ok) {
        const again = await applyDeterministicRepairsForGreenfieldSetup(
          host.api,
          opts.folderPath,
          setup,
          host,
          { maxPasses: 8 },
        );
        setup = again.setup;
      }

      host.appendGreenfieldRunLog(
        "typescript",
        setup.typecheck?.ok ? "success" : "failed",
        setup.typecheck?.ok ? "TypeScript check finished" : "TypeScript check failed",
        setup.typecheck ? commandResultLine(setup.typecheck) : undefined,
      );
      host.updateGreenfieldRun({ setupResult: setup });

      if (setup.typecheck?.ok) {
        failureKind = "build";
        break;
      }
      if (attempt === maxAttempts) break;
      continue;
    }
    break;
  }

  if (setup.typecheck?.ok) {
    host.appendGreenfieldRunLog("build", "running", "Build started");
    setup = await runBuildStep(host.api, opts.folderPath, setup);
    host.appendGreenfieldRunLog(
      "build",
      setup.build?.ok ? "success" : "failed",
      setup.build?.ok ? "Build finished" : "Build failed",
      setup.build ? commandResultLine(setup.build) : undefined,
    );
    host.updateGreenfieldRun({ setupResult: setup });

    if (setup.build && !setup.build.ok) {
      failureKind = "build";
      for (let attempt = attempts.length + 1; attempt <= maxAttempts; attempt++) {
        const repair = await applyRepairAttempt(host, {
          setup,
          userPrompt: opts.userPrompt,
          filesWritten: [...opts.filesWritten, ...filesRepaired],
          attempt,
          maxAttempts,
          settings: loaded.settings,
          repairProvider: loaded.repairProvider,
        });
        attempts.push({
          attempt,
          targetPath: repair.relPath ?? "—",
          outcome: repair.ok ? "applied" : "failed",
          detail: repair.detail,
        });
        if (repair.ok && repair.relPath) filesRepaired.push(repair.relPath);

        host.appendGreenfieldRunLog("typescript", "running", "TypeScript check started");
        setup = await runTypecheck(host.api, opts.folderPath, setup);
        host.appendGreenfieldRunLog(
          "typescript",
          setup.typecheck?.ok ? "success" : "failed",
          setup.typecheck?.ok ? "TypeScript check finished" : "TypeScript check failed",
          setup.typecheck ? commandResultLine(setup.typecheck) : undefined,
        );
        if (!setup.typecheck?.ok) break;

        host.appendGreenfieldRunLog("build", "running", "Build started");
        setup = await runBuildStep(host.api, opts.folderPath, setup);
        host.appendGreenfieldRunLog(
          "build",
          setup.build?.ok ? "success" : "failed",
          setup.build?.ok ? "Build finished" : "Build failed",
          setup.build ? commandResultLine(setup.build) : undefined,
        );
        host.updateGreenfieldRun({ setupResult: setup });
        if (setup.build?.ok) break;
      }
    }
  }

  const target = pickGreenfieldRepairTarget(setup, opts.filesWritten, host.project.path);
  const targetContent =
    target != null
      ? (await readProjectFile(host.api, host.project.path, target)) ?? ""
      : "";

  const repairSnapshot: GreenfieldRepairSnapshot = {
    status: setup.ok ? "repaired" : "failed",
    failureKind: greenfieldRepairFailureKind(setup),
    primaryErrorLine: primaryErrorLineFromSetup(setup),
    repairPrompt: target
      ? buildGreenfieldRepairPromptText({
          userPrompt: opts.userPrompt,
          generatedFiles: opts.filesWritten,
          setup,
          targetPath: target,
          targetContent,
          attempt: Math.min(attempts.length + 1, maxAttempts),
          maxAttempts,
        })
      : "",
    attempts,
    filesRepaired,
    pendingRelPath: null,
    pendingSummary: null,
  };

  if (setup.ok) {
    host.updateGreenfieldRun({
      greenfieldRepair: repairSnapshot,
      setupResult: setup,
    });
    const preview = await startPreview(host, opts.folderPath, setup, opts.userPrompt);
    return {
      ok: preview.ok,
      setup,
      repair: repairSnapshot,
      message: preview.message,
    };
  }

  const failReport = buildGreenfieldSetupFailureReport(setup);
  const failLine = attempts.some((a) => isRepairParseError(a.detail))
    ? REPAIR_EXHAUSTED_USER
    : failReport.rootCauseLine;
  host.appendGreenfieldRunLog(
    "greenfield_repair",
    "failed",
    "Repair exhausted",
    failLine,
  );
  host.updateGreenfieldRun({
    setupStatus: "error",
    runResult: "failed",
    failureReport: failReport,
    finalMessage: failLine,
    greenfieldRepair: { ...repairSnapshot, status: "failed" },
    latestAction: createLatestAction("failed", failLine, {
      ...(failReport.rootStage
        ? { stage: pipelineStageToRunLogStage(failReport.rootStage) }
        : {}),
      detail: failLine,
    }),
  });
  return {
    ok: false,
    setup,
    repair: repairSnapshot,
    message: failLine,
  };
}

export async function markGreenfieldRepairNeeded(
  host: GreenfieldRepairHost,
  opts: {
    setup: GreenfieldSetupResult;
    userPrompt: string;
    filesWritten: readonly string[];
    projectRoot: string;
  },
): Promise<GreenfieldRepairSnapshot | null> {
  const target = pickGreenfieldRepairTarget(
    opts.setup,
    opts.filesWritten,
    opts.projectRoot,
  );
  if (!target) return null;

  const targetContent =
    (await readProjectFile(host.api, opts.projectRoot, target)) ?? "";
  const repair = createGreenfieldRepairSnapshot({
    setup: opts.setup,
    userPrompt: opts.userPrompt,
    generatedFiles: opts.filesWritten,
    targetPath: target,
    targetContent,
    maxAttempts: DEFAULT_GREENFIELD_REPAIR_ATTEMPTS,
  });

  host.appendGreenfieldRunLog("greenfield_repair", "running", "Repair needed");
  host.appendGreenfieldRunLog("greenfield_repair", "success", "Repair prompt created");

  host.updateGreenfieldRun({
    setupStatus: "repair_needed",
    setupResult: opts.setup,
    greenfieldRepair: repair,
    latestAction: createLatestAction("failed", greenfieldRepairAskHeadline(opts.setup), {
      stage: "greenfield_repair",
      detail: repair.primaryErrorLine,
    }),
  });
  return repair;
}
