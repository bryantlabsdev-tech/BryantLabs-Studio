import {
  loadRawSettings,
  type ProviderId,
  type ProviderSettingsInput,
  type ProviderSettingsView,
} from "./settings.cjs";
import type { HealthResult, ProviderResponse } from "./types.cjs";
import * as anthropic from "./anthropic.cjs";
import * as gemini from "./gemini.cjs";
import * as groq from "./groq.cjs";
import * as ollama from "./ollama.cjs";
import * as openrouter from "./openrouter.cjs";
import { PROVIDER_TIMEOUT_MS, resolveApplyPlanPatchGenerateOpts } from "./timeouts.cjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPlanPrompt,
  buildPlanJsonRepairPrompt,
  buildPlanRetryPrompt,
  buildPlanSchemaRepairPrompt,
  parseAIPlan,
  PLAN_RETRY_TEMPERATURE,
  type AIPlan,
  type AIPlanTelemetry,
  type ParseAIPlanOutcome,
  type PlanContext,
} from "./aiPlan.cjs";
import {
  buildAutoFixPrompt,
  parseAutoFixResponse,
  type AutoFixContextPayload,
} from "./autoFix.cjs";
import {
  buildGreenfieldRepairProviderPrompt,
  parseGreenfieldRepairResponse,
} from "../greenfield/repair.cjs";
import { REPAIR_PARSE_ERROR } from "../greenfield/repairParse.cjs";
import {
  buildPatchPrompt,
  parsePatchResponse,
  type AIPatchProposal,
  type PlanPatchMeta,
  type PatchSymbol,
  type PatchTargetFile,
} from "./aiPatch.cjs";
import {
  buildApplyPlanBatchPatchPromptFromMeta,
  buildApplyPlanSingleFilePatchPrompt,
  parseApplyPlanBatchPatchResponse,
  type ApplyPlanBatchPatchMeta,
} from "./applyPlanPatch.cjs";
import { filterDirectRewriteFiles } from "./applyPlanPrompt.cjs";
import {
  APPLY_PLAN_PATCH_FORMAT_ERROR,
  normalizeApplyPlanPath,
  parseApplyPlanMarkedFiles,
} from "./markedFileParse.cjs";
import { isTruncatedHttpJsonBodyError } from "./httpJson.cjs";

/**
 * Provider dispatch (Phase 7). Routing is explicit and strict: a request for a
 * provider is handled by THAT provider or it fails — there is no automatic
 * fallback and no silent switching. The requested provider is always echoed
 * back in the response.
 */

export type {
  ProviderId,
  ProviderSettingsInput,
  ProviderSettingsView,
  HealthResult,
  ProviderResponse,
  AIPlan,
  PlanContext,
  AIPatchProposal,
  PatchSymbol,
  PatchTargetFile,
};

export {
  getSettingsView,
  loadRawSettings,
  saveSettings,
  sanitizeProviderSettingsInput,
  revealApiKey,
} from "./settings.cjs";
export { runAgentStep, type AgentStepResult } from "./agentStep.cjs";

import {
  buildAIPlanProviderDiagnostics,
  parseFailReasonFromProviderResponse,
  type AIPlanProviderDiagnostics,
} from "./planProviderDiagnostics.cjs";
import {
  resolvePlannerMaxOutputTokens,
  resolvePlannerRetryMaxOutputTokens,
} from "./plannerTokenBudget.cjs";
import { resolvePatchMaxOutputTokens } from "./economyTokenBudget.cjs";
import {
  isMockProviderEnabled,
  mockApplyPlanBatchPatch,
  mockHealth,
  mockRunPlan,
  mockTest,
} from "./mockProvider.cjs";

const IMPLS = { gemini, ollama, anthropic, groq, openrouter } as const;

export async function checkHealth(provider: ProviderId): Promise<HealthResult> {
  if (isMockProviderEnabled()) return mockHealth(provider);
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  if (!impl) {
    return {
      ok: false,
      provider,
      model: "",
      checks: [],
      error: `Unknown provider: ${provider}`,
    };
  }
  return impl.health(raw);
}

export async function runTest(
  provider: ProviderId,
  prompt: string,
): Promise<ProviderResponse> {
  if (isMockProviderEnabled()) return mockTest(provider, prompt);
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  if (!impl) {
    return {
      ok: false,
      provider,
      model: "",
      text: "",
      raw: null,
      latencyMs: 0,
      error: `Unknown provider: ${provider}`,
    };
  }
  return impl.test(raw, prompt);
}

