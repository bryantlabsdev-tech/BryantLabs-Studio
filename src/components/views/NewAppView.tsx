import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import {
  PROVIDERS,
  getProviderInfo,
  isProviderReady,
  modelForProvider,
  patchModelForProvider,
} from "@/core/providers";
import { resolveGreenfieldAutoWriteDecision } from "@/core/agent/greenfieldAutoWrite";
import { GREENFIELD_FILE_PATHS, greenfieldReviewFilePathList, greenfieldReviewFiles } from "@/core/greenfield";
import type {
  GeneratedFile,
  GreenfieldGenerateResult,
  GreenfieldProjectFile,
  GreenfieldSetupResult,
} from "@/core/greenfield/types";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import { EmptyState } from "@/components/EmptyState";
import { GreenfieldFailureInvestigationPanel } from "@/components/views/GreenfieldFailureInvestigationPanel";
import { GreenfieldTypecheckPanel } from "@/components/views/GreenfieldTypecheckPanel";
import {
  buildGreenfieldSetupFailureReport,
  pipelineStageToRunLogStage,
} from "@/core/diagnostics/failureReport";
import { buildPreviewFailureReport } from "@/core/preview/diagnostics";
import { resolveTypecheckDetails } from "@/core/greenfield/tscDiagnostics";
import {
  commandResultLine,
  createLatestAction,
  latestActionSummaryForWriteFailure,
  writeFailureLogMessage,
} from "@/core/greenfield/runLog";
import { isGreenfieldSetupTransportError } from "@/core/greenfield/setupApi";
import { GreenfieldRepairPanel } from "@/components/views/GreenfieldRepairPanel";
import {
  markGreenfieldRepairNeeded,
  runGreenfieldRepairPipeline,
  shouldOfferGreenfieldRepair,
  type GreenfieldRepairHost,
} from "@/app/orchestration/greenfieldRepairOrchestration";
import {
  markGreenfieldUiAuditAdvisorySuccess,
  markGreenfieldUiAuditFailure,
  runGreenfieldUiAuditAndRepair,
  type GreenfieldUiRepairHost,
} from "@/app/orchestration/greenfieldUiRepairOrchestration";
import { runGreenfieldRuntimeSmokeCheck } from "@/app/orchestration/greenfieldRuntimeSmokeOrchestration";
import { greenfieldRepairAskHeadline } from "@/core/greenfield/repair";
import {
  folderNotEmptyUserMessage,
  isFolderNotEmptyWriteError,
} from "@/core/greenfield/folderWrite";
import { emitWriteFileLogs } from "@/core/greenfield/writeLog";
import type { AutoFixMode } from "@/core/providers/types";
import { computeDiff } from "@/core/editor";
import {
  inferAbortCauseAnalysis,
  inferErrorName,
  redactSecrets,
  type GreenfieldDebugReport,
} from "@/core/greenfield/debug";
import { runGreenfieldGenerateWithReliability } from "@/core/greenfield/generatePipeline";
import { emitGreenfieldConsoleEvent } from "@/core/console/greenfieldConsoleEvents";
import { beginRunTimeline, recordRunTimelineStage } from "@/core/agent/runTimeline";
import { logPromptSubmission } from "@/core/agent/promptSubmission";
/**
 * New App wizard (Phase 10). Greenfield generation from an empty folder —
 * not agent mode. Human approves before any write; auto-repair may run on TS/build failure.
 */
export interface NewAppViewProps {
  /** Pre-fill from Agent composer when embedded. */
  readonly initialPrompt?: string;
  /** Render inside Agent panel (stay on build rail after success). */
  readonly embedded?: boolean;
  /** Called when generation completes in embedded mode. */
  readonly onComplete?: () => void;
  /** Return to Agent chat without finishing greenfield. */
  readonly onCancel?: () => void;
  /** Refresh scan after greenfield writes files (embedded Agent flow). */
  readonly onGreenfieldComplete?: () => Promise<void>;
  /** Record unified Agent chat success message (embedded flow). */
  readonly onAgentGreenfieldSuccess?: (input: {
    prompt: string;
    filesWritten: readonly string[];
    typecheckPassed: boolean;
    buildPassed: boolean;
    previewReady: boolean;
    uiAuditPassed: boolean;
  }) => void;
  /** Block starting generation when another Agent run is active. */
  readonly agentRunBlockReason?: string | null;
  /** Pre-selected empty folder (e.g. open project path from Agent). */
  readonly initialFolder?: { readonly path: string; readonly name: string };
  /** Auto-run generation once folder, prompt, and provider are ready. */
  readonly autoStartGeneration?: boolean;
  /** Retry npm install / typecheck / build using prior generated files. */
  readonly greenfieldRecovery?: boolean;
  /** Agent thread mode: no wizard chrome; errors/repair only. */
  readonly headless?: boolean;
  /** One Agent: run orchestration only; never mount legacy inline panels. */
  readonly agentOnly?: boolean;
  /** Surfaces hard failures when auto-start or generation cannot begin. */
  readonly onSubmissionError?: (message: string) => void;
}

