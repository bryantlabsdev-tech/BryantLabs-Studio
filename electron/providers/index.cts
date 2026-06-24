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
import { PROVIDER_TIMEOUT_MS } from "./timeouts.cjs";
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
  if (isMockProviderEnabled()) {
    return mockApplyPlanBatchPatch(provider, userPrompt, files, meta) as ApplyPlanBatchPatchResult;
  }
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  const batchFiles = meta.directRewrite
    ? filterDirectRewriteFiles(
        files.map((f) => ({ path: f.path, content: f.content })),
      ).map((f) => ({ path: f.path, content: f.content }))
    : [...files];
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

  async function generateOnce(opts: {
    mode: "standard" | "repair" | "directRewrite";
    previousModelOutput?: string;
    repairMissingPaths?: readonly string[];
  }): Promise<ApplyPlanBatchPatchResult> {
    const prompt = buildApplyPlanBatchPatchPromptFromMeta(
      userPrompt,
      context,
      batchFiles,
      {
        ...meta,
        targetPaths,
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
    const res = await impl!.generate(raw, prompt, 16384, {
      timeoutMs: PROVIDER_TIMEOUT_MS.generatePatch,
      operation: "patch",
    });
    totalLatency += res.latencyMs;

    if (!res.ok) {
      return {
        ok: false,
        provider: res.provider,
        model: res.model,
        raw: res.raw,
        rawText: res.text,
        latencyMs: totalLatency,
        error: res.error ?? "Provider request failed.",
        missingPaths: targetPaths,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
        lastModelRawText: res.text,
      };
    }

    const parsed = parseApplyPlanBatchPatchResponse(res.text, targetPaths);
    const partialOut: Record<string, string> = {};
    for (const p of targetPaths) {
      const content = parsed.files.get(p);
      if (content) partialOut[p] = content;
    }
    const partialFiles =
      Object.keys(partialOut).length > 0 ? partialOut : undefined;

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

  const initialMode = meta.directRewrite ? "directRewrite" : "standard";
  const first = await generateOnce({ mode: initialMode });
  if (first.ok) return first;

  const lastRaw = first.lastModelRawText ?? first.rawText;
  const canRepair =
    !meta.directRewrite &&
    !meta.repair &&
    Boolean(lastRaw?.trim()) &&
    (first.errorCode === APPLY_PLAN_PATCH_FORMAT_ERROR ||
      first.errorCode === "MISSING_FILES");

  if (canRepair) {
    repairAttempted = true;
    const missingForRepair =
      first.errorCode === "MISSING_FILES" && first.missingPaths?.length
        ? [...first.missingPaths]
        : targetPaths;
    const second = await generateOnce({
      mode: "repair",
      previousModelOutput: lastRaw,
      repairMissingPaths: missingForRepair,
    });
    const mergedFiles =
      first.files || second.files
        ? { ...first.files, ...second.files }
        : undefined;
    const lastModelRawText =
      second.lastModelRawText ?? second.rawText ?? lastRaw;
    return {
      ...second,
      repairAttempted: true,
      latencyMs: totalLatency,
      lastModelRawText,
      ...(mergedFiles ? { files: mergedFiles } : {}),
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