export interface AIPlanAttemptRecord {
  rawText?: string;
  error?: string;
  parseError?: string;
  parseFailReason?: AIPlanTelemetry["parse_fail_reason"];
  latencyMs: number;
}

export interface AIPlanResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  plan?: AIPlan;
  raw: unknown;
  rawText?: string;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
  responseBody?: string;
  apiKeyPresent?: boolean;
  parseError?: string;
  parseFailReason?: AIPlanTelemetry["parse_fail_reason"];
  telemetry?: AIPlanTelemetry;
  providerDiagnostics?: AIPlanProviderDiagnostics;
  /** Earlier failed attempts in the auto-recovery pipeline. */
  priorAttempt?: AIPlanAttemptRecord;
  attemptHistory?: AIPlanAttemptRecord[];
}

function providerErrorFields(res: ProviderResponse): Pick<
  AIPlanResult,
  "error" | "httpStatus" | "responseBody" | "apiKeyPresent"
> {
  return {
    error: res.error ?? "Provider request failed.",
    ...(res.httpStatus != null ? { httpStatus: res.httpStatus } : {}),
    ...(res.responseBody ? { responseBody: res.responseBody } : {}),
    ...(res.apiKeyPresent != null ? { apiKeyPresent: res.apiKeyPresent } : {}),
  };
}

function recordAttempt(
  res: ProviderResponse,
  parsed: Extract<ParseAIPlanOutcome, { ok: false }>,
): AIPlanAttemptRecord {
  return {
    rawText: res.text,
    error: parsed.error,
    parseError: parsed.parseError,
    parseFailReason: parsed.parseFailReason,
    latencyMs: res.latencyMs,
  };
}

function emptyPlanTelemetry(): AIPlanTelemetry {
  return {
    parse_fail_reason: "no_json",
    truncation_detected: false,
    retry_success: false,
    retried: false,
    repair_attempted: false,
    repair_success: false,
  };
}

function planSuccess(
  res: ProviderResponse,
  plan: AIPlan,
  latencyMs: number,
  telemetry: AIPlanTelemetry,
): AIPlanResult {
  return {
    ok: true,
    provider: res.provider,
    model: res.model,
    plan,
    raw: res.raw,
    rawText: res.text,
    latencyMs,
    telemetry,
    providerDiagnostics: buildAIPlanProviderDiagnostics(res, telemetry),
  };
}

function planFailure(
  res: ProviderResponse,
  parsed: Extract<ParseAIPlanOutcome, { ok: false }>,
  latencyMs: number,
  telemetry: AIPlanTelemetry,
  attemptHistory: AIPlanAttemptRecord[],
): AIPlanResult {
  const priorAttempt = attemptHistory[0];
  return {
    ok: false,
    provider: res.provider,
    model: res.model,
    raw: res.raw,
    rawText: res.text,
    latencyMs,
    error: parsed.error,
    parseError: parsed.parseError,
    parseFailReason: parsed.parseFailReason,
    priorAttempt,
    attemptHistory: attemptHistory.length > 0 ? attemptHistory : undefined,
    telemetry,
    providerDiagnostics: buildAIPlanProviderDiagnostics(
      res,
      telemetry,
      parsed.parseFailReason,
    ),
  };
}

