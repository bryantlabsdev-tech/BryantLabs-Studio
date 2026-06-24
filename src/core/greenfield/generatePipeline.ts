import { modelForProvider } from "@/core/providers/AnthropicProvider";
import { runProviderPreflight } from "@/core/providers/preflight";
import { estimateTokens } from "@/core/providers/requestSize";
import type { ProviderSettings, ProviderId } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import {
  CRITICAL_GREENFIELD_PATHS,
  fillMissingGreenfieldFiles,
  buildGreenfieldFallbackSkeleton,
  buildCriticalAppScaffold,
  isFallbackSkeletonAppContent,
} from "@/core/greenfield/fallbackSkeleton";
import { validateGreenfieldProject } from "@/core/greenfield/fileValidation";
import {
  logGreenfieldFailed,
  logGreenfieldFileValidation,
  logGreenfieldPreflight,
  logGreenfieldRequest,
  logGreenfieldRetry,
  logGreenfieldSuccess,
} from "@/core/greenfield/generateLogging";
import {
  classifyProviderStopReason,
  classifyGreenfieldParserZeroFiles,
  classifyGreenfieldProviderNoOutput,
  formatGreenfieldParseIncompleteMessage,
} from "@/core/greenfield/parseErrors";
import {
  buildMalformedResponseRepairPrompt,
  buildMissingFilesPrompt,
  buildLeanCriticalFilePrompt,
  mergeGeneratedFiles,
  parseGreenfieldWithRepair,
  recoverBestMarkerContent,
} from "@/core/greenfield/parseResponse";
import {
  GREENFIELD_FILE_PATHS,
  type GeneratedFile,
  type GreenfieldFilePath,
  type GreenfieldGenerateResult,
  type GreenfieldParseDiagnostics,
  type GreenfieldParseTrace,
} from "@/core/greenfield/types";
import type { BryantLabsApi } from "@/types";
import { retryBlockedDueToBudgetReason, greenfieldRepairReserve } from "@/core/providers/greenfieldCallBudget";
import { classifyGreenfieldGenerationRoute } from "@/core/greenfield/greenfieldRouter";
import { runMultiPhaseGreenfieldGenerate } from "@/core/greenfield/multiPhasePipeline";

const MAX_FILE_REPAIR_ATTEMPTS = 2;
const MAX_MALFORMED_REPAIR_ATTEMPTS = 1;
const MAX_ZERO_FILE_REPAIR_ATTEMPTS = 1;

const SKELETON_FALLBACK_BLOCKED_MESSAGE =
  "Generation could not produce your app — placeholder skeleton was blocked. Retry with a clearer prompt or switch provider.";

function warningsIncludeBudgetForcedSkeleton(warnings: readonly string[]): boolean {
  return warnings.some(
    (w) =>
      /budget exhausted/i.test(w) ||
      /repair pass skipped/i.test(w) ||
      /retry blocked/i.test(w) ||
      /Using fallback skeleton instead/i.test(w),
  );
}

/** Provider must deliver 6/7 files before we may locally scaffold a missing App.tsx. */
function shouldBlockLocalAppFill(
  mergedFileCount: number,
  skeletonFilledPaths: readonly GreenfieldFilePath[],
  recoveredPartialPaths: readonly GreenfieldFilePath[],
): boolean {
  return (
    skeletonFilledPaths.includes("src/App.tsx") &&
    !recoveredPartialPaths.includes("src/App.tsx") &&
    mergedFileCount < GREENFIELD_FILE_PATHS.length - 1
  );
}

function backupProviderConfigured(settings: ProviderSettings): boolean {
  const backup = settings.backupProvider;
  return Boolean(backup && backup !== settings.provider);
}

function buildParseTrace(
  parseOutcome: ReturnType<typeof parseGreenfieldWithRepair>,
  lastResult: GreenfieldGenerateResult,
  opts: {
    repairAttempted: boolean;
    repairSucceeded: boolean;
    fallbackSkeletonCreated: boolean;
    backupProviderAttempted: boolean;
    backupProviderUsed: string | null;
    backupProviderFailureReason: string | null;
  },
): GreenfieldParseTrace {
  return {
    rawResponsePreview: parseOutcome.rawResponsePreview,
    rawResponseLength: parseOutcome.rawResponseLength,
    parserPatternsAttempted: parseOutcome.patternsAttempted,
    parserFailureReasons: parseOutcome.failureReasons,
    responseShape: parseOutcome.responseShape,
    bestPattern: parseOutcome.bestPattern,
    provider: lastResult.provider,
    model: lastResult.model,
    stage: "greenfield",
    repairAttempted: opts.repairAttempted,
    repairSucceeded: opts.repairSucceeded,
    fallbackSkeletonCreated: opts.fallbackSkeletonCreated,
    backupProviderAttempted: opts.backupProviderAttempted,
    backupProviderUsed: opts.backupProviderUsed,
    backupProviderFailureReason: opts.backupProviderFailureReason,
  };
}

