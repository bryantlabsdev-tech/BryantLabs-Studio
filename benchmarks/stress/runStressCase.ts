import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classifyGreenfieldGenerationRoute } from "@/core/greenfield/greenfieldRouter";
import { planManifestFromPrompt } from "@/core/greenfield/manifestPlanner";
import { runMultiPhaseGreenfieldGenerate } from "@/core/greenfield/multiPhasePipeline";
import { evaluateStaticGreenfieldUiGate } from "@/core/greenfield/staticUiSignals";
import { estimateTokens } from "@/core/providers/requestSize";
import { classifyStressFailure } from "./failureClassification";
import {
  buildImprovementSuggestions,
  summarizeFixNeeded,
} from "./improvementSuggestions";
import { applyDeterministicRepairsOnProject, parseDiagnosticsFromOutput } from "./applyProjectRepairs";
import type { StressPromptDefinition } from "./prompts";
import type {
  StressFinalStatus,
  StressGateResult,
  StressRepairAttempt,
  StressRunMetrics,
} from "./types";
import { verifyProjectAt, runShellCommand } from "./verifyProject";
import { runtimeSmokeFromProjectFiles } from "@/core/greenfield/runtimeSmokeVerification";

export interface StressRunOptions {
  readonly mode: "dry-run" | "live";
  readonly outputRoot: string;
  readonly provider: string;
  readonly model: string;
  readonly generationTimeoutMs?: number;
  readonly host?: GreenfieldStressHost;
}

export interface GreenfieldStressHost {
  readonly settings: import("@/core/providers/types").ProviderSettings;
  readonly api: {
    greenfieldGenerateRaw: (
      provider: import("@/core/providers/types").ProviderId,
      prompt: string,
    ) => Promise<{
      ok: boolean;
      text?: string;
      rawText?: string;
      error?: string;
      model?: string;
      latencyMs?: number;
    }>;
  };
}

function gate(ok: boolean, ran: boolean): StressGateResult {
  if (!ran) return "not_run";
  return ok ? "passed" : "failed";
}

export function runDryStressChecks(prompt: StressPromptDefinition): {
  ok: boolean;
  routeMode: string;
  pageCount: number;
  appName: string;
  useRouter: boolean;
} {
  const route = classifyGreenfieldGenerationRoute(prompt.prompt);
  const manifest = planManifestFromPrompt(prompt.prompt);
  const hay = `${manifest.appName} ${manifest.pages.map((p) => p.title).join(" ")}`.toLowerCase();
  const keywordHit = prompt.expectedKeywords.some((k) => hay.includes(k.toLowerCase()));
  const ok =
    route.mode === "multi-phase" &&
    manifest.pages.length >= prompt.minPages &&
    manifest.useRouter &&
    keywordHit;
  return {
    ok,
    routeMode: route.mode,
    pageCount: manifest.pages.length,
    appName: manifest.appName,
    useRouter: manifest.useRouter,
  };
}

async function writeGeneratedFiles(
  root: string,
  files: readonly { path: string; content: string }[],
): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const file of files) {
    const abs = join(root, file.path);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, file.content, "utf8");
  }
}

function estimateRepairPromptTokens(targetFile: string, errors: string, typeDefs: string): number {
  const compactPrompt = [
    "greenfield repair",
    targetFile,
    errors,
    typeDefs,
    "(target file content omitted from estimate)",
  ].join("\n");
  return estimateTokens(compactPrompt) + estimateTokens(targetFile) * 8;
}