export async function runPlan(
  provider: ProviderId,
  userPrompt: string,
  context: PlanContext,
): Promise<AIPlanResult> {
  if (isMockProviderEnabled()) return mockRunPlan(provider, userPrompt, context) as AIPlanResult;
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  if (!impl) {
    return {
      ok: false,
      provider,
      model: "",
      raw: null,
      latencyMs: 0,
      error: `Unknown provider: ${provider}`,
      telemetry: emptyPlanTelemetry(),
    };
  }

  const runAttempt = async (
    prompt: string,
    maxTokens: number,
    temperature?: number,
  ): Promise<ProviderResponse> =>
    impl.generate(raw, prompt, maxTokens, {
      timeoutMs: PROVIDER_TIMEOUT_MS.generatePlan,
      operation: "plan",
      temperature,
    });

  const plannerMaxOutputTokens = resolvePlannerMaxOutputTokens(raw);
  const plannerRetryMaxOutputTokens = resolvePlannerRetryMaxOutputTokens(plannerMaxOutputTokens);

  const history: AIPlanAttemptRecord[] = [];
  let totalLatency = 0;
  let truncationDetected = false;
  let retried = false;
  let jsonRepairAttempted = false;
  let schemaRepairAttempted = false;
  let repairSuccess = false;

  const prompt = buildPlanPrompt(userPrompt, context);
  let res = await runAttempt(prompt, plannerMaxOutputTokens);
  totalLatency += res.latencyMs;

  if (!res.ok) {
    const telemetry = emptyPlanTelemetry();
    const parseFailReason = parseFailReasonFromProviderResponse(res);
    return {
      ok: false,
      provider: res.provider,
      model: res.model,
      raw: res.raw,
      rawText: res.text,
      latencyMs: totalLatency,
      ...providerErrorFields(res),
      parseFailReason,
      telemetry: { ...telemetry, parse_fail_reason: parseFailReason },
      providerDiagnostics: buildAIPlanProviderDiagnostics(res, telemetry, parseFailReason),
    };
  }

  let parsed = parseAIPlan(res.text);
  if (parsed.ok) {
    return planSuccess(res, parsed.plan, totalLatency, {
      parse_fail_reason: "none",
      truncation_detected: false,
      retry_success: false,
      retried: false,
      repair_attempted: false,
      repair_success: false,
    });
  }

  if (parsed.truncationDetected) {
    truncationDetected = true;
    history.push(recordAttempt(res, parsed));
    retried = true;

    const retryRes = await runAttempt(
      buildPlanRetryPrompt(userPrompt, context),
      plannerRetryMaxOutputTokens,
      PLAN_RETRY_TEMPERATURE,
    );
    totalLatency += retryRes.latencyMs;

    if (!retryRes.ok) {
      return {
        ok: false,
        provider: retryRes.provider,
        model: retryRes.model,
        raw: retryRes.raw,
        rawText: retryRes.text,
        latencyMs: totalLatency,
        ...providerErrorFields(retryRes),
        priorAttempt: history[0],
        attemptHistory: history,
        telemetry: {
          parse_fail_reason: "truncated",
          truncation_detected: true,
          retry_success: false,
          retried: true,
          repair_attempted: false,
          repair_success: false,
        },
        providerDiagnostics: buildAIPlanProviderDiagnostics(
          retryRes,
          {
            parse_fail_reason: "truncated",
            truncation_detected: true,
            retry_success: false,
            retried: true,
            repair_attempted: false,
            repair_success: false,
          },
          "truncated",
        ),
      };
    }

    res = retryRes;
    parsed = parseAIPlan(res.text);
    if (parsed.ok) {
      return planSuccess(res, parsed.plan, totalLatency, {
        parse_fail_reason: "none",
        truncation_detected: true,
        retry_success: true,
        retried: true,
        repair_attempted: false,
        repair_success: false,
      });
    }
  }

  if (
    !parsed.ok &&
    (parsed.parseFailReason === "no_json" || parsed.parseFailReason === "json_syntax") &&
    !jsonRepairAttempted
  ) {
    if (history.length === 0) {
      history.push(recordAttempt(res, parsed));
    } else if (history[history.length - 1]!.rawText !== res.text) {
      history.push(recordAttempt(res, parsed));
    }

    jsonRepairAttempted = true;
    const repairRes = await runAttempt(
      buildPlanJsonRepairPrompt(res.text),
      plannerRetryMaxOutputTokens,
      PLAN_RETRY_TEMPERATURE,
    );
    totalLatency += repairRes.latencyMs;

    if (repairRes.ok) {
      const repairParsed = parseAIPlan(repairRes.text);
      if (repairParsed.ok) {
        repairSuccess = true;
        return planSuccess(repairRes, repairParsed.plan, totalLatency, {
          parse_fail_reason: "none",
          truncation_detected: truncationDetected,
          retry_success: retried,
          retried,
          repair_attempted: true,
          repair_success: true,
        });
      }
      res = repairRes;
      parsed = repairParsed;
    } else {
      const repairTelemetry = {
        parse_fail_reason: parsed.parseFailReason,
        truncation_detected: truncationDetected,
        retry_success: false,
        retried,
        repair_attempted: true,
        repair_success: false,
      };
      return {
        ok: false,
        provider: repairRes.provider,
        model: repairRes.model,
        raw: repairRes.raw,
        rawText: repairRes.text,
        latencyMs: totalLatency,
        ...providerErrorFields(repairRes),
        priorAttempt: history[0],
        attemptHistory: history,
        telemetry: repairTelemetry,
        providerDiagnostics: buildAIPlanProviderDiagnostics(
          repairRes,
          repairTelemetry,
          parsed.parseFailReason,
        ),
      };
    }
  }

  if (
    !parsed.ok &&
    parsed.parseFailReason === "schema_validation" &&
    !schemaRepairAttempted
  ) {
    if (history.length === 0) {
      history.push(recordAttempt(res, parsed));
    } else if (history[history.length - 1]!.rawText !== res.text) {
      history.push(recordAttempt(res, parsed));
    }

    schemaRepairAttempted = true;
    const repairRes = await runAttempt(
      buildPlanSchemaRepairPrompt(res.text),
      plannerRetryMaxOutputTokens,
      PLAN_RETRY_TEMPERATURE,
    );
    totalLatency += repairRes.latencyMs;

    if (repairRes.ok) {
      const repairParsed = parseAIPlan(repairRes.text);
      if (repairParsed.ok) {
        repairSuccess = true;
        return planSuccess(repairRes, repairParsed.plan, totalLatency, {
          parse_fail_reason: "none",
          truncation_detected: truncationDetected,
          retry_success: retried,
          retried,
          repair_attempted: true,
          repair_success: true,
        });
      }
      res = repairRes;
      parsed = repairParsed;
    } else {
      const schemaRepairTelemetry = {
        parse_fail_reason: "schema_validation" as const,
        truncation_detected: truncationDetected,
        retry_success: false,
        retried,
        repair_attempted: true,
        repair_success: false,
      };
      return {
        ok: false,
        provider: repairRes.provider,
        model: repairRes.model,
        raw: repairRes.raw,
        rawText: repairRes.text,
        latencyMs: totalLatency,
        error: repairRes.error ?? "Schema repair request failed.",
        priorAttempt: history[0],
        attemptHistory: history,
        telemetry: schemaRepairTelemetry,
        providerDiagnostics: buildAIPlanProviderDiagnostics(
          repairRes,
          schemaRepairTelemetry,
          "schema_validation",
        ),
      };
    }
  }

  if (!parsed.ok) {
    if (history.length === 0) {
      history.push(recordAttempt(res, parsed));
    }
    return planFailure(
      res,
      parsed,
      totalLatency,
      {
        parse_fail_reason: parsed.parseFailReason,
        truncation_detected: truncationDetected || parsed.truncationDetected,
        retry_success: false,
        retried,
        repair_attempted: jsonRepairAttempted || schemaRepairAttempted,
        repair_success: repairSuccess,
      },
      history,
    );
  }

  throw new Error("Plan pipeline invariant violated.");
}