export interface GreenfieldGenerateReliabilityHost {
  readonly api: BryantLabsApi;
  readonly settings: ProviderSettings;
  readonly invokeGreenfieldCall: <T extends StageProviderResult>(
    settings: ProviderSettings,
    estimatedTokens: number,
    call: (provider: ProviderId) => Promise<T>,
    promptPayload?: string,
    recordPurpose?: "primary" | "retry" | "repair",
  ) => Promise<T | null>;
  readonly providerStopReasonRef?: { current: string | null };
  readonly providerRequestSentRef?: { current: boolean };
  readonly prepareGreenfieldBudget?: () => void;
  /** Reserves full call budget for shared/pages/app phases (no repair holdback). */
  readonly prepareMultiPhaseGreenfieldBudget?: (pageCount?: number) => void;
  /** Clears per-run AI call usage before greenfield generation starts. */
  readonly resetAiCallBudget?: () => void;
  readonly canMakeAiCall?: (
    purpose: "primary" | "retry" | "repair",
  ) => { ok: true } | { ok: false; reason: string };
  /** Uses the setup-repair budget slot (repair stage gate) for a final App.tsx-only provider call. */
  readonly canMakeAppCompletionCall?: () => { ok: true } | { ok: false; reason: string };
  readonly invokeAppCompletionCall?: GreenfieldGenerateReliabilityHost["invokeGreenfieldCall"];
  /** Raw phased greenfield call (prompt as-is, smaller output cap). */
  readonly invokeGreenfieldRawCall?: GreenfieldGenerateReliabilityHost["invokeGreenfieldCall"];
}

function buildParseDiagnostics(
  parsedPaths: readonly GreenfieldFilePath[],
  missing: readonly GreenfieldFilePath[],
  malformed: readonly GreenfieldFilePath[],
  unexpected: readonly string[] = [],
): GreenfieldParseDiagnostics {
  return {
    expectedFiles: GREENFIELD_FILE_PATHS,
    parsedFiles: parsedPaths,
    missingFiles: missing,
    malformedBlocks: malformed,
    ...(unexpected.length > 0 ? { unexpectedFiles: unexpected } : {}),
  };
}

function stoppedResult(
  settings: ProviderSettings,
  reason: string,
  startedAt: number,
  extras?: Partial<GreenfieldGenerateResult>,
): GreenfieldGenerateResult {
  const provider = settings.provider;
  const classified = classifyProviderStopReason(reason);
  return {
    ok: false,
    provider,
    model: modelForProvider(settings, provider),
    latencyMs: Date.now() - startedAt,
    error: classified.message,
    exactFailureStage: classified.stage,
    exactProviderError: reason,
    providerRequestSent: extras?.providerRequestSent ?? false,
    ...extras,
  };
}

async function callProviderGenerate(
  host: GreenfieldGenerateReliabilityHost,
  provider: ProviderId,
  prompt: string,
): Promise<GreenfieldGenerateResult> {
  return host.api.greenfieldGenerate(provider, prompt);
}

function collectRecoveredPartials(
  rawTexts: readonly string[],
  missing: readonly GreenfieldFilePath[],
  mergedFiles: readonly GeneratedFile[],
): Partial<Record<GreenfieldFilePath, string>> {
  const recovered: Partial<Record<GreenfieldFilePath, string>> = {};
  for (const path of missing) {
    let best: string | null = null;
    for (const rawText of rawTexts) {
      const fromRaw = recoverBestMarkerContent(rawText, path);
      if (fromRaw && (!best || fromRaw.length > best.length)) {
        best = fromRaw;
      }
    }
    if (best) {
      recovered[path] = best;
      continue;
    }
    const fromMerge = mergedFiles.find((file) => file.path === path)?.content.trim();
    if (fromMerge) recovered[path] = fromMerge;
  }
  return recovered;
}

function buildFilledFilesResult(
  mergedFiles: GeneratedFile[],
  missingFiles: readonly GreenfieldFilePath[],
  userPrompt: string,
  rawTexts: readonly string[],
) {
  const recoveredPartials = collectRecoveredPartials(rawTexts, missingFiles, mergedFiles);
  let fillResult = fillMissingGreenfieldFiles(mergedFiles, missingFiles, userPrompt, {
    recoveredPartials,
    allowCriticalSkeleton: false,
  });

  const stillMissing = GREENFIELD_FILE_PATHS.filter(
    (path) => !fillResult.files.some((file) => file.path === path),
  );
  if (stillMissing.length > 0) {
    fillResult = fillMissingGreenfieldFiles(fillResult.files, stillMissing, userPrompt, {
      recoveredPartials,
      allowCriticalSkeleton: true,
    });
  }

  return fillResult;
}