export async function runStressCase(
  prompt: StressPromptDefinition,
  opts: StressRunOptions,
): Promise<StressRunMetrics> {
  const started = performance.now();
  const targetFolder = join(opts.outputRoot, prompt.id);
  const repairAttempts: StressRepairAttempt[] = [];

  if (opts.mode === "dry-run") {
    const dry = runDryStressChecks(prompt);
    const durationMs = Math.round(performance.now() - started);
    const finalStatus: StressFinalStatus = dry.ok ? "success" : "failed";
    const failureClass = dry.ok
      ? null
      : classifyStressFailure({
          generationOk: false,
          installOk: true,
          typecheckOk: true,
          buildOk: true,
          uiAuditOk: true,
          timedOut: false,
          repairExhausted: false,
          diagnostics: [],
          buildOutput: "",
          generationError: `Dry-run failed: route=${dry.routeMode} pages=${dry.pageCount}`,
          missingFiles: [],
          uiAuditIssues: [],
        });
    const suggestions = failureClass
      ? buildImprovementSuggestions({
          failureClass,
          diagnostics: [],
          repairExhausted: false,
          deterministicPasses: 0,
          primaryErrorLine: `Manifest/route check failed for ${prompt.name}`,
          llmAttempts: 0,
        })
      : [];

    return {
      promptId: prompt.id,
      promptName: prompt.name,
      targetFolder,
      provider: opts.provider,
      model: opts.model,
      durationMs,
      filesGenerated: 0,
      typescript: "not_run",
      build: "not_run",
      preview: "not_run",
      uiAudit: "not_run",
      runtimeSmoke: "not_run",
      runtimeSmokeDetails: null,
      repairAttempts,
      repairTokenUsage: {
        deterministicPasses: 0,
        llmAttempts: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
      },
      repairFailureReason: dry.ok ? null : `Dry-run: ${dry.pageCount} pages, route ${dry.routeMode}`,
      failureClass,
      finalStatus,
      primaryErrorLine: dry.ok ? null : `Expected multi-phase SaaS manifest for ${prompt.appName}`,
      suggestions,
      fixNeeded: failureClass ? summarizeFixNeeded(suggestions, failureClass) : null,
    };
  }

  if (!opts.host) {
    throw new Error("Live stress mode requires a generation host.");
  }

  const maxTokens = /2\.5-pro|thinking/i.test(opts.model) ? 16384 : 8192;
  void maxTokens;
  const genHost = {
    settings: opts.host.settings,
    api: opts.host.api,
    providerStopReasonRef: { current: null as string | null },
    prepareGreenfieldBudget: () => {},
    prepareMultiPhaseGreenfieldBudget: () => {},
    resetAiCallBudget: () => {},
    invokeGreenfieldRawCall: async (
      _settings: typeof opts.host.settings,
      _tokens: number,
      call: (provider: import("@/core/providers/types").ProviderId) => Promise<unknown>,
    ) => call(opts.host!.settings.provider),
  };

  let generationOk = false;
  let filesGenerated = 0;
  let generationError: string | null = null;
  let timedOut = false;

  try {
    const result = await runMultiPhaseGreenfieldGenerate(genHost, prompt.prompt);
    const files = result.projectFiles ?? result.files ?? [];
    filesGenerated = files.length;
    generationOk = Boolean(result.ok && files.length > 0);
    generationError = result.error ?? null;
    if (generationOk) {
      await writeGeneratedFiles(targetFolder, files);
    }
  } catch (err) {
    generationError = err instanceof Error ? err.message : String(err);
    if (/timeout/i.test(generationError)) timedOut = true;
  }

  if (!generationOk) {
    const durationMs = Math.round(performance.now() - started);
    const failureClass = classifyStressFailure({
      generationOk: false,
      installOk: false,
      typecheckOk: false,
      buildOk: false,
      uiAuditOk: false,
      timedOut,
      repairExhausted: false,
      diagnostics: [],
      buildOutput: "",
      generationError,
      missingFiles: [],
      uiAuditIssues: [],
    });
    const suggestions = buildImprovementSuggestions({
      failureClass,
      diagnostics: [],
      repairExhausted: false,
      deterministicPasses: 0,
      primaryErrorLine: generationError,
      llmAttempts: 0,
    });
    return {
      promptId: prompt.id,
      promptName: prompt.name,
      targetFolder,
      provider: opts.provider,
      model: opts.model,
      durationMs,
      filesGenerated,
      typescript: "not_run",
      build: "not_run",
      preview: "skipped",
      uiAudit: "not_run",
      runtimeSmoke: "not_run",
      runtimeSmokeDetails: null,
      repairAttempts,
      repairTokenUsage: {
        deterministicPasses: 0,
        llmAttempts: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
      },
      repairFailureReason: generationError,
      failureClass,
      finalStatus: timedOut ? "timeout" : "failed",
      primaryErrorLine: generationError,
      suggestions,
      fixNeeded: summarizeFixNeeded(suggestions, failureClass),
    };
  }

  const verification = await verifyProjectAt(targetFolder);
  let typecheckOk = verification.typecheckOk;
  let repairFailureReason: string | null = null;

  if (!typecheckOk) {
    const repair = await applyDeterministicRepairsOnProject(targetFolder);
    repairAttempts.push(...repair.attempts);
    typecheckOk = repair.typecheckOk;
    if (!typecheckOk) {
      repairFailureReason = repair.stderr.split("\n").find((l) => /error TS/.test(l)) ?? repair.stderr.slice(0, 500);
      const primaryFile = repairAttempts.at(-1)?.targetPath ?? "src/App.tsx";
      const estInput = estimateRepairPromptTokens(
        primaryFile,
        repair.stderr,
        "// related types",
      );
      repairAttempts.push({
        attempt: repairAttempts.length + 1,
        kind: "llm",
        targetPath: primaryFile,
        outcome: "skipped",
        detail: "LLM repair not invoked by stress harness (deterministic exhausted)",
        estimatedInputTokens: estInput,
        estimatedOutputTokens: 8192,
      });
    }
  }

  let buildOk = false;
  if (typecheckOk) {
    const build = await runShellCommand("npm run build", targetFolder);
    buildOk = build.exitCode === 0 && !build.timedOut;
  }

  let runtimeSmokeOk = false;
  let runtimeSmokeDetails: import("./types").RuntimeSmokeSummary | null = null;
  if (buildOk) {
    const diskFiles = await loadProjectFilesFromDisk(targetFolder);
    const smoke = runtimeSmokeFromProjectFiles(diskFiles, { prompt: prompt.prompt });
    runtimeSmokeOk = smoke.ok;
    runtimeSmokeDetails = {
      ok: smoke.ok,
      overallStatus: smoke.overallStatus,
      appType: smoke.appType,
      failedChecks: smoke.checks
        .filter((c) => c.status === "failed")
        .map((c) => `${c.label}: ${c.detail}`),
      advisoryChecks: smoke.checks
        .filter((c) => c.status === "advisory")
        .map((c) => `${c.label}: ${c.detail}`),
    };
    if (!runtimeSmokeOk && !repairFailureReason) {
      repairFailureReason = runtimeSmokeDetails.failedChecks.join("; ");
    }
  }

  const appSource = await readOptional(join(targetFolder, "src/App.tsx"));
  const cssSource = await readOptional(join(targetFolder, "src/index.css"));
  const staticUi = evaluateStaticGreenfieldUiGate(appSource, cssSource);
  const uiAuditOk = staticUi.ok;

  const diagnostics = parseDiagnosticsFromOutput(
    verification.typecheck.stdout,
    verification.typecheck.stderr,
  );
  const repairExhausted = !typecheckOk && repairAttempts.length > 0;
  const failureClass =
    typecheckOk && buildOk && uiAuditOk && runtimeSmokeOk
      ? null
      : classifyStressFailure({
          generationOk: true,
          installOk: verification.installOk,
          typecheckOk,
          buildOk,
          uiAuditOk,
          timedOut: false,
          repairExhausted,
          diagnostics,
          buildOutput: `${verification.build.stdout}\n${verification.build.stderr}`,
          generationError: null,
          missingFiles: [],
          uiAuditIssues: staticUi.issues,
        });

  const llmAttempts = repairAttempts.filter((a) => a.kind === "llm").length;
  const deterministicPasses = repairAttempts.filter((a) => a.kind === "deterministic").length;
  const estimatedInputTokens = repairAttempts.reduce(
    (sum, a) => sum + (a.estimatedInputTokens ?? 0),
    0,
  );
  const estimatedOutputTokens = repairAttempts.reduce(
    (sum, a) => sum + (a.estimatedOutputTokens ?? 0),
    0,
  );

  const lineSnippets = await collectDiagnosticLineSnippets(
    targetFolder,
    diagnostics.slice(0, 8),
  );

  const suggestions = failureClass
    ? buildImprovementSuggestions({
        failureClass,
        diagnostics,
        repairExhausted,
        deterministicPasses,
        primaryErrorLine: repairFailureReason,
        llmAttempts,
        lineSnippets,
      })
    : [];

  const success =
    verification.installOk && typecheckOk && buildOk && uiAuditOk && runtimeSmokeOk;
  const durationMs = Math.round(performance.now() - started);

  return {
    promptId: prompt.id,
    promptName: prompt.name,
    targetFolder,
    provider: opts.provider,
    model: opts.model,
    durationMs,
    filesGenerated,
    typescript: gate(typecheckOk, true),
    build: gate(buildOk, verification.installOk),
    preview: "skipped",
    uiAudit: gate(uiAuditOk, true),
    runtimeSmoke: buildOk
      ? runtimeSmokeOk
        ? runtimeSmokeDetails?.overallStatus === "advisory"
          ? "advisory"
          : "passed"
        : "failed"
      : "not_run",
    runtimeSmokeDetails,
    repairAttempts,
    repairTokenUsage: {
      deterministicPasses,
      llmAttempts,
      estimatedInputTokens,
      estimatedOutputTokens,
    },
    repairFailureReason,
    failureClass,
    finalStatus: success ? "success" : "failed",
    primaryErrorLine: repairFailureReason,
    suggestions,
    fixNeeded: failureClass ? summarizeFixNeeded(suggestions, failureClass) : null,
  };
}