export interface AIPatchResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  targetPath: string;
  proposal?: AIPatchProposal;
  raw: unknown;
  rawText?: string;
  latencyMs: number;
  error?: string;
  errorCode?: string;
}

export interface ApplyPlanBatchPatchResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  raw: unknown;
  rawText?: string;
  latencyMs: number;
  error?: string;
  errorCode?: string;
  files?: Record<string, string>;
  missingPaths?: string[];
  repairAttempted?: boolean;
  directRewrite?: boolean;
  /** Last model text (for diagnostics when parse fails). */
  lastModelRawText?: string;
}

function proposalFromMarkedContent(newContent: string): AIPatchProposal {
  return {
    summary: "Apply Plan patch",
    newContent,
    reasoning: "",
    risks: [],
  };
}

export async function runPatch(
  provider: ProviderId,
  userPrompt: string,
  context: PlanContext,
  file: PatchTargetFile,
  symbols: PatchSymbol[],
  planMeta?: PlanPatchMeta,
): Promise<AIPatchResult> {
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  if (!impl) {
    return {
      ok: false,
      provider,
      model: "",
      targetPath: file.path,
      raw: null,
      latencyMs: 0,
      error: `Unknown provider: ${provider}`,
    };
  }

  const relPath = normalizeApplyPlanPath(file.path);
  const prompt = planMeta
    ? buildApplyPlanSingleFilePatchPrompt(
        userPrompt,
        context,
        file,
        symbols,
        planMeta,
      )
    : buildPatchPrompt(userPrompt, context, file, symbols);
  const res = await impl.generate(raw, prompt, 8192, {
    timeoutMs: PROVIDER_TIMEOUT_MS.generatePatchSmall,
    operation: "patch_small",
  });
  if (!res.ok) {
    return {
      ok: false,
      provider: res.provider,
      model: res.model,
      targetPath: file.path,
      raw: res.raw,
      rawText: res.text,
      latencyMs: res.latencyMs,
      error: res.error ?? "Provider request failed.",
    };
  }

  const marked = parseApplyPlanMarkedFiles(res.text, [relPath]);
  if (marked.ok) {
    const newContent = marked.files.get(relPath);
    if (newContent) {
      return {
        ok: true,
        provider: res.provider,
        model: res.model,
        targetPath: file.path,
        proposal: proposalFromMarkedContent(newContent),
        raw: res.raw,
        rawText: res.text,
        latencyMs: res.latencyMs,
      };
    }
  }

  const proposal = parsePatchResponse(res.text);
  if (!proposal) {
    return {
      ok: false,
      provider: res.provider,
      model: res.model,
      targetPath: file.path,
      raw: res.raw,
      rawText: res.text,
      latencyMs: res.latencyMs,
      error:
        marked.errorMessage ??
        "Could not find proposed file content in the AI response.",
      errorCode: marked.errorCode ?? APPLY_PLAN_PATCH_FORMAT_ERROR,
    };
  }

  return {
    ok: true,
    provider: res.provider,
    model: res.model,
    targetPath: file.path,
    proposal,
    raw: res.raw,
    rawText: res.text,
    latencyMs: res.latencyMs,
  };
}

