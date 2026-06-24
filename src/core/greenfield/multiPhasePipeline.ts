import { modelForProvider } from "@/core/providers/AnthropicProvider";
import { estimateTokens } from "@/core/providers/requestSize";
import type { ProviderSettings, ProviderId } from "@/core/providers/types";
import type { StageProviderResult } from "@/core/providers/stageInvoke";
import { buildBootstrapFiles } from "@/core/greenfield/bootstrapTemplate";
import {
  logGreenfieldFailed,
  logGreenfieldRequest,
  logGreenfieldRetry,
  logGreenfieldSuccess,
} from "@/core/greenfield/generateLogging";
import { classifyGreenfieldGenerationRoute } from "@/core/greenfield/greenfieldRouter";
import type { GreenfieldGenerateReliabilityHost } from "@/core/greenfield/generatePipeline";
import {
  allManifestPaths,
  planManifestFromPrompt,
} from "@/core/greenfield/manifestPlanner";
import { missingCorePaths } from "@/core/greenfield/projectPaths";
import {
  buildAppIntegrationPrompt,
  buildPagesBatchPhasePrompt,
  buildSharedPhasePrompt,
  buildSingleFileRetryPrompt,
} from "@/core/greenfield/phasedPrompts";
import {
  manifestSliceForBatch,
  splitPagesIntoBatches,
} from "@/core/greenfield/multiPhasePlan";
import {
  coreFilesFromProject,
  mergeProjectFiles,
  parseTargetFilesFromResponse,
} from "@/core/greenfield/parseProjectFile";
import { fillMissingPageStubs } from "@/core/greenfield/pageStubs";
import { buildDeterministicAppFromManifest } from "@/core/greenfield/appStub";
import { sanitizeAppIntegration } from "@/core/greenfield/appIntegrationSanitizer";
import { hardenGreenfieldProjectFiles } from "@/core/greenfield/generatedSourceHardening";
import { isFallbackSkeletonAppContent } from "@/core/greenfield/fallbackSkeleton";
import { validateDomainConsistency } from "@/core/greenfield/domainConsistency";
import { repairLegacyFieldFlowTypesInProject, repairMissingTypeExports } from "@/core/greenfield/typesExportRepair";
import { reconcileIntegrationFromManifest } from "@/core/greenfield/integrationReconcile";
import type {
  GreenfieldGenerateResult,
  GreenfieldProjectFile,
} from "@/core/greenfield/types";

export interface MultiPhasePhaseResult {
  readonly phase: string;
  readonly ok: boolean;
  readonly paths: readonly string[];
  readonly missing: readonly string[];
}

function responseRawText(
  res: (Pick<GreenfieldGenerateResult, "rawText"> & { text?: string }) | null | undefined,
): string {
  const raw = res?.rawText?.trim();
  if (raw) return raw;
  return res?.text?.trim() ?? "";
}

async function invokeRaw(
  host: GreenfieldGenerateReliabilityHost,
  prompt: string,
  purpose: "primary" | "retry" | "repair" = "primary",
): Promise<GreenfieldGenerateResult | null> {
  if (!host.invokeGreenfieldRawCall) {
    return host.api.greenfieldGenerateRaw
      ? (host.api.greenfieldGenerateRaw(
          host.settings.provider,
          prompt,
        ) as Promise<GreenfieldGenerateResult>)
      : null;
  }
  const ipc = await host.invokeGreenfieldRawCall(
    host.settings,
    estimateTokens(prompt),
    (provider: ProviderId) =>
      host.api.greenfieldGenerateRaw!(provider, prompt) as Promise<
        GreenfieldGenerateResult & StageProviderResult
      >,
    prompt,
    purpose,
  );
  if (ipc) return ipc as GreenfieldGenerateResult;
  const stopReason = host.providerStopReasonRef?.current;
  if (stopReason) {
    return {
      ok: false,
      provider: host.settings.provider,
      model: modelForProvider(host.settings, host.settings.provider),
      latencyMs: 0,
      error: stopReason,
      generationMode: "multi-phase",
    };
  }
  return null;
}