async function readOptional(abs: string): Promise<string | null> {
  try {
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

async function collectDiagnosticLineSnippets(
  projectRoot: string,
  diagnostics: readonly import("@/core/greenfield/tscDiagnostics").TypeScriptDiagnostic[],
): Promise<Record<string, string>> {
  const snippets: Record<string, string> = {};
  for (const d of diagnostics) {
    if (d.code !== "TS1109") continue;
    const rel = d.file.replace(/\\/g, "/");
    const key = `${rel}:${d.line}`;
    if (snippets[key]) continue;
    const content = await readOptional(join(projectRoot, rel));
    if (!content) continue;
    const line = content.split("\n")[d.line - 1];
    if (line != null) snippets[key] = line;
  }
  return snippets;
}

async function loadProjectFilesFromDisk(
  root: string,
): Promise<{ path: string; content: string }[]> {
  const { readdir } = await import("node:fs/promises");
  const out: { path: string; content: string }[] = [];
  async function walk(rel: string): Promise<void> {
    const abs = join(root, rel);
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(childRel);
        continue;
      }
      if (!/\.(tsx?|jsx?|html|json)$/.test(entry.name)) continue;
      const content = await readOptional(join(root, childRel));
      if (content != null) out.push({ path: childRel.replace(/\\/g, "/"), content });
    }
  }
  await walk("");
  return out;
}