export async function runApplyPlanBatchPatch(
  provider: ProviderId,
  userPrompt: string,
  context: PlanContext,
  files: readonly PatchTargetFile[],
  meta: ApplyPlanBatchPatchMeta,
): Promise<ApplyPlanBatchPatchResult> {
  try {
    const logPath = path.join(os.tmpdir(), "bryantlabs-patch-generate.log");
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} [patch:batch:enter] provider=${provider} files=${files?.length ?? 0} promptChars=${userPrompt?.length ?? 0}\n`,
    );
  } catch {
    /* ignore */
  }
  if (isMockProviderEnabled()) {
    return mockApplyPlanBatchPatch(provider, userPrompt, files, meta) as ApplyPlanBatchPatchResult;
  }
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  const hydratedFiles: PatchTargetFile[] = [];
  for (const f of files) {
    const rel = normalizeApplyPlanPath(f.path);
    if (f.content && f.content.length > 0) {
      hydratedFiles.push({ path: rel, content: f.content });
      continue;
    }
    if (f.absPath && typeof f.absPath === "string") {
      try {
        const content = fs.readFileSync(f.absPath, "utf8");
        hydratedFiles.push({ path: rel, content });
      } catch (err) {
        return {
          ok: false,
          provider,
          model: "",
          raw: null,
          latencyMs: 0,
          error: `Failed to read ${rel}: ${err instanceof Error ? err.message : String(err)}`,
          missingPaths: [rel],
        };
      }
      continue;
    }
    // Create targets intentionally have empty content.
    hydratedFiles.push({ path: rel, content: f.content ?? "" });
  }
  const batchFiles = meta.directRewrite
    ? filterDirectRewriteFiles(
        hydratedFiles.map((f) => ({ path: f.path, content: f.content })),
      ).map((f) => ({ path: f.path, content: f.content }))
    : [...hydratedFiles];
  const targetPaths = batchFiles.map((f) => normalizeApplyPlanPath(f.path));

  if (!impl) {
    return {
      ok: false,
      provider,
      model: "",
      raw: null,
      latencyMs: 0,
      error: `Unknown provider: ${provider}`,
      missingPaths: targetPaths,
    };
  }

  if (batchFiles.length === 0) {
    return {
      ok: false,
      provider,
      model: "",
      raw: null,
      latencyMs: 0,
      error: "No files to patch.",
      missingPaths: [],
    };
  }

  let totalLatency = 0;
  let repairAttempted = false;

  const patchLog = (msg: string) => {
    console.log(msg);
    try {
      const logPath = path.join(os.tmpdir(), "bryantlabs-patch-generate.log");
      fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
    } catch {
      /* best-effort diagnostics */
    }
  };

  patchLog(
    `[patch:batch:start] ${JSON.stringify({
      provider,
      fileCount: batchFiles.length,
      paths: targetPaths.slice(0, 20),
      promptChars: userPrompt.length,
      directRewrite: Boolean(meta.directRewrite),
    })}`,
  );

  async function generateOnce(opts: {
    mode: "standard" | "repair" | "directRewrite";
    previousModelOutput?: string;
    repairMissingPaths?: readonly string[];
    files?: readonly PatchTargetFile[];
  }): Promise<ApplyPlanBatchPatchResult> {
    const activeFiles = opts.files ?? batchFiles;
    const activePaths = activeFiles.map((f) => normalizeApplyPlanPath(f.path));
    const buildPrompt = (slim: boolean) =>
      buildApplyPlanBatchPatchPromptFromMeta(
        userPrompt,
        context,
        activeFiles,
        {
          ...meta,
          targetPaths: activePaths,
          slimContext: slim || Boolean(meta.slimContext),
          mode: opts.mode,
          directRewrite: opts.mode === "directRewrite",
          ...(opts.previousModelOutput
            ? { previousModelOutput: opts.previousModelOutput }
            : {}),
          ...(opts.repairMissingPaths && opts.repairMissingPaths.length > 0
            ? { repairMissingPaths: [...opts.repairMissingPaths] }
            : {}),
        },
      );
    let usedSlim = Boolean(meta.slimContext);
    patchLog(`[patch:prompt:build:start] slim=${usedSlim} files=${activeFiles.length}`);
    let prompt = buildPrompt(usedSlim);
    patchLog(`[patch:prompt:build:done] chars=${prompt.length}`);
    // Full-file rewrites of polished apps can be large; give single-file edits
    // the same headroom as multi-file batches so the closing @@END marker is not
    // truncated (which would yield zero parsed files / "no proposals").
    const maxOutputTokens = resolvePatchMaxOutputTokens(raw, activeFiles.length);
    const generateOpts = resolveApplyPlanPatchGenerateOpts(
      userPrompt,
      activeFiles.length,
    );
    patchLog(
      `[patch:generate:start] ${JSON.stringify({
        files: activeFiles.length,
        timeoutMs: generateOpts.timeoutMs,
        operation: generateOpts.operation,
        promptChars: prompt.length,
        maxOutputTokens,
        mode: opts.mode,
      })}`,
    );
    const generateStarted = Date.now();
    const watchdogMs = Math.min(generateOpts.timeoutMs + 15_000, 195_000);
    let res: Awaited<ReturnType<NonNullable<typeof impl>["generate"]>>;
    try {
      res = await Promise.race([
        impl!.generate(raw, prompt, maxOutputTokens, generateOpts),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Patch generate watchdog fired after ${watchdogMs}ms (http timeout ${generateOpts.timeoutMs}ms).`,
              ),
            );
          }, watchdogMs);
        }),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patchLog(
        `[patch:generate:watchdog-or-throw] ${JSON.stringify({
          wallMs: Date.now() - generateStarted,
          message: message.slice(0, 300),
        })}`,
      );
      return {
        ok: false,
        provider,
        model: "",
        raw: null,
        latencyMs: Date.now() - generateStarted,
        error: message,
        missingPaths: activePaths,
      };
    }
    patchLog(
      `[patch:generate:done] ${JSON.stringify({
        ok: res.ok,
        latencyMs: res.latencyMs,
        wallMs: Date.now() - generateStarted,
        error: res.error ? String(res.error).slice(0, 200) : null,
      })}`,
    );
    totalLatency += res.latencyMs;
    const retrySlim = async (): Promise<boolean> => {
      if (usedSlim) return false;
      usedSlim = true;
      prompt = buildPrompt(true);
      const retry = await impl!.generate(raw, prompt, maxOutputTokens, generateOpts);
      totalLatency += retry.latencyMs;
      res = retry;
      return true;
    };
    if (!res.ok && isTruncatedHttpJsonBodyError(res.error)) {
      await retrySlim();
    }

    console.log(
      `[patch:metrics] ${JSON.stringify({
        ok: res.ok,
        provider: res.provider,
        model: res.model,
        mode: opts.mode,
        files: activeFiles.length,
        promptChars: prompt.length,
        promptByteLength: Buffer.byteLength(prompt, "utf8"),
        responseChars: res.text?.length ?? 0,
        maxOutputTokens,
        latencyMs: res.latencyMs,
        ...(res.error ? { error: res.error } : {}),
      })}`,
    );

    if (!res.ok) {
      return {
        ok: false,
        provider: res.provider,
        model: res.model,
        raw: res.raw,
        rawText: res.text,
        latencyMs: totalLatency,
        error: res.error ?? "Provider request failed.",
        missingPaths: activePaths,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
        lastModelRawText: res.text,
      };
    }

    let parsed = parseApplyPlanBatchPatchResponse(res.text ?? "", activePaths);
    if (
      res.ok &&
      !parsed.ok &&
      (await retrySlim()) &&
      res.ok
    ) {
      parsed = parseApplyPlanBatchPatchResponse(res.text ?? "", activePaths);
    }
    const partialOut: Record<string, string> = {};
    for (const p of activePaths) {
      const content = parsed.files.get(p);
      if (content) partialOut[p] = content;
    }
    const partialFiles =
      Object.keys(partialOut).length > 0 ? partialOut : undefined;

    console.log(
      `[patch:parse] ${JSON.stringify({
        ok: parsed.ok,
        expected: activePaths,
        parsedFiles: Object.keys(partialOut),
        missingPaths: parsed.missingPaths,
        ...(parsed.errorCode ? { errorCode: parsed.errorCode } : {}),
        ...(parsed.errorMessage ? { errorMessage: parsed.errorMessage } : {}),
      })}`,
    );

    if (parsed.ok) {
      return {
        ok: true,
        provider: res.provider,
        model: res.model,
        raw: res.raw,
        rawText: res.text,
        latencyMs: totalLatency,
        files: partialOut,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
      };
    }

    return {
      ok: false,
      provider: res.provider,
      model: res.model,
      raw: res.raw,
      rawText: res.text,
      latencyMs: totalLatency,
      error: parsed.errorMessage ?? "Could not parse Apply Plan patch response.",
      errorCode: parsed.errorCode ?? APPLY_PLAN_PATCH_FORMAT_ERROR,
      missingPaths: parsed.missingPaths,
      files: partialFiles,
      repairAttempted,
      directRewrite: Boolean(meta.directRewrite),
      lastModelRawText: res.text,
    };
  }

  async function generateSequentialPerFile(
    mode: "standard" | "repair" | "directRewrite",
  ): Promise<ApplyPlanBatchPatchResult> {
    const merged: Record<string, string> = {};
    let lastResult: ApplyPlanBatchPatchResult | null = null;
    let lastRaw: string | undefined;
    for (const file of batchFiles) {
      const res = await generateOnce({ mode, files: [file] });
      lastResult = res;
      lastRaw = res.lastModelRawText ?? res.rawText ?? lastRaw;
      if (res.files) Object.assign(merged, res.files);
      if (!res.ok) continue;
    }
    const mergedPaths = Object.keys(merged);
    if (mergedPaths.length === targetPaths.length && mergedPaths.length > 0) {
      return {
        ok: true,
        provider: lastResult!.provider,
        model: lastResult!.model,
        raw: lastResult!.raw,
        rawText: lastResult!.rawText,
        latencyMs: totalLatency,
        files: merged,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
      };
    }
    if (mergedPaths.length > 0) {
      const missingPaths = targetPaths.filter((p) => merged[p] === undefined);
      return {
        ok: false,
        provider: lastResult?.provider ?? provider,
        model: lastResult?.model ?? "",
        raw: lastResult?.raw ?? null,
        rawText: lastResult?.rawText,
        latencyMs: totalLatency,
        error: lastResult?.error ?? "Could not parse Apply Plan patch response.",
        errorCode: lastResult?.errorCode ?? APPLY_PLAN_PATCH_FORMAT_ERROR,
        missingPaths,
        files: merged,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
        lastModelRawText: lastRaw,
      };
    }
    const missingPaths = targetPaths.filter((p) => merged[p] === undefined);
    return {
      ok: false,
      provider: lastResult?.provider ?? provider,
      model: lastResult?.model ?? "",
      raw: lastResult?.raw ?? null,
      rawText: lastResult?.rawText,
      latencyMs: totalLatency,
      error: lastResult?.error ?? "Could not parse Apply Plan patch response.",
      errorCode: lastResult?.errorCode ?? APPLY_PLAN_PATCH_FORMAT_ERROR,
      missingPaths,
      ...(mergedPaths.length > 0 ? { files: merged } : {}),
      repairAttempted,
      directRewrite: Boolean(meta.directRewrite),
      lastModelRawText: lastRaw,
    };
  }

  const initialMode = meta.directRewrite ? "directRewrite" : "standard";
  const first =
    batchFiles.length > 1 && !meta.repair
      ? await generateSequentialPerFile(initialMode)
      : await generateOnce({ mode: initialMode });
  if (first.ok) return first;

  const lastRaw = first.lastModelRawText ?? first.rawText;
  const missingForRepair =
    first.missingPaths && first.missingPaths.length > 0
      ? [...first.missingPaths]
      : targetPaths.filter((p) => first.files?.[p] === undefined);
  const canRepair =
    !meta.directRewrite &&
    !meta.repair &&
    missingForRepair.length > 0 &&
    (first.errorCode === APPLY_PLAN_PATCH_FORMAT_ERROR ||
      first.errorCode === "MISSING_FILES" ||
      Boolean(first.files && Object.keys(first.files).length > 0));

  if (canRepair) {
    repairAttempted = true;
    const missingFiles = batchFiles.filter((f) =>
      missingForRepair.includes(normalizeApplyPlanPath(f.path)),
    );
    // Retry only the missing files. Do not feed a successful CSS (or other)
    // response back as "previous model output" — that confuses the repair pass
    // into skipping App.tsx.
    const second = await generateOnce({
      mode: "standard",
      files: missingFiles.length > 0 ? missingFiles : undefined,
      repairMissingPaths: missingForRepair,
    });
    const mergedFiles =
      first.files || second.files
        ? { ...first.files, ...second.files }
        : undefined;
    const mergedOk =
      Boolean(mergedFiles) &&
      targetPaths.every((p) => mergedFiles?.[p] !== undefined);
    const lastModelRawText =
      second.lastModelRawText ?? second.rawText ?? lastRaw;
    if (mergedOk && mergedFiles) {
      return {
        ...second,
        ok: true,
        repairAttempted: true,
        latencyMs: totalLatency,
        lastModelRawText,
        files: mergedFiles,
        missingPaths: undefined,
        error: undefined,
        errorCode: undefined,
      };
    }
    return {
      ...second,
      ok: false,
      repairAttempted: true,
      latencyMs: totalLatency,
      lastModelRawText,
      ...(mergedFiles ? { files: mergedFiles } : {}),
      missingPaths: targetPaths.filter((p) => mergedFiles?.[p] === undefined),
    };
  }

  return { ...first, lastModelRawText: lastRaw };
}