function failResult(
  settings: ProviderSettings,
  startedAt: number,
  error: string,
  extras?: Partial<GreenfieldGenerateResult>,
): GreenfieldGenerateResult {
  const provider = settings.provider;
  return {
    ok: false,
    provider,
    model: modelForProvider(settings, provider),
    latencyMs: Date.now() - startedAt,
    error,
    generationMode: "multi-phase",
    exactFailureStage: "multi-phase",
    exactProviderError: error,
    providerRequestSent: extras?.providerRequestSent ?? true,
    ...extras,
  };
}

async function retryMissingPaths(
  host: GreenfieldGenerateReliabilityHost,
  phase: string,
  missing: readonly string[],
  existing: readonly GreenfieldProjectFile[],
  userPrompt: string,
  last: GreenfieldGenerateResult | null,
): Promise<{
  merged: GreenfieldProjectFile[];
  last: GreenfieldGenerateResult | null;
  stillMissing: string[];
}> {
  let merged = [...existing];
  let currentLast = last;
  const stillMissing = [...missing];

  for (const retryPath of missing) {
    if (!host.canMakeAiCall) break;
    const gate = host.canMakeAiCall("retry");
    if (!gate.ok) break;

    logGreenfieldRetry({
      reason: `multi_phase_${phase}_file_retry`,
      attempt: 1,
      missingFiles: [retryPath] as never[],
    });
    const retryPrompt = buildSingleFileRetryPrompt(
      userPrompt,
      retryPath,
      merged,
      `Missing or incomplete: ${retryPath}`,
    );
    const retryResult = await invokeRaw(host, retryPrompt, "retry");
    const retryRaw = responseRawText(retryResult);
    if (!retryRaw) continue;
    currentLast = retryResult;
    const retryParsed = parseTargetFilesFromResponse(retryRaw, [retryPath]);
    merged = mergeProjectFiles(merged, retryParsed.files);
    const idx = stillMissing.indexOf(retryPath);
    if (idx >= 0 && retryParsed.missing.length === 0) {
      stillMissing.splice(idx, 1);
    }
  }

  return { merged, last: currentLast, stillMissing };
}

function applyProjectHardening(
  manifest: ReturnType<typeof planManifestFromPrompt>,
  files: readonly GreenfieldProjectFile[],
  warnings: string[],
): GreenfieldProjectFile[] {
  const hardened = hardenGreenfieldProjectFiles(files, manifest);
  for (const fix of hardened.fixes) {
    warnings.push(`Generation hardening: ${fix}`);
  }
  return [...hardened.files];
}

async function runPhase(
  host: GreenfieldGenerateReliabilityHost,
  phase: string,
  prompt: string,
  expectedPaths: readonly string[],
  existing: readonly GreenfieldProjectFile[],
  userPrompt: string,
  purpose: "primary" | "retry" = "primary",
  opts?: { readonly enablePerFileRetry?: boolean },
): Promise<{
  merged: GreenfieldProjectFile[];
  result: MultiPhasePhaseResult;
  last: GreenfieldGenerateResult | null;
}> {
  logGreenfieldRequest({
    provider: host.settings.provider,
    model: modelForProvider(host.settings, host.settings.provider),
    attempt: 0,
    promptChars: prompt.length,
  });

  let last = await invokeRaw(host, prompt, purpose);
  const rawText = responseRawText(last);
  if (!rawText) {
    return {
      merged: [...existing],
      result: { phase, ok: false, paths: [], missing: [...expectedPaths] },
      last,
    };
  }

  let parsed = parseTargetFilesFromResponse(rawText, expectedPaths);
  let merged = mergeProjectFiles(existing, parsed.files);
  let stillMissing = [...parsed.missing];

  if (
    stillMissing.length > 0 &&
    purpose === "primary" &&
    opts?.enablePerFileRetry !== false &&
    host.canMakeAiCall
  ) {
    const retried = await retryMissingPaths(
      host,
      phase,
      stillMissing,
      merged,
      userPrompt,
      last,
    );
    merged = retried.merged;
    last = retried.last ?? last;
    stillMissing = retried.stillMissing;
  }

  return {
    merged,
    result: {
      phase,
      ok: stillMissing.length === 0,
      paths: expectedPaths.filter((p) => merged.some((f) => f.path === p && f.content.trim())),
      missing: stillMissing,
    },
    last,
  };
}