export function NewAppView({
  initialPrompt,
  embedded = false,
  onComplete,
  onCancel,
  onGreenfieldComplete,
  onAgentGreenfieldSuccess,
  agentRunBlockReason = null,
  initialFolder,
  autoStartGeneration = false,
  greenfieldRecovery = false,
  headless = false,
  agentOnly = false,
  onSubmissionError,
}: NewAppViewProps = {}) {
  const api = window.bryantlabs;
  const {
    openProjectAt,
    setAppPreview,
    requestPreviewTab,
    appendGreenfieldRunLog,
    resetGreenfieldRun,
    updateGreenfieldRun,
    setCenterTab,
    setRailTool,
    greenfieldRun,
    project,
    refreshProviderStatus,
    invokeGreenfieldCall,
    invokeGreenfieldRawCall,
    invokeGreenfieldReservedCompletion,
    providerInvokeStopRef,
    providerRequestSentRef,
    resetAiCallTracker,
    prepareGreenfieldCallBudget,
    prepareMultiPhaseGreenfieldCallBudget,
    canMakeAiCall,
    invokeRepairCall,
    recordAgentActivityMessage,
    registerGreenfieldRunControl,
    rescan,
  } = useWorkspace();

  const agentStreamlined = embedded && autoStartGeneration;

  const [folder, setFolder] = useState<{ path: string; name: string } | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [selectingFolder, setSelectingFolder] = useState(false);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt?.trim() || "Build a calculator app");
  const [genResult, setGenResult] = useState<GreenfieldGenerateResult | null>(null);
  const [genStatus, setGenStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [approved, setApproved] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>(GREENFIELD_FILE_PATHS[0]);
  const [writeStatus, setWriteStatus] = useState<
    "idle" | "writing" | "done" | "error" | "blocked"
  >("idle");
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writeBlocked, setWriteBlocked] = useState(false);
  const [clearFolderConfirm, setClearFolderConfirm] = useState(false);
  const [setupResult, setSetupResult] = useState<GreenfieldSetupResult | null>(null);
  const [setupStatus, setSetupStatus] = useState<
    "idle" | "running" | "done" | "error" | "repair_needed" | "repairing"
  >("idle");
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const generateFnRef = useRef<(() => Promise<void>) | null>(null);
  const generateLockRef = useRef(false);
  const writeAndSetupRef = useRef<
    (
      targetFolder?: { path: string; name: string },
      opts?: { autoApproved?: boolean; setupOnly?: boolean },
    ) => Promise<void>
  >(async () => {});
  const autoStartedRef = useRef(false);
  const autoPipelineTriggeredRef = useRef(false);
  const recoveryStartedRef = useRef(false);
  const lastGreenfieldActivityRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const [repairing, setRepairing] = useState(false);
  const runGreenfieldRepairRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!agentOnly) return;
    registerGreenfieldRunControl({
      cancel: () => {
        cancelledRef.current = true;
        setGenStatus("idle");
        setWriteStatus("idle");
        setSetupStatus("idle");
        setRepairing(false);
      },
      runRepair: async () => {
        await runGreenfieldRepairRef.current?.();
      },
    });
    return () => registerGreenfieldRunControl(null);
  }, [agentOnly, registerGreenfieldRunControl]);

  const typecheckDetails = useMemo(
    () => (setupResult ? resolveTypecheckDetails(setupResult) : undefined),
    [setupResult],
  );

  useEffect(() => {
    if (!embedded) return;
    const target = initialFolder ?? (project ? { path: project.path, name: project.name } : null);
    if (!target?.path) return;
    setFolder((prev) => prev ?? target);
    updateGreenfieldRun({ targetFolder: target.path });
  }, [embedded, initialFolder, project?.path, project?.name, updateGreenfieldRun]);

  useEffect(() => {
    if (!embedded || !autoStartGeneration || autoStartedRef.current) return;
    if (genStatus === "running" || generateLockRef.current) return;
    if (!folder || !settings || !prompt.trim()) return;
    if (!isProviderReady(settings)) {
      onSubmissionError?.("Connect an AI provider in Settings before generating.");
      return;
    }
    if (agentRunBlockReason) {
      onSubmissionError?.(agentRunBlockReason);
      autoStartedRef.current = true;
      return;
    }
    const fn = generateFnRef.current;
    if (!fn) return;
    void fn();
  }, [
    embedded,
    autoStartGeneration,
    folder,
    settings,
    prompt,
    agentRunBlockReason,
    onSubmissionError,
    genStatus,
  ]);

  useEffect(() => {
    if (initialPrompt?.trim()) {
      setPrompt(initialPrompt.trim());
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (!embedded || !autoStartGeneration) return;
    autoStartedRef.current = false;
    autoPipelineTriggeredRef.current = false;
    if (greenfieldRecovery) {
      recoveryStartedRef.current = false;
    }
  }, [embedded, autoStartGeneration, greenfieldRecovery, initialPrompt, initialFolder?.path]);

  useEffect(() => {
    if (!embedded || !greenfieldRecovery || recoveryStartedRef.current) return;
    if (!folder || !settings) return;
    recoveryStartedRef.current = true;

    const gfFiles = greenfieldRun.generatedFiles;
    if (gfFiles && gfFiles.length > 0) {
      setGenStatus("done");
      setApproved(true);
      setGenResult((prev) =>
        prev?.ok && prev.files
          ? prev
          : {
              ok: true,
              provider: (greenfieldRun.provider ?? "ollama") as ProviderId,
              model: greenfieldRun.model ?? "",
              files: gfFiles,
              latencyMs: 0,
            },
      );
    }

    appendGreenfieldRunLog(
      "generation",
      "success",
      "Greenfield recovery — reusing previous generated files",
    );
    recordAgentActivityMessage(
      "Greenfield recovery — retrying npm install and verification without regenerating files.",
    );

    if (greenfieldRun.filesWritten.length > 0) {
      setWriteStatus("done");
      void writeAndSetupRef.current(folder, {
        autoApproved: true,
        setupOnly: true,
      });
      return;
    }

    if (gfFiles && gfFiles.length === GREENFIELD_FILE_PATHS.length) {
      void writeAndSetupRef.current(folder, { autoApproved: true });
    }
  }, [
    embedded,
    greenfieldRecovery,
    folder,
    settings,
    greenfieldRun.generatedFiles,
    greenfieldRun.filesWritten.length,
    greenfieldRun.provider,
    greenfieldRun.model,
    appendGreenfieldRunLog,
    recordAgentActivityMessage,
  ]);

  const buildEmbeddedSuccessInput = (
    setup: import("@/core/greenfield/types").GreenfieldSetupResult,
    filesWritten: readonly string[],
    previewReady: boolean,
    uiAuditPassed: boolean,
  ) => ({
    filesWritten,
    typecheckPassed: setup.typecheck?.ok ?? setup.ok,
    buildPassed: setup.build?.ok ?? setup.ok,
    previewReady,
    uiAuditPassed,
  });

  const finishEmbedded = async (successInput?: {
    filesWritten: readonly string[];
    typecheckPassed: boolean;
    buildPassed: boolean;
    previewReady: boolean;
    uiAuditPassed: boolean;
  }) => {
    if (embedded && successInput && onAgentGreenfieldSuccess) {
      onAgentGreenfieldSuccess({
        prompt,
        ...successInput,
      });
    }
    if (embedded && onGreenfieldComplete) {
      await onGreenfieldComplete();
    }
    if (successInput) {
      emitGreenfieldConsoleEvent("greenfield:complete", {
        projectPath: folder?.path ?? greenfieldRun.targetFolder ?? null,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
      });
    }
    setRailTool("files");
    onComplete?.();
  };

  const pipelineSuccess =
    (writeStatus === "done" && setupResult?.ok === true) ||
    greenfieldRun.runResult === "success";

  const alreadyWritten = pipelineSuccess;

  const generatedFolderPath = folder?.path ?? greenfieldRun.targetFolder ?? null;

  const repairHost: GreenfieldRepairHost | null = useMemo(() => {
    if (!api || !folder) return null;
    const proj = project?.path === folder.path
      ? project
      : { path: folder.path, name: folder.name };
    return {
      api,
      project: proj,
      appendGreenfieldRunLog,
      updateGreenfieldRun,
      setAppPreview,
      requestPreviewTab: embedded ? () => {} : requestPreviewTab,
      invokeRepairCall,
    };
  }, [
    api,
    folder,
    project,
    embedded,
    appendGreenfieldRunLog,
    updateGreenfieldRun,
    setAppPreview,
    requestPreviewTab,
    invokeRepairCall,
  ]);

  useEffect(() => {
    if (!api) return;
    void api.getProviderSettings().then(setSettings);
  }, [api]);

  /** Restore wizard state when returning after a successful run. */
  useEffect(() => {
    const target = greenfieldRun.targetFolder;
    if (!target || greenfieldRun.runResult !== "success") return;

    const name = target.split(/[/\\]/).filter(Boolean).pop() ?? "app";
    setFolder((prev) => prev ?? { path: target, name });

    if (greenfieldRun.setupResult) {
      setSetupResult(greenfieldRun.setupResult);
      if (greenfieldRun.setupResult.ok) {
        setSetupStatus("done");
      } else if (greenfieldRun.setupStatus === "repair_needed") {
        setSetupStatus("repair_needed");
      } else {
        setSetupStatus("error");
      }
    }
    if (greenfieldRun.filesWritten.length > 0) setWriteStatus("done");
    if (greenfieldRun.finalMessage) setFinalMessage(greenfieldRun.finalMessage);

    const gfFiles = greenfieldRun.generatedFiles;
    if (gfFiles && gfFiles.length === GREENFIELD_FILE_PATHS.length) {
      setGenStatus("done");
      setApproved(true);
      setGenResult((prev) =>
        prev?.ok && prev.files
          ? prev
          : {
              ok: true,
              provider: (greenfieldRun.provider ?? "ollama") as ProviderId,
              model: greenfieldRun.model ?? "",
              files: gfFiles,
              latencyMs: 0,
            },
      );
    }
  }, [
    greenfieldRun.targetFolder,
    greenfieldRun.runResult,
    greenfieldRun.setupResult,
    greenfieldRun.filesWritten.length,
    greenfieldRun.finalMessage,
    greenfieldRun.generatedFiles,
    greenfieldRun.provider,
    greenfieldRun.model,
  ]);

  if (!api) {
    return (
      <EmptyState
        title="Desktop only"
        description="Greenfield generation runs in the Electron app."
      />
    );
  }

  const provider = settings?.provider ?? "ollama";
  const providerInfo = getProviderInfo(provider);

  const providerReady = settings ? isProviderReady(settings) : false;

  const canGenerate = Boolean(
    folder && prompt.trim() && settings && providerReady,
  );

  const activeModel = settings ? modelForProvider(settings, provider) : "";

  const mergeGenerateDebug = (
    base: GreenfieldDebugReport | undefined,
    startedAt: string,
    elapsedMs: number,
    errorMessage: string,
    extras?: Partial<GreenfieldDebugReport>,
  ): GreenfieldDebugReport => {
    const errorName = base?.errorName ?? inferErrorName(errorMessage);
    const report: GreenfieldDebugReport = {
      stage: extras?.stage ?? base?.stage ?? "greenfield:generate",
      provider: extras?.provider ?? base?.provider ?? provider,
      model: extras?.model ?? base?.model ?? activeModel,
      requestStartedAt: extras?.requestStartedAt ?? base?.requestStartedAt ?? startedAt,
      elapsedMs: extras?.elapsedMs ?? base?.elapsedMs ?? elapsedMs,
      ipcChannel: extras?.ipcChannel ?? base?.ipcChannel ?? "greenfield:generate",
      errorMessage: extras?.errorMessage ?? base?.errorMessage ?? errorMessage,
    };
    const folderPath = extras?.targetFolder ?? base?.targetFolder ?? folder?.path;
    if (folderPath) report.targetFolder = folderPath;
    const mergedErrorName = extras?.errorName ?? errorName;
    if (mergedErrorName) report.errorName = mergedErrorName;
    const stack = extras?.errorStack ?? base?.errorStack;
    if (stack) report.errorStack = stack;
    const rawErr = extras?.rawProviderError ?? base?.rawProviderError;
    if (rawErr) report.rawProviderError = rawErr;
    const rawPayload = extras?.rawProviderPayload ?? base?.rawProviderPayload;
    if (rawPayload !== undefined) report.rawProviderPayload = rawPayload;
    const abort =
      extras?.abortCauseAnalysis ??
      base?.abortCauseAnalysis ??
      inferAbortCauseAnalysis(errorMessage, report.errorName);
    if (abort) report.abortCauseAnalysis = abort;
    const notes = extras?.notes ?? base?.notes;
    if (notes?.length) report.notes = notes;
    const metrics = extras?.metrics ?? base?.metrics;
    if (metrics) report.metrics = metrics;
    const markerAudit = extras?.markerAudit ?? base?.markerAudit;
    if (markerAudit) report.markerAudit = markerAudit;
    const parseTrace = extras?.parseTrace ?? base?.parseTrace;
    if (parseTrace) report.parseTrace = parseTrace;
    return report;
  };

  const selectFolder = async (opts?: { preserveGeneration?: boolean }) => {
    setFolderError(null);
    setSelectingFolder(true);
    try {
      const res = await api.greenfieldSelectFolder();
      if (res === null) return;
      if ("error" in res) {
        setFolderError(res.error);
        if (!opts?.preserveGeneration) setFolder(null);
        appendGreenfieldRunLog("folder", "failed", res.error);
        return;
      }
      setFolder(res);
      setWriteBlocked(false);
      setClearFolderConfirm(false);
      setWriteError(null);
      setWriteStatus("idle");
      if (!opts?.preserveGeneration) {
        setGenResult(null);
        setApproved(false);
        setSetupResult(null);
        setSetupStatus("idle");
        setFinalMessage(null);
        resetGreenfieldRun();
      }
      appendGreenfieldRunLog("folder", "success", "Folder selected", res.path);
      updateGreenfieldRun({ targetFolder: res.path });
    } catch {
      setFolderError("Could not open folder picker.");
      if (!opts?.preserveGeneration) setFolder(null);
    } finally {
      setSelectingFolder(false);
    }
  };

  const generate = async () => {
    if (!folder || prompt.trim() === "") {
      onSubmissionError?.("Greenfield run could not start — folder or prompt is missing.");
      return;
    }
    if (generateLockRef.current || genStatus === "running" || greenfieldRun.genStatus === "running") {
      return;
    }
    if (agentRunBlockReason) {
      onSubmissionError?.(agentRunBlockReason);
      setFinalMessage(agentRunBlockReason);
      return;
    }
    if (!settings || !isProviderReady(settings)) {
      onSubmissionError?.("Connect an AI provider in Settings before generating.");
      return;
    }
    generateLockRef.current = true;
    autoStartedRef.current = true;
    cancelledRef.current = false;
    const requestStartedAt = new Date().toISOString();
    const requestStartMs = Date.now();
    const projectPath = folder.path;
    logPromptSubmission("greenfield.generate.start", {
      promptLength: prompt.trim().length,
      projectPath,
      provider: settings.provider,
      model: modelForProvider(settings, settings.provider),
      route: "greenfield",
      phase: "starting",
    });
    beginRunTimeline({ route: "greenfield" });
    recordRunTimelineStage("run_id");
    setGenStatus("running");
    setGenResult(null);
    setApproved(false);
    setFinalMessage(null);
    if (!embedded) {
      setCenterTab("studioLog");
    } else if (agentOnly || agentStreamlined) {
      recordAgentActivityMessage(
        `Generating app from ${prompt.trim().length.toLocaleString()}-character prompt…`,
      );
    }
    updateGreenfieldRun({
      actionType: "greenfield",
      provider,
      model: activeModel,
      workflow: { prompt: prompt.trim() },
      genStatus: "running",
      writeStatus: "idle",
      setupStatus: "idle",
      generatedFiles: null,
      debug: null,
      generationMetrics: null,
      latestAction: createLatestAction("running", "Generation started", {
        stage: "generation",
      }),
      ...(greenfieldRun.runResult === "success"
        ? {}
        : { runResult: "running" }),
    });
    appendGreenfieldRunLog("provider", "success", `${provider} / ${activeModel}`);
    appendGreenfieldRunLog("prompt", "success", "Prompt submitted", `${prompt.length} chars`);
    appendGreenfieldRunLog("generation", "running", "Generation started");
    resetAiCallTracker();
    emitGreenfieldConsoleEvent("greenfield:start", {
      projectPath,
      provider,
      model: activeModel,
    });
    await refreshProviderStatus();
    try {
      emitGreenfieldConsoleEvent("provider:start", {
        projectPath,
        provider,
        model: activeModel,
      });
      if (cancelledRef.current) return;
      const res = settings
        ? await runGreenfieldGenerateWithReliability(
            {
              api,
              settings,
              invokeGreenfieldCall,
              invokeGreenfieldRawCall: (s, tokens, call, promptPayload, recordPurpose) =>
                invokeGreenfieldRawCall(s, tokens, call, promptPayload, recordPurpose),
              providerStopReasonRef: providerInvokeStopRef,
              providerRequestSentRef,
              resetAiCallBudget: () => {
                resetAiCallTracker();
              },
              prepareGreenfieldBudget: () => {
                if (settings) prepareGreenfieldCallBudget(settings);
              },
              prepareMultiPhaseGreenfieldBudget: (pageCount) => {
                if (settings) prepareMultiPhaseGreenfieldCallBudget(settings, pageCount);
              },
              canMakeAiCall: (purpose) => {
                if (!settings) return { ok: true as const };
                const gate = canMakeAiCall(settings, purpose, "greenfield");
                return gate.ok
                  ? ({ ok: true as const })
                  : { ok: false as const, reason: gate.reason ?? "AI call blocked." };
              },
              canMakeAppCompletionCall: () => {
                if (!settings) return { ok: true as const };
                const gate = canMakeAiCall(settings, "primary", "repair");
                return gate.ok
                  ? ({ ok: true as const })
                  : { ok: false as const, reason: gate.reason ?? "AI call blocked." };
              },
              invokeAppCompletionCall: (s, tokens, call, prompt) =>
                invokeGreenfieldReservedCompletion(s, tokens, call, prompt),
            },
            prompt,
          )
        : await api.greenfieldGenerate(provider, prompt);
      if (cancelledRef.current) return;
      const elapsedMs = Date.now() - requestStartMs;
      setGenResult(res);
      appendGreenfieldRunLog(
        "provider_response",
        res.ok ? "success" : "failed",
        res.ok
          ? "Provider response received"
          : (res.error ?? "Provider request failed"),
        res.ok
          ? `${res.rawText?.length ?? 0} chars · ${res.latencyMs}ms`
          : res.error,
      );
      emitGreenfieldConsoleEvent("provider:response", {
        projectPath,
        provider,
        model: activeModel,
        message: res.ok ? "Provider response received" : (res.error ?? "Provider request failed"),
        ...(res.error ? { details: res.error } : {}),
      });
      if (!res.ok) {
        const failureStage = res.exactFailureStage ?? "provider";
        const isBudgetFailure = failureStage === "budget";
        const parserSkipped =
          failureStage === "provider" && !res.providerRequestSent;
        if (!isBudgetFailure) {
          appendGreenfieldRunLog(
            "parser",
            "failed",
            parserSkipped ? "Parser skipped (provider failed)" : "Parser failed",
            res.error,
          );
        }
        const msg = res.error ?? "Generation failed.";
        const debugExtras: Partial<GreenfieldDebugReport> = {
          elapsedMs: res.latencyMs || elapsedMs,
        };
        if (res.metrics) debugExtras.metrics = res.metrics;
        if (res.markerAudit) debugExtras.markerAudit = res.markerAudit;
        if (res.parseTrace) debugExtras.parseTrace = res.parseTrace;
        const dbg = mergeGenerateDebug(res.debug, requestStartedAt, elapsedMs, msg, debugExtras);
        updateGreenfieldRun({
          genStatus: "error",
          runResult: "failed",
          debug: dbg,
          generatedFiles: null,
          generationMetrics: res.metrics ?? null,
          latestAction: createLatestAction(
            "failed",
            isBudgetFailure
              ? "AI call budget exhausted"
              : (res.error ?? "Generation failed"),
            {
              stage: "generation",
              ...(res.error ? { detail: res.error } : {}),
            },
          ),
        });
        setGenStatus("error");
        if (agentStreamlined || agentOnly) {
          autoStartedRef.current = true;
        }
        if (!embedded) {
          setCenterTab("summary");
        }
        return;
      }
      const parsedOk =
        res.generationMode === "multi-phase"
          ? Boolean(res.ok && res.projectFiles?.length)
          : (res.files?.length ?? 0) === GREENFIELD_FILE_PATHS.length && !res.partialSuccess;
      const partialOk =
        res.generationMode === "multi-phase"
          ? false
          : res.ok && (res.partialSuccess || (res.files?.length ?? 0) > 0);
      emitGreenfieldConsoleEvent("parser:start", { projectPath, provider, model: activeModel });
      appendGreenfieldRunLog(
        "parser",
        parsedOk || partialOk ? "success" : "failed",
        parsedOk
          ? res.generationMode === "multi-phase"
            ? `${res.projectFiles?.length ?? 0} project files parsed`
            : "All seven files parsed"
          : partialOk
            ? `Partial parse — ${res.files?.length ?? 0}/${GREENFIELD_FILE_PATHS.length} files`
            : (res.error ?? "Parser failed"),
        parsedOk
          ? greenfieldReviewFilePathList(res).join(", ")
          : partialOk
            ? (res.files?.map((f) => f.path).join(", ") ?? res.error)
            : res.error,
      );
      emitGreenfieldConsoleEvent(parsedOk || partialOk ? "parser:success" : "parser:fail", {
        projectPath,
        provider,
        model: activeModel,
        ...(parsedOk || partialOk ? {} : { details: res.error ?? "Parser failed" }),
      });
      if (parsedOk || partialOk) {
        if (res.warnings?.length) {
          for (const warning of res.warnings) {
            appendGreenfieldRunLog("parser", "running", "Parse warning", warning);
          }
        }
        appendGreenfieldRunLog("generation", "success", "Generation finished");
        appendGreenfieldRunLog(
          "review",
          "success",
          partialOk && !parsedOk ? "Files ready for review (partial)" : "Files ready for review",
          greenfieldReviewFilePathList(res).join(", "),
        );
        emitGreenfieldConsoleEvent("greenfield:review_ready", {
          projectPath,
          provider,
          model: activeModel,
          details: greenfieldReviewFilePathList(res).join(", "),
        });
        updateGreenfieldRun({
          generatedFiles: greenfieldReviewFiles(res),
          genStatus: "done",
          generationMetrics: res.metrics ?? null,
          debug: res.partialSuccess
            ? mergeGenerateDebug(
                res.debug,
                requestStartedAt,
                elapsedMs,
                res.warnings?.join(" ") ?? "Partial greenfield parse",
                {
                  stage: "greenfield:generate / parse",
                  ...(res.markerAudit ? { markerAudit: res.markerAudit } : {}),
                  ...(res.parseTrace ? { parseTrace: res.parseTrace } : {}),
                  notes: [...(res.warnings ?? [])],
                },
              )
            : null,
          latestAction: createLatestAction(
            partialOk && !parsedOk ? "success" : "success",
            partialOk && !parsedOk ? "Files ready for review (partial)" : "Files ready for review",
            { stage: "review" },
          ),
        });
      } else {
        const parseMsg =
          res.error ??
          `Parser found ${res.files?.length ?? res.markerAudit?.completeMarkerPairs.length ?? 0} of ${GREENFIELD_FILE_PATHS.length} required files.`;
        const parseDebug = mergeGenerateDebug(
          res.debug,
          requestStartedAt,
          elapsedMs,
          parseMsg,
          {
            stage: "greenfield:generate / parse",
            ...(res.metrics ? { metrics: res.metrics } : {}),
            ...(res.markerAudit ? { markerAudit: res.markerAudit } : {}),
            ...(res.parseTrace ? { parseTrace: res.parseTrace } : {}),
            notes: [
              "Provider returned a response but BryantLabs Studio could not parse all required files.",
            ],
          },
        );
        updateGreenfieldRun({
          genStatus: "error",
          runResult: "failed",
          generatedFiles: greenfieldReviewFiles(res),
          generationMetrics: res.metrics ?? null,
          debug: parseDebug,
          latestAction: createLatestAction("failed", "Parser failed — incomplete file set", {
            stage: "parser",
            detail: parseMsg,
          }),
        });
      }
      setGenStatus("done");
      if (!embedded) {
        setCenterTab("summary");
      }
    } catch (err) {
      const elapsedMs = Date.now() - requestStartMs;
      const msg = redactSecrets(
        err instanceof Error ? err.message : "IPC invoke failed for greenfield:generate.",
      );
      const stack =
        err instanceof Error && err.stack ? redactSecrets(err.stack) : undefined;
      setGenResult({
        ok: false,
        provider,
        model: activeModel,
        latencyMs: elapsedMs,
        error: msg,
      });
      const ipcExtras: Partial<GreenfieldDebugReport> = {
        stage: "renderer:ipc",
        notes: [
          "Exception thrown in renderer during ipcRenderer.invoke (not a structured provider error).",
        ],
      };
      const ipcErrorName = inferErrorName(msg, err instanceof Error ? err : undefined);
      if (ipcErrorName) ipcExtras.errorName = ipcErrorName;
      if (stack) ipcExtras.errorStack = stack;
      const dbg = mergeGenerateDebug(undefined, requestStartedAt, elapsedMs, msg, ipcExtras);
      appendGreenfieldRunLog("provider_response", "failed", "Provider response failed", msg);
      appendGreenfieldRunLog("parser", "failed", "Parser skipped (IPC error)", msg);
      updateGreenfieldRun({
        genStatus: "error",
        runResult: "failed",
        debug: dbg,
        generationMetrics: null,
        latestAction: createLatestAction("failed", msg, {
          stage: "provider_response",
          detail: msg,
        }),
      });
      setGenStatus("error");
      if (!embedded) {
        setCenterTab("summary");
      }
    } finally {
      generateLockRef.current = false;
    }
  };
  generateFnRef.current = generate;

  const writeFiles = useMemo((): GreenfieldProjectFile[] | undefined => {
    if (!genResult?.ok) return undefined;
    if (genResult.projectFiles?.length) {
      return [...genResult.projectFiles];
    }
    return genResult.files?.map((f) => ({
      path: f.path as GreenfieldProjectFile["path"],
      content: f.content,
    }));
  }, [genResult]);

  const files = writeFiles;
  const selected = files?.find((f) => f.path === selectedFile);

  const approve = () => {
    const decision = resolveGreenfieldAutoWriteDecision(files, prompt, {
      ...(genResult?.generationMode ? { generationMode: genResult.generationMode } : {}),
      ...(genResult?.projectFiles ? { projectFiles: genResult.projectFiles } : {}),
      ...(genResult?.manifestPages ? { manifestPages: genResult.manifestPages } : {}),
    });
    if (!decision.ready || !decision.files) {
      onSubmissionError?.(decision.reason ?? "Generated files are not ready to write.");
      return;
    }
    if (decision.completedViaFill) {
      setGenResult((prev) =>
        prev?.ok
          ? {
              ...prev,
              files: [...decision.files!] as GeneratedFile[],
            }
          : prev,
      );
    }
    setApproved(true);
    appendGreenfieldRunLog("approve", "success", "User approved");
    emitGreenfieldConsoleEvent("greenfield:review_approved", {
      projectPath: folder?.path ?? greenfieldRun.targetFolder ?? null,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
      message: "User approved — writing files",
    });
  };

  const writeAndSetup = async (
    targetFolder?: { path: string; name: string },
    opts?: { autoApproved?: boolean; setupOnly?: boolean },
  ) => {
    const writeTarget = targetFolder ?? folder;
    if (!writeTarget) return;

    let writtenFilesForSetup: readonly string[] = [];

    if (opts?.setupOnly) {
      if (!files && !greenfieldRun.generatedFiles?.length) return;
      setWriteStatus("done");
      setWriteError(null);
      setSetupStatus("idle");
      setSetupResult(null);
      setFinalMessage(null);
      setFolder(writeTarget);
      updateGreenfieldRun({
        writeStatus: "done",
        ...(greenfieldRun.runResult !== "success" ? { runResult: "running" as const } : {}),
      });
      await openProjectAt(writeTarget.path);
      writtenFilesForSetup =
        greenfieldRun.filesWritten.length > 0
          ? greenfieldRun.filesWritten
          : [...GREENFIELD_FILE_PATHS];
    } else {
    if (!files || (!approved && !opts?.autoApproved)) return;
    if (agentStreamlined && !agentOnly && opts?.autoApproved) {
      recordAgentActivityMessage("Writing files and running setup…");
    }
    setWriteStatus("writing");
    setWriteError(null);
    setSetupStatus("idle");
    setSetupResult(null);
    setFinalMessage(null);

    updateGreenfieldRun({
      writeStatus: "writing",
      latestAction: createLatestAction("running", "Write started", {
        stage: "write",
        detail: writeTarget.path,
      }),
      ...(greenfieldRun.runResult !== "success"
        ? { runResult: "running" as const }
        : {}),
    });
    appendGreenfieldRunLog("write", "running", "Write started", writeTarget.path);
    emitGreenfieldConsoleEvent("greenfield:write_start", {
      projectPath: writeTarget.path,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
      details: writeTarget.path,
    });
    emitGreenfieldConsoleEvent("write:start", {
      projectPath: writeTarget.path,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
      details: writeTarget.path,
    });
    if (cancelledRef.current) return;
    const writeRes = await api.greenfieldWrite(
      writeTarget.path,
      files as GeneratedFile[],
    );
    if (cancelledRef.current) return;
    const logPerFileWrites = (
      logs: import("@/core/greenfield/writeLog").WriteFileLogEntry[] | undefined,
    ) => {
      emitWriteFileLogs(logs, {
        appendRunLog: (status, message, details) =>
          appendGreenfieldRunLog("write", status, message, details),
        emitConsole: ({ stage, message, details, error }) =>
          emitGreenfieldConsoleEvent(stage, {
            projectPath: writeTarget.path,
            provider: greenfieldRun.provider,
            model: greenfieldRun.model,
            message,
            ...(details ? { details } : {}),
            ...(error ? { error } : {}),
          }),
      });
    };

    if ("error" in writeRes) {
      const short = writeFailureLogMessage(writeRes.error);
      appendGreenfieldRunLog("write", "failed", short, writeRes.error);
      emitGreenfieldConsoleEvent("write:fail", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
        message: short,
        details: writeRes.error,
        error: writeRes.error,
      });
      if (
        isFolderNotEmptyWriteError(writeRes) &&
        (settings?.fileWriteMode ?? "workspace") === "safe"
      ) {
        updateGreenfieldRun({
          writeStatus: "blocked",
          writeError: writeRes.error,
          generatedFiles: files as GeneratedFile[],
          genStatus: "done",
          setupStatus: "idle",
          setupResult: null,
          failureReport: null,
          latestAction: createLatestAction(
            "failed",
            latestActionSummaryForWriteFailure(writeRes.error),
            { stage: "write", detail: writeRes.error },
          ),
          ...(greenfieldRun.runResult === "success"
            ? {}
            : { runResult: "running" as const }),
        });
        setWriteStatus("blocked");
        setWriteBlocked(true);
        setWriteError(folderNotEmptyUserMessage());
        return;
      }
      updateGreenfieldRun({
        writeStatus: "error",
        writeError: writeRes.error,
        latestAction: createLatestAction(
          "failed",
          latestActionSummaryForWriteFailure(writeRes.error),
          { stage: "write", detail: writeRes.error },
        ),
        ...(greenfieldRun.runResult !== "success" ? { runResult: "failed" as const } : {}),
      });
      setWriteStatus("error");
      setWriteError(writeRes.error);
      return;
    }
    if (!writeRes.ok) {
      const errText = writeRes.errors.join("; ");
      logPerFileWrites(writeRes.logs);
      appendGreenfieldRunLog("write", "failed", writeFailureLogMessage(errText), errText);
      emitGreenfieldConsoleEvent("write:fail", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
        message: writeFailureLogMessage(errText),
        details: errText,
        error: errText,
      });
      updateGreenfieldRun({
        writeStatus: "error",
        writeError: errText,
        latestAction: createLatestAction(
          "failed",
          latestActionSummaryForWriteFailure(errText),
          { stage: "write", detail: errText },
        ),
        ...(greenfieldRun.runResult !== "success" ? { runResult: "failed" as const } : {}),
      });
      setWriteStatus("error");
      setWriteError(errText);
      return;
    }

    logPerFileWrites(writeRes.logs);
    appendGreenfieldRunLog(
      "write",
      "success",
      `Write succeeded (${writeRes.written.length} files)`,
      writeRes.written.join(", "),
    );
    emitGreenfieldConsoleEvent("write:success", {
      projectPath: writeTarget.path,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
      message: `Write succeeded (${writeRes.written.length} files)`,
      details: writeRes.written.join(", "),
    });
    updateGreenfieldRun({
      writeStatus: "done",
      filesWritten: writeRes.written,
      writeError: null,
    });
    setWriteStatus("done");
    setWriteBlocked(false);
    setFolder(writeTarget);
    await openProjectAt(writeTarget.path);
    void rescan();
    writtenFilesForSetup = writeRes.written;
    }

    const activeRepairHost: GreenfieldRepairHost = {
      api,
      project: { path: writeTarget.path, name: writeTarget.name },
      appendGreenfieldRunLog,
      updateGreenfieldRun,
      setAppPreview,
      requestPreviewTab: embedded ? () => {} : requestPreviewTab,
      invokeRepairCall,
    };

    if (genResult?.generationMode === "multi-phase" && settings) {
      resetAiCallTracker();
      prepareGreenfieldCallBudget(settings);
    }

    setSetupStatus("running");
    updateGreenfieldRun({
      setupStatus: "running",
      latestAction: createLatestAction("running", "npm install started", {
        stage: "npm_install",
      }),
      ...(greenfieldRun.runResult === "success"
        ? {}
        : { runResult: "running" }),
    });
    appendGreenfieldRunLog("npm_install", "running", "npm install started");
    emitGreenfieldConsoleEvent("npm:start", {
      projectPath: writeTarget.path,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
    });
    if (cancelledRef.current) return;
    const setup = await api.greenfieldSetup(writeTarget.path);
    if (cancelledRef.current) return;
    if (isGreenfieldSetupTransportError(setup)) {
      appendGreenfieldRunLog("npm_install", "failed", setup.error);
      emitGreenfieldConsoleEvent("npm:fail", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
        details: setup.error,
      });
      updateGreenfieldRun({
        setupStatus: "error",
        runResult: "failed",
        finalMessage: setup.error,
        latestAction: createLatestAction("failed", setup.error ?? "Setup failed", {
          stage: "npm_install",
          detail: setup.error,
        }),
      });
      setSetupStatus("error");
      setFinalMessage(setup.error);
      return;
    }
    setSetupResult(setup);
    updateGreenfieldRun({ setupResult: setup });

    if (setup.dependencyRepairs?.length) {
      for (const repair of setup.dependencyRepairs) {
        appendGreenfieldRunLog("npm_install", "success", "Dependency repaired", repair);
      }
    }
    if (setup.installRetried) {
      appendGreenfieldRunLog(
        "npm_install",
        "running",
        "npm install retried after package.json repair",
      );
    }

    appendGreenfieldRunLog(
      "npm_install",
      setup.install.ok ? "success" : "failed",
      setup.install.ok ? "npm install finished" : "npm install failed",
      commandResultLine(setup.install),
    );
    emitGreenfieldConsoleEvent(setup.install.ok ? "npm:success" : "npm:fail", {
      projectPath: writeTarget.path,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
      details: commandResultLine(setup.install),
    });

    if (setup.typecheck) {
      appendGreenfieldRunLog("typescript", "running", "TypeScript check started");
      emitGreenfieldConsoleEvent("typescript:start", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
      });
      appendGreenfieldRunLog(
        "typescript",
        setup.typecheck.ok ? "success" : "failed",
        setup.typecheck.ok
          ? "TypeScript check finished"
          : "TypeScript check failed",
        commandResultLine(setup.typecheck),
      );
      emitGreenfieldConsoleEvent(setup.typecheck.ok ? "typescript:success" : "typescript:fail", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
        details: commandResultLine(setup.typecheck),
      });
    }

    if (setup.build) {
      appendGreenfieldRunLog("build", "running", "Build started");
      emitGreenfieldConsoleEvent("build:start", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
      });
      appendGreenfieldRunLog(
        "build",
        setup.build.ok ? "success" : "failed",
        setup.build.ok ? "Build finished" : "Build failed",
        commandResultLine(setup.build),
      );
      emitGreenfieldConsoleEvent(setup.build.ok ? "build:success" : "build:fail", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
        details: commandResultLine(setup.build),
      });
    }

    if (!setup.ok) {
      const autoFixMode: AutoFixMode = settings?.autoFixMode ?? "ask";
      if (
        shouldOfferGreenfieldRepair(setup, autoFixMode)
      ) {
        if (autoFixMode === "automatic" || agentStreamlined) {
          setSetupStatus("repairing");
          setRepairing(true);
          const result = await runGreenfieldRepairPipeline(activeRepairHost, {
            folderPath: writeTarget.path,
            userPrompt: prompt,
            filesWritten: writtenFilesForSetup,
            setup,
          });
          setSetupResult(result.setup);
          setRepairing(false);
          if (result.ok) {
            setSetupStatus("done");
            setFinalMessage(
              result.message ?? "Repaired successfully — preview started.",
            );
            if (embedded) {
              finishEmbedded(
                buildEmbeddedSuccessInput(
                  result.setup,
                  writtenFilesForSetup,
                  Boolean(result.setup.ok),
                  true,
                ),
              );
            }
          } else {
            setSetupStatus(
              result.repair?.status === "repair_needed" ? "repair_needed" : "error",
            );
            setFinalMessage(
              result.repair?.primaryErrorLine ??
                setup.error ??
                "Setup failed.",
            );
          }
          return;
        }

        const repair = await markGreenfieldRepairNeeded(activeRepairHost, {
          setup,
          userPrompt: prompt,
          filesWritten: writtenFilesForSetup,
          projectRoot: writeTarget.path,
        });
        setSetupStatus("repair_needed");
        setSetupResult(setup);
        setFinalMessage(repair?.primaryErrorLine ?? setup.error ?? "Setup failed.");
        return;
      }

      const failReport = buildGreenfieldSetupFailureReport(setup);
      updateGreenfieldRun({
        setupStatus: "error",
        runResult: "failed",
        failureReport: failReport,
        finalMessage: failReport.rootCauseLine,
        latestAction: createLatestAction("failed", failReport.rootCauseLine, {
          ...(failReport.rootStage
            ? { stage: pipelineStageToRunLogStage(failReport.rootStage) }
            : {}),
          detail: failReport.rootCauseLine,
        }),
      });
      setSetupStatus("error");
      setFinalMessage(failReport.rootCauseLine);
      return;
    }

    setSetupStatus("done");
    updateGreenfieldRun({
      setupStatus: "done",
      latestAction: createLatestAction("success", "Build finished", { stage: "build" }),
    });
    await runGreenfieldRuntimeSmokeCheck({
      api,
      projectRoot: writeTarget.path,
      userPrompt: prompt,
      appendGreenfieldRunLog,
    });
    appendGreenfieldRunLog("preview", "running", "Preview started");
    emitGreenfieldConsoleEvent("preview:start", {
      projectPath: writeTarget.path,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
    });
    if (cancelledRef.current) return;
    const preview = await api.greenfieldPreviewStart(writeTarget.path);
    if (cancelledRef.current) return;
    if (preview.ok && preview.url) {
      appendGreenfieldRunLog("preview", "success", "Preview started", preview.url);
      emitGreenfieldConsoleEvent("preview:success", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
        details: preview.url,
      });
      setAppPreview({
        url: preview.url,
        running: true,
        root: writeTarget.path,
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
      if (!embedded) {
        requestPreviewTab();
      }

      const uiRepairHost: GreenfieldUiRepairHost = {
        api,
        appendGreenfieldRunLog,
        updateGreenfieldRun,
        setAppPreview,
        requestPreviewTab: embedded ? () => {} : requestPreviewTab,
      };
      const uiOutcome = await runGreenfieldUiAuditAndRepair(uiRepairHost, {
        folderPath: writeTarget.path,
        previewUrl: preview.url,
        setup,
        userPrompt: prompt,
        uiAuditHistory: greenfieldRun.uiAuditHistory,
      });

      if (!uiOutcome.ok) {
        if (setup.ok) {
          markGreenfieldUiAuditAdvisorySuccess(
            uiOutcome.audit,
            updateGreenfieldRun,
            uiOutcome.uiAuditHistory,
            greenfieldRun.runStartedAt,
            uiOutcome.repaired,
          );
          setFinalMessage(uiOutcome.finalMessage);
          if (embedded) {
            finishEmbedded(
              buildEmbeddedSuccessInput(
                setup,
                writtenFilesForSetup,
                true,
                true,
              ),
            );
          }
          return;
        }
        markGreenfieldUiAuditFailure(
          uiOutcome.audit,
          updateGreenfieldRun,
          uiOutcome.uiAuditHistory,
          greenfieldRun.runStartedAt,
        );
        setFinalMessage(uiOutcome.finalMessage);
        return;
      }

      updateGreenfieldRun({
        runResult: "success",
        failureReport: null,
        lastSuccessfulRunAt: Date.now(),
        finalMessage: uiOutcome.finalMessage,
        uiAuditResult: uiOutcome.audit,
        uiAuditHistory: uiOutcome.uiAuditHistory,
        latestAction: createLatestAction("success", "Greenfield run complete", {
          stage: "ui_audit",
          detail: uiOutcome.finalMessage,
        }),
      });
      setFinalMessage(uiOutcome.finalMessage);
      if (embedded) {
        finishEmbedded(
          buildEmbeddedSuccessInput(
            setup,
            writtenFilesForSetup,
            true,
            uiOutcome.audit.ok || uiOutcome.audit.skipped,
          ),
        );
      }
    } else {
      const rootCause =
        preview.diagnostics?.rootCause ?? preview.error ?? "unknown";
      const failMsg = `Build passed but preview failed to start: ${rootCause}.`;
      appendGreenfieldRunLog(
        "preview",
        "failed",
        "Preview failed to start",
        rootCause,
      );
      emitGreenfieldConsoleEvent("preview:fail", {
        projectPath: writeTarget.path,
        provider: greenfieldRun.provider,
        model: greenfieldRun.model,
        details: rootCause,
      });
      const previewReport = preview.diagnostics
        ? buildPreviewFailureReport(preview.diagnostics)
        : buildGreenfieldSetupFailureReport(setup, rootCause, {
            exitCode: 1,
            port: 4173,
            crashed: false,
          });
      updateGreenfieldRun({
        runResult: "failed",
        failureReport: previewReport,
        finalMessage: previewReport.rootCauseLine,
        latestAction: createLatestAction("failed", previewReport.rootCauseLine, {
          stage: "preview",
          detail: previewReport.rootCauseLine,
        }),
      });
      setFinalMessage(failMsg);
    }
  };
  writeAndSetupRef.current = writeAndSetup;

  useEffect(() => {
    if (!agentStreamlined || !files) return;
    if (genStatus !== "done" || alreadyWritten) return;
    const decision = resolveGreenfieldAutoWriteDecision(files, prompt, {
      ...(genResult?.generationMode ? { generationMode: genResult.generationMode } : {}),
      ...(genResult?.projectFiles ? { projectFiles: genResult.projectFiles } : {}),
      ...(genResult?.manifestPages ? { manifestPages: genResult.manifestPages } : {}),
    });
    if (!decision.ready || !decision.files) {
      if (decision.reason && agentOnly) {
        recordAgentActivityMessage(decision.reason);
        onSubmissionError?.(decision.reason);
      }
      return;
    }
    if (autoPipelineTriggeredRef.current) return;
    if (writeStatus === "writing" || setupStatus === "running" || setupStatus === "repairing") {
      return;
    }
    autoPipelineTriggeredRef.current = true;
    if (decision.completedViaFill) {
      setGenResult((prev) =>
        prev?.ok
          ? {
              ...prev,
              files: [...decision.files!] as GeneratedFile[],
            }
          : prev,
      );
    }
    setApproved(true);
    const approveLabel = agentOnly
      ? "Auto-approved (One Agent)"
      : "Auto-approved (Agent flow)";
    appendGreenfieldRunLog("approve", "success", approveLabel);
    emitGreenfieldConsoleEvent("greenfield:review_approved", {
      projectPath: folder?.path ?? greenfieldRun.targetFolder ?? null,
      provider: greenfieldRun.provider,
      model: greenfieldRun.model,
      message: approveLabel,
    });
    if (!agentOnly) {
      recordAgentActivityMessage("Files generated — writing and verifying…");
    }
    void writeAndSetupRef.current(undefined, { autoApproved: true });
  }, [
    agentStreamlined,
    agentOnly,
    folder?.path,
    greenfieldRun.targetFolder,
    greenfieldRun.provider,
    greenfieldRun.model,
    files,
    genStatus,
    alreadyWritten,
    writeStatus,
    setupStatus,
    prompt,
    appendGreenfieldRunLog,
    recordAgentActivityMessage,
    onSubmissionError,
  ]);

  const runGreenfieldRepair = async () => {
    if (!folder || !setupResult || !repairHost || writeStatus !== "done") return;
    const filesWritten =
      greenfieldRun.filesWritten.length > 0
        ? greenfieldRun.filesWritten
        : GREENFIELD_FILE_PATHS;
    setRepairing(true);
    setSetupStatus("repairing");
    const result = await runGreenfieldRepairPipeline(repairHost, {
      folderPath: folder.path,
      userPrompt: prompt,
      filesWritten,
      setup: setupResult,
    });
    setSetupResult(result.setup);
    setRepairing(false);
    if (result.ok) {
      setSetupStatus("done");
      setFinalMessage(
        result.message ?? "Repaired successfully — preview started.",
      );
      if (embedded) {
        const filesWritten =
          greenfieldRun.filesWritten.length > 0
            ? greenfieldRun.filesWritten
            : GREENFIELD_FILE_PATHS;
        await finishEmbedded(
          buildEmbeddedSuccessInput(
            result.setup,
            filesWritten,
            Boolean(result.setup.ok),
            true,
          ),
        );
      }
    } else {
      setSetupStatus("error");
      setFinalMessage(
        result.repair?.primaryErrorLine ?? setupResult.error ?? "Repair failed.",
      );
    }
  };
  runGreenfieldRepairRef.current = runGreenfieldRepair;

  const retryWriteToFolder = async (target: { path: string; name: string }) => {
    setWriteBlocked(false);
    setClearFolderConfirm(false);
    setWriteError(null);
    await writeAndSetup(target);
  };

  const createNumberedFolderAndWrite = async () => {
    if (!folder) return;
    const res = await api.greenfieldNextNumberedFolder(folder.path);
    if ("error" in res) {
      setWriteError(res.error);
      return;
    }
    await retryWriteToFolder(res);
  };

  const clearFolderAndWrite = async () => {
    if (!folder || !clearFolderConfirm) return;
    const cleared = await api.greenfieldClearFolder(folder.path);
    if ("error" in cleared) {
      setWriteError(cleared.error);
      return;
    }
    setClearFolderConfirm(false);
    await writeAndSetup();
  };

  const abandonGreenfieldRepair = () => {
    setSetupStatus("error");
    updateGreenfieldRun({
      setupStatus: "error",
      greenfieldRepair: null,
      latestAction: createLatestAction("failed", "Repair abandoned", {
        stage: "greenfield_repair",
        detail: "User abandoned repair.",
      }),
    });
  };

  const openRepairTargetFile = async () => {
    const target = greenfieldRun.greenfieldRepair?.attempts.at(-1)?.targetPath
      ?? greenfieldRun.greenfieldRepair?.repairPrompt.match(/Target file: (.+)/)?.[1];
    const rel = target && target !== "—" ? target : "src/App.tsx";
    await openGeneratedApp();
    if (api && folder) {
      const abs = `${folder.path.replace(/\/$/, "")}/${rel}`;
      void api.readFile(abs);
    }
  };

  const openGeneratedApp = async () => {
    const path = generatedFolderPath;
    if (!path) return;
    await openProjectAt(path);
    if (embedded) {
      setRailTool("files");
      onComplete?.();
    } else {
      setRailTool("files");
      setCenterTab("editor");
    }
  };

  const createAnotherApp = async () => {
    setFolder(null);
    setFolderError(null);
    setGenResult(null);
    setGenStatus("idle");
    setApproved(false);
    setSelectedFile(GREENFIELD_FILE_PATHS[0]);
    setWriteStatus("idle");
    setWriteError(null);
    setSetupResult(null);
    setSetupStatus("idle");
    setFinalMessage(null);
    resetGreenfieldRun();
    await selectFolder();
  };

  const agentStreamLabel = (() => {
    if (genStatus === "running") return "Generating app files…";
    if (writeStatus === "writing") return "Writing files to project…";
    if (setupStatus === "running") return "Installing dependencies and verifying…";
    if (setupStatus === "repairing") return "Repairing TypeScript errors…";
    if (setupStatus === "repair_needed") return "Setup needs repair before continuing.";
    if (genStatus === "error") return "Generation failed.";
    if (writeStatus === "error" || setupStatus === "error") return "Setup failed.";
    return null;
  })();

  useEffect(() => {
    if (!agentStreamlined || agentOnly || !agentStreamLabel) return;
    if (lastGreenfieldActivityRef.current === agentStreamLabel) return;
    lastGreenfieldActivityRef.current = agentStreamLabel;
    recordAgentActivityMessage(agentStreamLabel);
  }, [agentStreamlined, agentOnly, agentStreamLabel, recordAgentActivityMessage]);

  const needsInlineGreenfieldUi =
    !folder ||
    writeBlocked ||
    genStatus === "error" ||
    writeStatus === "error" ||
    setupStatus === "error" ||
    setupStatus === "repair_needed" ||
    setupStatus === "repairing" ||
    greenfieldRun.greenfieldRepair?.status === "failed" ||
    Boolean(setupResult && !setupResult.ok);

  const statusSection =
    files || setupResult || writeBlocked ? (
      <section className="newapp__section newapp__section--status">
        {!agentStreamlined && alreadyWritten ? (
          <>
            <p className="newapp__written-note">
              This folder now contains an app. Use <strong>Open Generated App</strong> to
              edit it, or choose a new empty folder to create another app.
            </p>
            <div className="newapp__next-actions">
              <h4 className="newapp__fileheading">Next steps</h4>
              <div className="newapp__next-actions-bar">
                <button
                  type="button"
                  className="prov-btn prov-btn--primary"
                  disabled={!generatedFolderPath}
                  onClick={() => void openGeneratedApp()}
                >
                  Open Generated App
                </button>
                <button
                  type="button"
                  className="prov-btn"
                  onClick={() => requestPreviewTab()}
                >
                  View Preview
                </button>
                <button
                  type="button"
                  className="prov-btn"
                  onClick={() => void createAnotherApp()}
                >
                  Create Another App
                </button>
              </div>
            </div>
          </>
        ) : null}
        {writeBlocked &&
        !alreadyWritten &&
        (settings?.fileWriteMode ?? "workspace") === "safe" ? (
          <div className="newapp__folder-blocked" role="region" aria-label="Write blocked">
            <p className="aipatch__error">{writeError ?? folderNotEmptyUserMessage()}</p>
            <p className="plan__muted">
              Your generated files are still available for review. Pick how you want to
              continue:
            </p>
            <div className="plan-apply__actions">
              <button
                type="button"
                className="prov-btn prov-btn--primary"
                onClick={() => void selectFolder({ preserveGeneration: true })}
              >
                Choose another folder
              </button>
              <button
                type="button"
                className="prov-btn"
                onClick={() => void createNumberedFolderAndWrite()}
              >
                Create new numbered folder
              </button>
              {!clearFolderConfirm ? (
                <button
                  type="button"
                  className="prov-btn prov-btn--danger"
                  onClick={() => setClearFolderConfirm(true)}
                >
                  Clear folder and write files
                </button>
              ) : (
                <>
                  <p className="aipatch__error">
                    This will delete all files in this folder.
                  </p>
                  <button
                    type="button"
                    className="prov-btn prov-btn--danger"
                    onClick={() => void clearFolderAndWrite()}
                  >
                    Confirm clear folder
                  </button>
                  <button
                    type="button"
                    className="prov-btn"
                    onClick={() => setClearFolderConfirm(false)}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
        {writeError && !alreadyWritten && !writeBlocked ? (
          <p className="aipatch__error">{writeError}</p>
        ) : null}
        {setupResult && !alreadyWritten && !agentStreamlined ? (
          <SetupSummary result={setupResult} />
        ) : null}
        {greenfieldRun.greenfieldRepair &&
        (setupStatus === "repair_needed" ||
          setupStatus === "repairing" ||
          greenfieldRun.greenfieldRepair.status === "failed") ? (
          <GreenfieldRepairPanel
            repair={greenfieldRun.greenfieldRepair}
            repairing={repairing}
            {...(setupResult
              ? { headline: greenfieldRepairAskHeadline(setupResult) }
              : {})}
            onRepair={() => void runGreenfieldRepair()}
            onOpenFile={() => void openRepairTargetFile()}
            onAbandon={abandonGreenfieldRepair}
            successMessage={
              setupStatus === "done" && setupResult?.ok ? finalMessage : null
            }
          />
        ) : null}
        {setupResult &&
        !setupResult.ok &&
        setupStatus !== "repair_needed" &&
        setupStatus !== "repairing" ? (
          <GreenfieldFailureInvestigationPanel
            setupResult={setupResult}
            generatedFiles={files as GeneratedFile[] | null}
            targetFolder={folder?.path ?? null}
            headline={setupResult.error ?? finalMessage}
          />
        ) : typecheckDetails && setupResult && setupStatus !== "repair_needed" ? (
          <GreenfieldTypecheckPanel
            headline={setupResult.error ?? "TypeScript check failed."}
            details={typecheckDetails}
          />
        ) : null}
        {finalMessage && !typecheckDetails && !alreadyWritten ? (
          <p
            className={
              setupStatus === "done" && setupResult?.ok
                ? "aipatch__success"
                : "aipatch__error"
            }
          >
            {finalMessage}
          </p>
        ) : null}
        {alreadyWritten && finalMessage && !agentStreamlined ? (
          <p className="aipatch__success">{finalMessage}</p>
        ) : null}
      </section>
    ) : null;

  if (agentOnly || ((headless || agentStreamlined) && !needsInlineGreenfieldUi)) {
    return null;
  }

  if (headless || agentStreamlined) {
    return (
      <div className="newapp newapp--headless">
        {!folder ? (
          <section className="newapp__section">
            <p className="plan__muted">Choose an empty folder to create your app.</p>
            <button
              type="button"
              className="prov-btn prov-btn--primary"
              onClick={() => void selectFolder()}
              disabled={selectingFolder}
            >
              {selectingFolder ? "Opening picker…" : "Select empty folder"}
            </button>
            {folderError ? <p className="aipatch__error">{folderError}</p> : null}
          </section>
        ) : null}
        {statusSection}
      </div>
    );
  }

  return (
    <div className={`newapp newapp--workflow${embedded ? " newapp--embedded" : ""}`}>
      {embedded ? (
        <div className="newapp__embedded-head">
          <p className="plan__muted">
            Creating a new app from your prompt. Pick an empty folder, review generated
            files, then write and verify.
          </p>
          {onCancel ? (
            <button type="button" className="build-view__link" onClick={onCancel}>
              Back to Agent
            </button>
          ) : null}
        </div>
      ) : (
        <p className="newapp__sub">
          Generate a minimal Vite + React + TypeScript app. Review, approve, then
          write and verify. Run steps appear in the bottom Run Log.
        </p>
      )}

      <>
      <section className="newapp__section">
        <h3 className="prov-heading">1. Empty folder</h3>
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          onClick={() => void selectFolder()}
          disabled={selectingFolder}
        >
          {selectingFolder
            ? "Opening picker…"
            : folder
              ? "Change folder"
              : "Select empty folder"}
        </button>
        {folder ? (
          <p className="newapp__path">
            <code>{folder.path}</code>
          </p>
        ) : null}
        {folderError ? <p className="aipatch__error">{folderError}</p> : null}
      </section>

      <section className="newapp__section">
        <h3 className="prov-heading">2. Prompt &amp; provider</h3>
        <label className="prov-label">Provider</label>
        <select
          className="prov-input"
          value={provider}
          onChange={(e) =>
            void api
              .saveProviderSettings({ provider: e.target.value as ProviderId })
              .then((next) => {
                setSettings(next);
                void refreshProviderStatus();
              })
          }
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="prov-label">Model ({providerInfo.label})</label>
        <input
          className="prov-input"
          value={activeModel}
          onChange={(e) =>
            void api
              .saveProviderSettings(patchModelForProvider(provider, e.target.value))
              .then((next) => {
                setSettings(next);
                void refreshProviderStatus();
              })
          }
        />
        <label className="prov-label">App prompt</label>
        <textarea
          className="composer__input"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!folder || genStatus === "running"}
        />
        {!providerReady ? (
          <p className="newapp__hint">
            {provider === "gemini"
              ? "Save a Gemini API key in the Providers tab before generating."
              : provider === "anthropic"
                ? "Save an Anthropic API key and select a model in the Providers tab before generating."
                : "Set an Ollama model and server URL in the Providers tab before generating."}
          </p>
        ) : null}
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={!canGenerate || genStatus === "running"}
          onClick={() => void generate()}
        >
          {genStatus === "running" ? "Generating…" : "Generate files"}
        </button>
        {genStatus === "error" && genResult && !genResult.ok ? (
          <p className="newapp__hint">
            Generation failed — see center <strong>Summary</strong> and{" "}
            <strong>Studio Log</strong> tabs for details.
          </p>
        ) : null}
      </section>
      </>

      {files ? (
        <section className="newapp__section">
          <h3 className="prov-heading">3. Review</h3>
          <p className="newapp__meta">
            {genResult?.provider} · {genResult?.model} · {genResult?.latencyMs}ms
          </p>
          <ul className="newapp__filelist">
            {GREENFIELD_FILE_PATHS.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className={`newapp__file${selectedFile === p ? " newapp__file--on" : ""}`}
                  onClick={() => setSelectedFile(p)}
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <FileReview file={selected} />
          ) : null}
          <div className="aipatch__applybar">
            {!approved ? (
              <button type="button" className="prov-btn prov-btn--primary" onClick={approve}>
                Approve generation
              </button>
            ) : (
              <span className="aipatch__approved">Approved</span>
            )}
            <button
              type="button"
              className="prov-btn prov-btn--primary"
              disabled={
                !approved ||
                alreadyWritten ||
                writeStatus === "writing" ||
                setupStatus === "running" ||
                setupStatus === "repairing"
              }
              onClick={() => void writeAndSetup()}
            >
              {writeStatus === "writing"
                ? "Writing…"
                : setupStatus === "running" || setupStatus === "repairing"
                  ? "Running setup…"
                  : alreadyWritten
                    ? "Already written"
                    : "Write files & run setup"}
            </button>
          </div>
        </section>
      ) : null}

      {statusSection}
    </div>
  );
}

function FileReview({ file }: { file: GreenfieldProjectFile }) {
  const rows = useMemo(
    () => computeDiff("", file.content),
    [file.content],
  );
  return (
    <div className="newapp__review">
      <h4 className="newapp__fileheading">Diff (empty → proposed)</h4>
      <div className="diff">
        <div className="diff__rows">
          {rows.slice(0, 80).map((row, i) => (
            <div key={i} className={`diff-row diff-row--${row.type}`}>
              <span className="diff-row__sign">
                {row.type === "add" ? "+" : " "}
              </span>
              <span className="diff-row__text">{row.text || " "}</span>
            </div>
          ))}
          {rows.length > 80 ? (
            <p className="newapp__trunc">…{rows.length - 80} more lines</p>
          ) : null}
        </div>
      </div>
      <h4 className="newapp__fileheading">Full content</h4>
      <pre className="aipatch__code">{file.content}</pre>
    </div>
  );
}

function SetupSummary({ result }: { result: GreenfieldSetupResult }) {
  const steps = [
    { label: "npm install", cmd: result.install },
    result.typecheck ? { label: "TypeScript", cmd: result.typecheck } : null,
    result.build ? { label: "Build", cmd: result.build } : null,
  ].filter(Boolean) as { label: string; cmd: GreenfieldSetupResult["install"] }[];

  return (
    <div className="newapp__setup">
      <h4 className="newapp__fileheading">Setup results</h4>
      {steps.map(({ label, cmd }) => (
        <div key={label} className={`verify-card verify-card--${cmd.ok ? "pass" : "fail"}`}>
          <span className="verify-card__title">{label}</span>
          <span className={`verify-badge verify-badge--${cmd.ok ? "pass" : "fail"}`}>
            {cmd.ok ? "Passed" : "Failed"}
          </span>
          {!cmd.ok && label !== "TypeScript" ? (
            <pre className="verify-output__pre">
              {[cmd.stdout, cmd.stderr].filter(Boolean).join("\n").slice(0, 2000)}
            </pre>
          ) : null}
          {!cmd.ok && label === "TypeScript" ? (
            <p className="newapp__hint">See TypeScript diagnostics below.</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