export async function runAutoFix(
  provider: ProviderId,
  context: AutoFixContextPayload,
  file: PatchTargetFile,
): Promise<AIPatchResult> {
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  if (!impl) {
    return {
      ok: false,
      provider,
      model: "",
      targetPath: file.path,
      raw: null,
      latencyMs: 0,
      error: `Unknown provider: ${provider}`,
    };
  }

  const prompt =
    context.planSource === "greenfield"
      ? buildGreenfieldRepairProviderPrompt(context, file)
      : buildAutoFixPrompt(context, file, context.intelligenceBlock);
  const maxOutputTokens =
    context.planSource === "greenfield"
      ? /2\.5-pro|thinking/i.test(raw.geminiModel ?? "")
        ? 16384
        : 8192
      : 4096;
  const res = await impl.generate(raw, prompt, maxOutputTokens, {
    timeoutMs: PROVIDER_TIMEOUT_MS.generateRepair,
    operation: "repair",
  });
  if (!res.ok) {
    return {
      ok: false,
      provider: res.provider,
      model: res.model,
      targetPath: file.path,
      raw: res.raw,
      rawText: res.text,
      latencyMs: res.latencyMs,
      error: res.error ?? "Provider request failed.",
    };
  }

  const greenfieldContent =
    context.planSource === "greenfield"
      ? parseGreenfieldRepairResponse(res.text, file.path, file.content)
      : null;
  const proposal =
    greenfieldContent != null
      ? {
          summary: "Greenfield compile repair",
          newContent: greenfieldContent,
          reasoning: "Fix TypeScript/build errors in generated app file.",
          risks: [],
        }
      : parseAutoFixResponse(res.text);
  if (!proposal) {
    return {
      ok: false,
      provider: res.provider,
      model: res.model,
      targetPath: file.path,
      raw: res.raw,
      rawText: res.text,
      latencyMs: res.latencyMs,
      error: REPAIR_PARSE_ERROR,
    };
  }

  return {
    ok: true,
    provider: res.provider,
    model: res.model,
    targetPath: file.path,
    proposal,
    raw: res.raw,
    rawText: res.text,
    latencyMs: res.latencyMs,
  };
}