function collectParsedFiles(
  mergedFiles: GeneratedFile[],
  parseOutcome: ReturnType<typeof parseGreenfieldWithRepair>,
  fromIpc: GeneratedFile[] | null | undefined,
  mergeOnlyPaths?: readonly GreenfieldFilePath[],
): GeneratedFile[] {
  let incoming: GeneratedFile[] = [];
  if (fromIpc?.length) incoming = fromIpc;
  else if (parseOutcome.files?.length) incoming = parseOutcome.files;
  else if (parseOutcome.partial.length) incoming = parseOutcome.partial;

  if (mergeOnlyPaths?.length) {
    const allowed = new Set(mergeOnlyPaths);
    incoming = incoming.filter((file) => allowed.has(file.path));
  }

  if (incoming.length === 0) return mergedFiles;
  return mergeGeneratedFiles(mergedFiles, incoming);
}

function criticalRepairMergePaths(
  missingFiles: readonly GreenfieldFilePath[],
): readonly GreenfieldFilePath[] {
  const critical = missingFiles.filter((path) => CRITICAL_GREENFIELD_PATHS.includes(path));
  return critical.length > 0 ? critical : ["src/App.tsx"];
}

function shouldPrioritizeCriticalCompletion(
  missingFiles: readonly GreenfieldFilePath[],
  mergedCount: number,
): boolean {
  if (!missingFiles.includes("src/App.tsx")) return false;
  if (mergedCount >= GREENFIELD_FILE_PATHS.length - 1) return true;
  // 5/7+ with App.tsx missing — lean App-only repair beats generic missing-file retry.
  if (mergedCount >= GREENFIELD_FILE_PATHS.length - 2) return true;
  return isCriticalOnlyRecoveryState(missingFiles, mergedCount);
}

function isCriticalOnlyRecoveryState(
  missingFiles: readonly GreenfieldFilePath[],
  mergedCount: number,
): boolean {
  return (
    missingFiles.length > 0 &&
    missingFiles.every((path) => CRITICAL_GREENFIELD_PATHS.includes(path)) &&
    mergedCount >= GREENFIELD_FILE_PATHS.length - missingFiles.length
  );
}

function budgetBlockReason(
  host: GreenfieldGenerateReliabilityHost,
  settings: ProviderSettings,
  purpose: "primary" | "retry" | "repair",
): string | null {
  const gate = host.canMakeAiCall?.(purpose);
  if (!gate || gate.ok) return null;
  return (
    gate.reason ??
    (purpose === "retry"
      ? retryBlockedDueToBudgetReason(
          settings.maxAiCalls ?? 3,
          greenfieldRepairReserve(settings.maxAiCalls ?? 3),
        )
      : `Max AI calls reached (${settings.maxAiCalls ?? 3} per run). Stop or raise the limit in Providers.`)
  );
}

function pushBudgetWarning(
  warnings: string[],
  reason: string,
): void {
  if (!warnings.includes(reason)) {
    warnings.push(reason);
  }
}

async function tryReservedAppCompletionCall(
  host: GreenfieldGenerateReliabilityHost,
  settings: ProviderSettings,
  userPrompt: string,
  mergedFiles: GeneratedFile[],
  validation: ReturnType<typeof validateGreenfieldProject>,
  allRawTexts: string[],
): Promise<{
  mergedFiles: GeneratedFile[];
  validation: ReturnType<typeof validateGreenfieldProject>;
  parseOutcome: ReturnType<typeof parseGreenfieldWithRepair>;
  lastResult: GreenfieldGenerateResult;
  repairAttempted: boolean;
} | null> {
  if (!validation.missingFiles.includes("src/App.tsx")) return null;
  if (!host.invokeAppCompletionCall || !host.canMakeAppCompletionCall) return null;

  const gate = host.canMakeAppCompletionCall();
  if (!gate.ok) return null;

  const completionPrompt = buildLeanCriticalFilePrompt(
    userPrompt,
    ["src/App.tsx"],
    mergedFiles,
  );

  logGreenfieldRetry({
    reason: "reserved_app_completion",
    attempt: 1,
    missingFiles: ["src/App.tsx"],
  });

  const ipcResult = await host.invokeAppCompletionCall(
    settings,
    estimateTokens(completionPrompt),
    (provider) => callProviderGenerate(host, provider, completionPrompt),
    completionPrompt,
  );

  if (!ipcResult?.rawText?.trim()) return null;

  const result = ipcResult as GreenfieldGenerateResult;
  allRawTexts.push(result.rawText ?? "");
  const parseOutcome = parseGreenfieldWithRepair(result.rawText ?? "", completionPrompt);
  const nextMerged = collectParsedFiles(mergedFiles, parseOutcome, result.files, [
    "src/App.tsx",
  ]);
  const nextValidation = validateGreenfieldProject(
    nextMerged.length > 0 ? nextMerged : null,
    parseOutcome.markerAudit.missingFiles,
  );

  if (
    nextValidation.missingFiles.includes("src/App.tsx")
  ) {
    return null;
  }

  const appFile = nextMerged.find((file) => file.path === "src/App.tsx");
  if (!appFile?.content.trim() || isFallbackSkeletonAppContent(appFile.content)) {
    return null;
  }

  logGreenfieldFileValidation({
    ok: nextValidation.ok,
    issues: nextValidation.errors,
    missingFiles: nextValidation.missingFiles,
  });

  return {
    mergedFiles: nextMerged,
    validation: nextValidation,
    parseOutcome,
    lastResult: result,
    repairAttempted: true,
  };
}

