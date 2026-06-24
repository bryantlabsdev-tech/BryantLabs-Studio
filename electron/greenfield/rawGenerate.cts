import {
  loadRawSettings,
  type ProviderId,
} from "../providers/settings.cjs";
import type { ProviderResponse } from "../providers/types.cjs";
import * as anthropic from "../providers/anthropic.cjs";
import * as gemini from "../providers/gemini.cjs";
import * as groq from "../providers/groq.cjs";
import * as ollama from "../providers/ollama.cjs";
import * as openrouter from "../providers/openrouter.cjs";
import {
  buildParseFailureDebug,
  buildProviderFailureDebug,
  type GreenfieldDebugReport,
} from "./debug.cjs";
import { PROVIDER_TIMEOUT_MS } from "../providers/timeouts.cjs";
import {
  buildGenerationMetrics,
  logGreenfieldMetrics,
  type GreenfieldGenerationMetrics,
} from "./metrics.cjs";
import {
  isMockProviderEnabled,
  mockGreenfieldGenerate,
} from "../providers/mockProvider.cjs";
import type { GreenfieldGenerateResult } from "./generate.cjs";

const IMPLS = { gemini, ollama, anthropic, groq, openrouter } as const;

/** Per-file / per-phase cap — smaller than monolithic seven-file generation. */
export const GREENFIELD_PHASE_MAX_OUTPUT_TOKENS = 8192;
const GREENFIELD_PHASE_MAX_OUTPUT_TOKENS_THINKING = 16384;

function resolveGreenfieldPhaseMaxOutputTokens(geminiModel: string | undefined): number {
  if (/2\.5-pro|thinking/i.test(geminiModel ?? "")) {
    return GREENFIELD_PHASE_MAX_OUTPUT_TOKENS_THINKING;
  }
  return GREENFIELD_PHASE_MAX_OUTPUT_TOKENS;
}

function attachMetricsToDebug(
  debug: GreenfieldDebugReport,
  metrics: GreenfieldGenerationMetrics,
): GreenfieldDebugReport {
  return { ...debug, metrics };
}

function providerFailureResult(
  startedAt: number,
  res: ProviderResponse,
  metrics: GreenfieldGenerationMetrics,
): GreenfieldGenerateResult {
  const error = res.error ?? "Provider request failed.";
  const debug = attachMetricsToDebug(
    buildProviderFailureDebug(startedAt, error, {
      provider: res.provider,
      model: res.model,
      latencyMs: res.latencyMs,
      raw: res.raw,
      metrics,
    }),
    metrics,
  );
  return {
    ok: false,
    provider: res.provider,
    model: res.model,
    rawText: res.text,
    latencyMs: res.latencyMs,
    error,
    debug,
    metrics,
  };
}

/**
 * Raw greenfield provider call — prompt is sent as-is (multi-phase generation).
 * Does not validate against the seven-file monolithic schema; the renderer parses
 * @@FILE markers for the requested phase paths.
 */
export async function runGreenfieldRawGenerate(
  provider: ProviderId,
  prompt: string,
  opts?: { maxOutputTokens?: number; userPrompt?: string },
): Promise<GreenfieldGenerateResult> {
  if (isMockProviderEnabled()) {
    return mockGreenfieldGenerate(provider, prompt);
  }
  const startedAt = Date.now();
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  if (!impl) {
    const error = `Unknown provider: ${provider}`;
    return {
      ok: false,
      provider,
      model: "",
      latencyMs: 0,
      error,
      debug: {
        stage: "greenfield:generate-phased",
        provider,
        requestStartedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        ipcChannel: "greenfield:generate-raw",
        errorMessage: error,
      },
    };
  }

  const maxOutputTokens =
    opts?.maxOutputTokens ??
    resolveGreenfieldPhaseMaxOutputTokens(raw.geminiModel);
  const userPrompt = opts?.userPrompt ?? prompt;

  const configuredTimeoutMs = PROVIDER_TIMEOUT_MS.generateGreenfield;
  const providerStart = Date.now();
  const res = await impl.generate(raw, prompt, maxOutputTokens, {
    timeoutMs: configuredTimeoutMs,
    operation: "greenfield",
  });
  const providerWaitMs = Date.now() - providerStart;
  const totalMs = Date.now() - startedAt;
  const hasText = Boolean(res.text?.trim());

  const metrics = buildGenerationMetrics({
    prompt,
    userPrompt,
    responseText: res.text,
    maxOutputTokens,
    providerWaitMs,
    parseMs: 0,
    totalMs,
    provider: res.provider,
    configuredTimeoutMs: res.timeoutMs ?? configuredTimeoutMs,
  });

  logGreenfieldMetrics(provider, res.model, res.ok && hasText, metrics);

  if (!res.ok) {
    return providerFailureResult(startedAt, res, metrics);
  }

  const debug = attachMetricsToDebug(
    buildParseFailureDebug(startedAt, {
      provider: res.provider,
      model: res.model,
      latencyMs: res.latencyMs,
      rawText: res.text,
      promptSent: prompt,
      ...(!hasText ? { errorMessage: "Phase returned empty provider text." } : {}),
    }),
    metrics,
  );

  return {
    ok: hasText,
    provider: res.provider,
    model: res.model,
    rawText: res.text,
    latencyMs: res.latencyMs,
    debug,
    metrics,
    ...(!hasText ? { error: "Phase returned empty provider text." } : {}),
  };
}