export async function runMultiPhaseGreenfieldGenerate(
  host: GreenfieldGenerateReliabilityHost,
  userPrompt: string,
): Promise<GreenfieldGenerateResult> {
  const startedAt = Date.now();
  const settings = host.settings;
  const provider = settings.provider;
  const model = modelForProvider(settings, provider);
  const route = classifyGreenfieldGenerationRoute(userPrompt);
  const manifest = planManifestFromPrompt(userPrompt);
  const warnings: string[] = [
    `Multi-phase greenfield (score=${route.score}: ${route.reasons.join(", ")})`,
    `Manifest: ${manifest.pages.length} pages, ${manifest.sharedPaths.length} shared files`,
  ];
  const phaseResults: MultiPhasePhaseResult[] = [];

  host.resetAiCallBudget?.();
  host.prepareMultiPhaseGreenfieldBudget?.(manifest.pages.length) ??
    host.prepareGreenfieldBudget?.();

  let projectFiles: GreenfieldProjectFile[] = buildBootstrapFiles(manifest);
  let lastResult: GreenfieldGenerateResult | null = null;

  const sharedPhase = await runPhase(
    host,
    "shared",
    buildSharedPhasePrompt(userPrompt, manifest, projectFiles),
    manifest.sharedPaths,
    projectFiles,
    userPrompt,
    "primary",
    { enablePerFileRetry: false },
  );
  projectFiles = applyProjectHardening(manifest, sharedPhase.merged, warnings);
  lastResult = sharedPhase.last;
  phaseResults.push(sharedPhase.result);
  if (!sharedPhase.result.ok) {
    warnings.push(
      `Shared phase incomplete: missing ${sharedPhase.result.missing.join(", ")}`,
    );
  }

  const pageBatches = splitPagesIntoBatches(manifest.pages);
  for (let batchIdx = 0; batchIdx < pageBatches.length; batchIdx++) {
    const batch = pageBatches[batchIdx]!;
    const batchManifest = manifestSliceForBatch(manifest, batch);
    const phaseName = `pages-${batchIdx + 1}`;
    const pagesPhase = await runPhase(
      host,
      phaseName,
      buildPagesBatchPhasePrompt(
        userPrompt,
        batchManifest,
        manifest,
        projectFiles,
        batchIdx + 1,
        pageBatches.length,
      ),
      batchManifest.pagePaths,
      projectFiles,
      userPrompt,
      "primary",
      { enablePerFileRetry: true },
    );
    projectFiles = applyProjectHardening(manifest, pagesPhase.merged, warnings);
    lastResult = pagesPhase.last ?? lastResult;
    phaseResults.push(pagesPhase.result);
    if (!pagesPhase.result.ok) {
      warnings.push(
        `${phaseName} incomplete: missing ${pagesPhase.result.missing.join(", ")}`,
      );
    }
  }

  const missingAfterBatches = manifest.pagePaths.filter(
    (p) => !projectFiles.some((f) => f.path === p && f.content.trim()),
  );
  if (missingAfterBatches.length > 0 && host.canMakeAiCall) {
    const gate = host.canMakeAiCall("retry");
    if (gate.ok) {
      const retried = await retryMissingPaths(
        host,
        "pages-final",
        missingAfterBatches,
        projectFiles,
        userPrompt,
        lastResult,
      );
      projectFiles = retried.merged;
      lastResult = retried.last ?? lastResult;
      if (retried.stillMissing.length > 0) {
        warnings.push(
          `Pages still missing after retries: ${retried.stillMissing.join(", ")}`,
        );
      }
    }
  }

  const stubFill = fillMissingPageStubs(manifest, projectFiles);
  projectFiles = applyProjectHardening(manifest, stubFill.files, warnings);
  if (stubFill.stubbedPaths.length > 0) {
    warnings.push(`Stub pages generated: ${stubFill.stubbedPaths.join(", ")}`);
    const pagesIdx = phaseResults.findIndex((p) => p.phase.startsWith("pages"));
    if (pagesIdx >= 0) {
      phaseResults[pagesIdx] = {
        phase: "pages",
        ok: true,
        paths: manifest.pagePaths.filter((p) =>
          projectFiles.some((f) => f.path === p && f.content.trim()),
        ),
        missing: [],
      };
    }
  }

  const appPhase = await runPhase(
    host,
    "app",
    buildAppIntegrationPrompt(userPrompt, manifest, projectFiles),
    [manifest.integrationPath],
    projectFiles,
    userPrompt,
  );
  projectFiles = applyProjectHardening(manifest, appPhase.merged, warnings);
  lastResult = appPhase.last ?? lastResult;
  phaseResults.push(appPhase.result);

  const appFileIdx = projectFiles.findIndex((f) => f.path === "src/App.tsx");
  if (appFileIdx >= 0 && projectFiles[appFileIdx]!.content.trim()) {
    const sanitized = sanitizeAppIntegration(projectFiles[appFileIdx]!.content);
    if (sanitized !== projectFiles[appFileIdx]!.content) {
      projectFiles = mergeProjectFiles(projectFiles, [{ path: "src/App.tsx", content: sanitized }]);
      warnings.push("Sanitized App.tsx (removed nested BrowserRouter / fixed Layout import)");
    }
  }

  const appPhaseBlocked = !responseRawText(appPhase.last);
  const appFileBeforeStub = projectFiles.find((f) => f.path === "src/App.tsx");
  const appMissing = !appFileBeforeStub?.content.trim();
  if ((appPhaseBlocked || appMissing) && manifest.useRouter) {
    const stubApp = buildDeterministicAppFromManifest(manifest, projectFiles);
    projectFiles = mergeProjectFiles(projectFiles, [stubApp]);
    warnings.push("Deterministic App.tsx generated (app phase skipped, failed, or incomplete)");
    const appIdx = phaseResults.findIndex((p) => p.phase === "app");
    if (appIdx >= 0) {
      phaseResults[appIdx] = {
        phase: "app",
        ok: true,
        paths: ["src/App.tsx"],
        missing: [],
      };
    }
  }

  const missingCore = missingCorePaths(projectFiles);
  const appFile = projectFiles.find((f) => f.path === "src/App.tsx");
  const appIsScaffold =
    !appFile?.content.trim() ||
    isFallbackSkeletonAppContent(appFile.content) ||
    !/Routes|Route|Layout/i.test(appFile.content);

  const missingPagePaths = manifest.pagePaths.filter(
    (p) => !projectFiles.some((f) => f.path === p && f.content.trim()),
  );
  const phasesIncomplete = phaseResults.some((p) => !p.ok);
  const failed =
    missingCore.length > 0 ||
    appIsScaffold ||
    missingPagePaths.length > 0;
  const usedStubPages = stubFill.stubbedPaths.length > 0;
  const usedDeterministicApp = warnings.some((w) => w.includes("Deterministic App.tsx"));
  if (phasesIncomplete && !failed) {
    warnings.push("One or more phases returned incomplete file sets (recovered via stubs).");
  }

  projectFiles = reconcileIntegrationFromManifest(manifest, projectFiles, warnings);

  projectFiles = applyProjectHardening(manifest, projectFiles, warnings);

  const typeExportRepair = repairMissingTypeExports(projectFiles);
  if (typeExportRepair.repaired.length > 0) {
    projectFiles = typeExportRepair.files;
    warnings.push(
      `Auto-patched missing types.ts exports: ${typeExportRepair.repaired.join(", ")}`,
    );
  }

  const legacyTypeStrip = repairLegacyFieldFlowTypesInProject(projectFiles, manifest);
  if (legacyTypeStrip.removed.length > 0) {
    projectFiles = legacyTypeStrip.files;
    warnings.push(
      `Removed legacy FieldFlow types from types.ts: ${legacyTypeStrip.removed.join(", ")}`,
    );
  }

  const domainCheck = validateDomainConsistency(manifest, projectFiles);
  if (!domainCheck.ok) {
    const domainError = domainCheck.errors.join(" ");
    warnings.push(`Domain consistency failed: ${domainError}`);
    logGreenfieldFailed({
      provider,
      model,
      reason: domainError,
      durationMs: Date.now() - startedAt,
    });
    return failResult(settings, startedAt, domainError, {
      projectFiles,
      files: coreFilesFromProject(projectFiles),
      warnings,
      partialSuccess: false,
      appShellIncomplete: true,
      generationMode: "multi-phase",
      manifestPages: manifest.pages.map((p) => p.title),
      ...(usedStubPages ? { stubbedPagePaths: stubFill.stubbedPaths } : {}),
      ...(lastResult?.rawText ? { rawText: lastResult.rawText } : {}),
      ...(lastResult?.metrics ? { metrics: lastResult.metrics } : {}),
    });
  }

  if (failed) {
    const error = [
      missingCore.length > 0 ? `Missing core files: ${missingCore.join(", ")}` : null,
      appIsScaffold ? "App.tsx missing or placeholder — multi-phase generation incomplete." : null,
      missingPagePaths.length > 0
        ? `Missing page files: ${missingPagePaths.join(", ")}`
        : null,
      phasesIncomplete ? "One or more phases returned incomplete file sets." : null,
    ]
      .filter(Boolean)
      .join(" ");

    logGreenfieldFailed({
      provider,
      model,
      reason: error,
      durationMs: Date.now() - startedAt,
    });

    return failResult(settings, startedAt, error, {
      projectFiles,
      files: coreFilesFromProject(projectFiles),
      warnings,
      partialSuccess: projectFiles.length > 0,
      appShellIncomplete: true,
      generationMode: "multi-phase",
      manifestPages: manifest.pages.map((p) => p.title),
      ...(usedStubPages ? { stubbedPagePaths: stubFill.stubbedPaths } : {}),
      ...(lastResult?.rawText ? { rawText: lastResult.rawText } : {}),
      ...(lastResult?.metrics ? { metrics: lastResult.metrics } : {}),
    });
  }

  logGreenfieldSuccess({
    provider,
    model,
    fileCount: projectFiles.length,
    durationMs: Date.now() - startedAt,
  });

  const coreFiles = coreFilesFromProject(projectFiles);

  return {
    ok: true,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    files: coreFiles,
    projectFiles,
    generationMode: "multi-phase",
    manifestPages: manifest.pages.map((p) => p.title),
    warnings,
    partialSuccess: usedStubPages || usedDeterministicApp,
    providerRequestSent: true,
    appShellIncomplete: false,
    ...(usedStubPages ? { stubbedPagePaths: stubFill.stubbedPaths } : {}),
    ...(lastResult?.rawText ? { rawText: lastResult.rawText } : {}),
    ...(lastResult?.metrics ? { metrics: lastResult.metrics } : {}),
  };
}

export { allManifestPaths, planManifestFromPrompt };