export async function runGreenfieldGenerateWithReliability(
  host: GreenfieldGenerateReliabilityHost,
  userPrompt: string,
): Promise<GreenfieldGenerateResult> {
  const route = classifyGreenfieldGenerationRoute(userPrompt);
  if (route.mode === "multi-phase") {
    return runMultiPhaseGreenfieldGenerate(host, userPrompt);
  }

  const startedAt = Date.now();
  const settings = host.settings;
  const provider = settings.provider;
  const model = modelForProvider(settings, provider);
  let generateAttempt = 0;
  let fileRepairAttempt = 0;
  let malformedRepairAttempt = 0;
  let zeroFileRepairAttempt = 0;
  let criticalFileRepairAttempted = false;
  let mergedFiles: GeneratedFile[] = [];
  let activePrompt = userPrompt;
  let lastResult: GreenfieldGenerateResult | null = null;
  let lastRawText = "";
  let allRawTexts: string[] = [];
  let repairAttempted = false;
  let repairSucceeded = false;
  let fallbackSkeletonUsed = false;
  let providerRequestSent = false;
  let backupProviderAttempted = false;
  let backupProviderUsed: string | null = null;
  const warnings: string[] = [];
  const backupAvailable = backupProviderConfigured(settings);

  host.resetAiCallBudget?.();
  host.prepareGreenfieldBudget?.();

  const preflight = runProviderPreflight({
    settings,
    stage: "greenfield",
    provider,
    model,
    estimatedTokens: estimateTokens(userPrompt),
    promptPayload: userPrompt,
    skipHealthCheck: true,
  });
  logGreenfieldPreflight({
    provider,
    model,
    ok: preflight.ok,
    ...(preflight.reason ? { reason: preflight.reason } : {}),
  });

  if (!preflight.ok && preflight.blocked) {
    const reason = preflight.message ?? preflight.reason ?? "preflight_blocked";
    logGreenfieldFailed({ provider, model, reason });
    return stoppedResult(settings, reason, startedAt, {
      exactFailureStage: "preflight",
      exactProviderError: reason,
    });
  }

  let nextPurpose: "primary" | "retry" | "repair" | null = "primary";
  let validation = validateGreenfieldProject(null);
  let parseOutcome: ReturnType<typeof parseGreenfieldWithRepair> | null = null;
  let parseDiagnostics = buildParseDiagnostics([], GREENFIELD_FILE_PATHS, []);
  let parseTrace: GreenfieldParseTrace | null = null;

  while (nextPurpose !== null) {
    const purpose = nextPurpose;
    nextPurpose = null;
    const blocked = budgetBlockReason(host, settings, purpose);
    if (blocked) {
      pushBudgetWarning(warnings, blocked);
      break;
    }

    generateAttempt += 1;
    if (host.providerRequestSentRef) host.providerRequestSentRef.current = false;

    logGreenfieldRequest({
      provider: lastResult?.provider ?? provider,
      model: lastResult?.model ?? model,
      attempt: generateAttempt,
      promptChars: activePrompt.length,
    });

    const ipcResult = await host.invokeGreenfieldCall(
      settings,
      estimateTokens(activePrompt),
      (p) => callProviderGenerate(host, p, activePrompt),
      activePrompt,
      purpose,
    );

    providerRequestSent =
      host.providerRequestSentRef?.current === true || providerRequestSent;

    if (!ipcResult) {
      const stopReason =
        host.providerStopReasonRef?.current ??
        "Provider call was blocked before a request was sent.";
      logGreenfieldFailed({
        provider,
        model,
        reason: stopReason,
        durationMs: Date.now() - startedAt,
      });
      const classified = classifyProviderStopReason(stopReason);
      const error =
        classified.stage === "budget" ||
        classified.stage === "cancelled" ||
        classified.stage === "preflight" ||
        classified.stage === "rate_limited"
          ? classified.message
          : classifyGreenfieldProviderNoOutput(
              stopReason,
              backupAvailable,
              backupProviderAttempted,
            );
      return stoppedResult(settings, stopReason, startedAt, {
        providerRequestSent,
        error,
        exactFailureStage: classified.stage,
        exactProviderError: stopReason,
        parseTrace: {
          rawResponsePreview: "",
          rawResponseLength: 0,
          parserPatternsAttempted: [],
          parserFailureReasons: {},
          provider,
          model,
          stage: "greenfield",
          backupProviderAttempted,
          backupProviderUsed,
          backupProviderFailureReason: backupProviderAttempted
            ? stopReason
            : backupAvailable
              ? null
              : "No backup provider configured.",
        },
      });
    }

    lastResult = ipcResult as GreenfieldGenerateResult;
    if (host.providerStopReasonRef) host.providerStopReasonRef.current = null;
    if (lastResult.provider && lastResult.provider !== provider) {
      backupProviderAttempted = true;
      backupProviderUsed = lastResult.provider;
    }
    providerRequestSent =
      providerRequestSent ||
      Boolean(lastResult.rawText) ||
      (lastResult.latencyMs ?? 0) > 500;

    if (!lastResult.ok && !lastResult.rawText) {
      const providerError = lastResult.error ?? "provider_failed";
      logGreenfieldFailed({
        provider: lastResult.provider,
        model: lastResult.model,
        reason: providerError,
        durationMs: lastResult.latencyMs,
      });
      const error = classifyGreenfieldProviderNoOutput(
        providerError,
        backupAvailable,
        backupProviderAttempted,
      );
      return {
        ...lastResult,
        ok: false,
        error,
        providerRequestSent: true,
        exactFailureStage: lastResult.exactFailureStage ?? "provider",
        exactProviderError: providerError,
        parseTrace: {
          rawResponsePreview: "",
          rawResponseLength: 0,
          parserPatternsAttempted: [],
          parserFailureReasons: {},
          provider: lastResult.provider,
          model: lastResult.model,
          stage: "greenfield",
          backupProviderAttempted,
          backupProviderUsed,
          backupProviderFailureReason: backupProviderAttempted
            ? providerError
            : backupAvailable
              ? null
              : "No backup provider configured.",
        },
      };
    }

    const rawText = lastResult.rawText ?? "";
    if (rawText) {
      lastRawText = rawText;
      allRawTexts.push(rawText);
    }
    parseOutcome = parseGreenfieldWithRepair(rawText, activePrompt);
    const parsedBeforeMerge = mergedFiles.length;
    const mergeOnlyPaths =
      purpose === "repair" ? criticalRepairMergePaths(validation.missingFiles) : undefined;
    mergedFiles = collectParsedFiles(
      mergedFiles,
      parseOutcome,
      lastResult.files,
      mergeOnlyPaths,
    );
    if (repairAttempted && mergedFiles.length > parsedBeforeMerge) {
      repairSucceeded = true;
    }

    validation = validateGreenfieldProject(
      mergedFiles.length > 0 ? mergedFiles : null,
      parseOutcome.markerAudit.missingFiles,
    );

    logGreenfieldFileValidation({
      ok: validation.ok,
      issues: validation.errors,
      missingFiles: validation.missingFiles,
    });

    parseDiagnostics = buildParseDiagnostics(
      validation.files.map((f) => f.path),
      validation.missingFiles,
      parseOutcome.diagnostics.malformedBlocks,
      parseOutcome.diagnostics.unexpectedFiles,
    );
    parseTrace = buildParseTrace(parseOutcome, lastResult, {
      repairAttempted,
      repairSucceeded,
      fallbackSkeletonCreated: fallbackSkeletonUsed,
      backupProviderAttempted,
      backupProviderUsed,
      backupProviderFailureReason: null,
    });

    if (validation.ok && validation.files.length === GREENFIELD_FILE_PATHS.length) {
      const appFile = validation.files.find((file) => file.path === "src/App.tsx");
      const appShellIncomplete = appFile
        ? isFallbackSkeletonAppContent(appFile.content)
        : false;
      logGreenfieldSuccess({
        provider: lastResult.provider,
        model: lastResult.model,
        fileCount: validation.files.length,
        durationMs: Date.now() - startedAt,
      });
      return {
        ...lastResult,
        ok: true,
        files: validation.files,
        markerAudit: parseOutcome.markerAudit,
        parseDiagnostics,
        parseTrace,
        providerRequestSent: true,
        appShellIncomplete,
        ...(appShellIncomplete ? { partialSuccess: true } : {}),
        ...(warnings.length > 0 ? { warnings, partialSuccess: true } : {}),
        ...(repairAttempted ? { repairAttempted: true } : {}),
        ...(fallbackSkeletonUsed ? { fallbackSkeletonUsed: true } : {}),
        ...(parseOutcome.diagnostics.recoveredTruncatedFiles?.length
          ? {
              recoveredPartialPaths: parseOutcome.diagnostics.recoveredTruncatedFiles,
            }
          : {}),
      };
    }

    const prioritizeCriticalCompletion =
      validation.missingFiles.length > 0 &&
      (shouldPrioritizeCriticalCompletion(validation.missingFiles, mergedFiles.length) ||
        isCriticalOnlyRecoveryState(validation.missingFiles, mergedFiles.length));

    const deferAppCompletionToReserve =
      prioritizeCriticalCompletion &&
      validation.missingFiles.includes("src/App.tsx") &&
      Boolean(host.invokeAppCompletionCall && host.canMakeAppCompletionCall);

    const skipMalformedRepairForAppTruncation =
      deferAppCompletionToReserve ||
      (validation.missingFiles.includes("src/App.tsx") &&
        mergedFiles.length >= GREENFIELD_FILE_PATHS.length - 1);

    if (prioritizeCriticalCompletion && !deferAppCompletionToReserve) {
      const repairBlocked = budgetBlockReason(host, settings, "repair");
      if (!repairBlocked && !criticalFileRepairAttempted) {
        criticalFileRepairAttempted = true;
        repairAttempted = true;
        logGreenfieldRetry({
          reason: "critical_file_completion",
          attempt: generateAttempt + 1,
          missingFiles: validation.missingFiles.filter((path) =>
            CRITICAL_GREENFIELD_PATHS.includes(path),
          ),
        });
        activePrompt = buildLeanCriticalFilePrompt(
          userPrompt,
          validation.missingFiles.filter((path) =>
            CRITICAL_GREENFIELD_PATHS.includes(path),
          ),
          mergedFiles,
        );
        nextPurpose = "repair";
      } else if (repairBlocked) {
        pushBudgetWarning(warnings, repairBlocked);
      }
    }

    if (
      !nextPurpose &&
      mergedFiles.length === 0 &&
      zeroFileRepairAttempt < MAX_ZERO_FILE_REPAIR_ATTEMPTS &&
      lastRawText.trim()
    ) {
      const retryBlocked = budgetBlockReason(host, settings, "retry");
      if (retryBlocked) {
        pushBudgetWarning(warnings, retryBlocked);
      } else {
        zeroFileRepairAttempt += 1;
        repairAttempted = true;
        const repairMsg = formatGreenfieldParseIncompleteMessage(
          0,
          GREENFIELD_FILE_PATHS,
          { attemptingRepair: true },
        );
        warnings.push(repairMsg);
        logGreenfieldRetry({
          reason: "zero_file_format_repair",
          attempt: zeroFileRepairAttempt,
          missingFiles: GREENFIELD_FILE_PATHS,
        });
        activePrompt = buildMalformedResponseRepairPrompt(
          userPrompt,
          lastRawText,
          GREENFIELD_FILE_PATHS,
          [],
        );
        nextPurpose = "retry";
      }
    }

    if (
      !nextPurpose &&
      validation.missingFiles.length > 0 &&
      fileRepairAttempt < MAX_FILE_REPAIR_ATTEMPTS &&
      !validation.missingFiles.includes("src/App.tsx") &&
      !shouldPrioritizeCriticalCompletion(validation.missingFiles, mergedFiles.length)
    ) {
      const retryBlocked = budgetBlockReason(host, settings, "retry");
      if (retryBlocked) {
        pushBudgetWarning(warnings, retryBlocked);
      } else {
        fileRepairAttempt += 1;
        const criticalMissing = validation.missingFiles.filter((path) =>
          CRITICAL_GREENFIELD_PATHS.includes(path),
        );
        const repairTargets =
          criticalMissing.length > 0 ? criticalMissing : validation.missingFiles;
        logGreenfieldRetry({
          reason: "missing_or_invalid_files",
          attempt: fileRepairAttempt,
          missingFiles: repairTargets,
        });
        activePrompt = buildMissingFilesPrompt(
          userPrompt,
          repairTargets,
          mergedFiles,
        );
        nextPurpose = "retry";
      }
    }

    if (
      !nextPurpose &&
      !skipMalformedRepairForAppTruncation &&
      mergedFiles.length > 0 &&
      validation.missingFiles.length > 0 &&
      malformedRepairAttempt < MAX_MALFORMED_REPAIR_ATTEMPTS &&
      lastRawText.trim()
    ) {
      const retryBlocked = budgetBlockReason(host, settings, "retry");
      if (retryBlocked) {
        pushBudgetWarning(warnings, retryBlocked);
      } else {
        malformedRepairAttempt += 1;
        repairAttempted = true;
        const repairMsg = formatGreenfieldParseIncompleteMessage(
          mergedFiles.length,
          validation.missingFiles,
          { attemptingRepair: true },
        );
        warnings.push(repairMsg);
        logGreenfieldRetry({
          reason: "malformed_response_repair",
          attempt: malformedRepairAttempt,
          missingFiles: validation.missingFiles,
        });
        activePrompt = buildMalformedResponseRepairPrompt(
          userPrompt,
          lastRawText,
          validation.missingFiles,
          mergedFiles,
        );
        nextPurpose = "retry";
      }
    }

    if (nextPurpose) {
      continue;
    }
    break;
  }

  if (mergedFiles.length > 0 && lastResult && parseOutcome) {
    const reserved = await tryReservedAppCompletionCall(
      host,
      settings,
      userPrompt,
      mergedFiles,
      validation,
      allRawTexts,
    );
    if (reserved) {
      mergedFiles = reserved.mergedFiles;
      validation = reserved.validation;
      parseOutcome = reserved.parseOutcome;
      lastResult = reserved.lastResult;
      repairAttempted = reserved.repairAttempted;
      if (parseTrace) {
        parseTrace = buildParseTrace(parseOutcome, lastResult, {
          repairAttempted,
          repairSucceeded:
            repairAttempted &&
            !validation.missingFiles.includes("src/App.tsx"),
          fallbackSkeletonCreated: fallbackSkeletonUsed,
          backupProviderAttempted,
          backupProviderUsed,
          backupProviderFailureReason: null,
        });
      }
    }
  }

  if (mergedFiles.length > 0 && lastResult && parseOutcome && parseTrace) {
    const fillResult = buildFilledFilesResult(
        mergedFiles,
        validation.missingFiles,
        userPrompt,
        allRawTexts,
      );
      let filledFiles = fillResult.files;
      if (
        shouldBlockLocalAppFill(
          mergedFiles.length,
          fillResult.skeletonFilledPaths,
          fillResult.recoveredPartialPaths,
        )
      ) {
        fallbackSkeletonUsed = true;
        const incompleteMsg = formatGreenfieldParseIncompleteMessage(
          mergedFiles.length,
          validation.missingFiles,
        );
        warnings.push(
          `Filled ${fillResult.skeletonFilledPaths.length} missing file(s) with fallback skeleton: ${fillResult.skeletonFilledPaths.join(", ")}`,
        );
        logGreenfieldFailed({
          provider: lastResult.provider,
          model: lastResult.model,
          reason: SKELETON_FALLBACK_BLOCKED_MESSAGE,
          durationMs: Date.now() - startedAt,
        });
        return {
          ...lastResult,
          ok: false,
          error: SKELETON_FALLBACK_BLOCKED_MESSAGE,
          files: filledFiles,
          partialSuccess: true,
          appShellIncomplete: fillResult.appShellIncomplete,
          skeletonFallbackPaths: fillResult.skeletonFilledPaths,
          recoveredPartialPaths: fillResult.recoveredPartialPaths,
          warnings: [...warnings, incompleteMsg],
          markerAudit: parseOutcome.markerAudit,
          parseDiagnostics: buildParseDiagnostics(
            mergedFiles.map((f) => f.path),
            validation.missingFiles,
            parseOutcome.diagnostics.malformedBlocks,
          ),
          parseTrace: buildParseTrace(parseOutcome, lastResult, {
            repairAttempted,
            repairSucceeded,
            fallbackSkeletonCreated: true,
            backupProviderAttempted,
            backupProviderUsed,
            backupProviderFailureReason: null,
          }),
          providerRequestSent: true,
          repairAttempted,
          fallbackSkeletonUsed: true,
        };
      }
      if (
        fillResult.skeletonFilledPaths.includes("src/App.tsx") &&
        !fillResult.recoveredPartialPaths.includes("src/App.tsx") &&
        filledFiles.some(
          (file) => file.path === "src/App.tsx" && isFallbackSkeletonAppContent(file.content),
        )
      ) {
        filledFiles = filledFiles.map((file) =>
          file.path === "src/App.tsx"
            ? { path: "src/App.tsx", content: buildCriticalAppScaffold(userPrompt) }
            : file,
        );
        warnings.push(
          "Filled src/App.tsx with local scaffold after provider output truncated (6/7 files recovered).",
        );
      }

      const filledValidation = validateGreenfieldProject(filledFiles);
      if (filledValidation.files.length > 0) {
        if (fillResult.skeletonFilledPaths.length > 0) {
          fallbackSkeletonUsed = true;
          warnings.push(
            `Filled ${fillResult.skeletonFilledPaths.length} missing file(s) with fallback skeleton: ${fillResult.skeletonFilledPaths.join(", ")}`,
          );
        }
        if (fillResult.recoveredPartialPaths.length > 0) {
          warnings.push(
            `Recovered partial provider content for: ${fillResult.recoveredPartialPaths.join(", ")}`,
          );
        }
        if (fillResult.appShellIncomplete) {
          warnings.push(
            "App shell incomplete — src/App.tsx was not fully generated; preview may show placeholder UI.",
          );
        }
        const incompleteMsg = formatGreenfieldParseIncompleteMessage(
          mergedFiles.length,
          validation.missingFiles,
        );
        logGreenfieldSuccess({
          provider: lastResult.provider,
          model: lastResult.model,
          fileCount: filledValidation.files.length,
          durationMs: Date.now() - startedAt,
        });
        if (
          fillResult.skeletonFilledPaths.length > 0 &&
          fillResult.skeletonFilledPaths.some((path) => path !== "src/App.tsx") &&
          (warningsIncludeBudgetForcedSkeleton(warnings) ||
            filledFiles.some(
              (file) => file.path === "src/App.tsx" && isFallbackSkeletonAppContent(file.content),
            ))
        ) {
          logGreenfieldFailed({
            provider: lastResult.provider,
            model: lastResult.model,
            reason: SKELETON_FALLBACK_BLOCKED_MESSAGE,
            durationMs: Date.now() - startedAt,
          });
          return {
            ...lastResult,
            ok: false,
            error: SKELETON_FALLBACK_BLOCKED_MESSAGE,
            files: filledFiles,
            partialSuccess: true,
            appShellIncomplete: fillResult.appShellIncomplete,
            skeletonFallbackPaths: fillResult.skeletonFilledPaths,
            recoveredPartialPaths: fillResult.recoveredPartialPaths,
            warnings: [...warnings, incompleteMsg],
            markerAudit: parseOutcome.markerAudit,
            parseDiagnostics: buildParseDiagnostics(
              mergedFiles.map((f) => f.path),
              validation.missingFiles,
              parseOutcome.diagnostics.malformedBlocks,
            ),
            parseTrace: buildParseTrace(parseOutcome, lastResult, {
              repairAttempted,
              repairSucceeded,
              fallbackSkeletonCreated: fillResult.skeletonFilledPaths.length > 0,
              backupProviderAttempted,
              backupProviderUsed,
              backupProviderFailureReason: null,
            }),
            providerRequestSent: true,
            repairAttempted,
            fallbackSkeletonUsed: true,
          };
        }
        return {
          ...lastResult,
          ok: filledValidation.files.length === GREENFIELD_FILE_PATHS.length,
          files: filledFiles,
          partialSuccess: true,
          appShellIncomplete: fillResult.appShellIncomplete,
          skeletonFallbackPaths: fillResult.skeletonFilledPaths,
          recoveredPartialPaths: fillResult.recoveredPartialPaths,
          warnings: [...warnings, incompleteMsg],
          markerAudit: parseOutcome.markerAudit,
          parseDiagnostics: buildParseDiagnostics(
            mergedFiles.map((f) => f.path),
            validation.missingFiles,
            parseOutcome.diagnostics.malformedBlocks,
          ),
          parseTrace: buildParseTrace(parseOutcome, lastResult, {
            repairAttempted,
            repairSucceeded,
            fallbackSkeletonCreated: fillResult.skeletonFilledPaths.length > 0,
            backupProviderAttempted,
            backupProviderUsed,
            backupProviderFailureReason: null,
          }),
          providerRequestSent: true,
          repairAttempted,
          fallbackSkeletonUsed: fillResult.skeletonFilledPaths.length > 0,
        };
      }
  }

  if (mergedFiles.length === 0 && lastResult && parseOutcome && parseTrace) {
      fallbackSkeletonUsed = true;
      repairAttempted = repairAttempted || malformedRepairAttempt > 0;
      const skeleton = buildGreenfieldFallbackSkeleton(userPrompt);
      warnings.push(
        "No usable files were parsed from provider output. Placeholder skeleton generation was blocked.",
      );
      logGreenfieldFailed({
        provider: lastResult.provider,
        model: lastResult.model,
        reason: SKELETON_FALLBACK_BLOCKED_MESSAGE,
        durationMs: Date.now() - startedAt,
      });
      return {
        ...lastResult,
        ok: false,
        error: SKELETON_FALLBACK_BLOCKED_MESSAGE,
        files: skeleton,
        partialSuccess: true,
        warnings,
        markerAudit: parseOutcome.markerAudit,
        parseDiagnostics: buildParseDiagnostics(
          [],
          GREENFIELD_FILE_PATHS,
          parseOutcome.diagnostics.malformedBlocks,
        ),
        parseTrace: buildParseTrace(parseOutcome, lastResult, {
          repairAttempted: repairAttempted || zeroFileRepairAttempt > 0,
          repairSucceeded,
          fallbackSkeletonCreated: true,
          backupProviderAttempted,
          backupProviderUsed,
          backupProviderFailureReason: null,
        }),
        providerRequestSent,
        repairAttempted: repairAttempted || zeroFileRepairAttempt > 0,
        fallbackSkeletonUsed: true,
      };
  }

  if (lastResult && parseOutcome && parseTrace) {
    const error =
      mergedFiles.length === 0 && lastRawText.trim()
        ? classifyGreenfieldParserZeroFiles(lastRawText.length)
        : formatGreenfieldParseIncompleteMessage(
            mergedFiles.length,
            validation.missingFiles,
          ) ||
          validation.errors[0] ||
          lastResult.error ||
          "Greenfield generation failed file validation.";
    logGreenfieldFailed({
      provider: lastResult.provider,
      model: lastResult.model,
      reason: error,
      durationMs: Date.now() - startedAt,
    });
    return {
      ...lastResult,
      ok: false,
      error,
      markerAudit: parseOutcome.markerAudit,
      parseDiagnostics,
      parseTrace,
      files: mergedFiles,
      providerRequestSent,
      exactFailureStage: "parser",
      exactProviderError: error,
      repairAttempted,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  const budgetWarning = warnings.find((warning) =>
    /max ai calls reached/i.test(warning),
  );
  if (budgetWarning) {
    return stoppedResult(settings, budgetWarning, startedAt, {
      providerRequestSent,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  }

  return (
    lastResult ?? {
      ok: false,
      provider,
      model,
      latencyMs: Date.now() - startedAt,
      error: "Greenfield generation exhausted repair attempts.",
      exactFailureStage: "parser",
      providerRequestSent,
      ...(warnings.length > 0 ? { warnings } : {}),
    }
  );
}
