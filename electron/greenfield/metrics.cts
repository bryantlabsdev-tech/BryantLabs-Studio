/**
 * Greenfield generation instrumentation (diagnosis only).
 * Logged and returned in debug/metrics — never includes API keys or prompt text.
 */

/** Cap for single-shot seven-file generation (config + App last; ~9–12k chars typical). */
export const GREENFIELD_MAX_OUTPUT_TOKENS = 12000;

export interface GreenfieldGenerationMetrics {
  /** Full prompt character count (system template + user prompt). */
  promptCharCount: number;
  promptByteCount: number;
  userPromptCharCount: number;
  /** Extracted model text length (0 if provider failed before text). */
  responseCharCount: number;
  responseByteCount: number;
  maxOutputTokens: number;
  /** Architecture: always one provider call for all seven files. */
  singleRequestAllFiles: true;
  /** Milliseconds in impl.generate (includes HTTP + model time). */
  providerWaitMs: number;
  parseMs: number;
  totalMs: number;
  providerConfiguredTimeoutMs?: number;
  /** Rough token estimate (chars/4) for sizing only. */
  estimatedPromptTokens: number;
  estimatedResponseTokens: number;
}

export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4);
}

export function buildGenerationMetrics(opts: {
  prompt: string;
  userPrompt: string;
  responseText: string;
  maxOutputTokens: number;
  providerWaitMs: number;
  parseMs: number;
  totalMs: number;
  provider: string;
  configuredTimeoutMs?: number;
}): GreenfieldGenerationMetrics {
  const metrics: GreenfieldGenerationMetrics = {
    promptCharCount: opts.prompt.length,
    promptByteCount: Buffer.byteLength(opts.prompt, "utf8"),
    userPromptCharCount: opts.userPrompt.length,
    responseCharCount: opts.responseText.length,
    responseByteCount: Buffer.byteLength(opts.responseText, "utf8"),
    maxOutputTokens: opts.maxOutputTokens,
    singleRequestAllFiles: true,
    providerWaitMs: opts.providerWaitMs,
    parseMs: opts.parseMs,
    totalMs: opts.totalMs,
    estimatedPromptTokens: estimateTokensFromChars(opts.prompt.length),
    estimatedResponseTokens: estimateTokensFromChars(opts.responseText.length),
  };
  if (opts.configuredTimeoutMs !== undefined) {
    metrics.providerConfiguredTimeoutMs = opts.configuredTimeoutMs;
  }
  return metrics;
}

/** Safe one-line log for main-process diagnosis (no secrets, no prompt body). */
export function logGreenfieldMetrics(
  provider: string,
  model: string,
  ok: boolean,
  metrics: GreenfieldGenerationMetrics,
): void {
  console.info(
    "[greenfield:metrics]",
    JSON.stringify({
      ok,
      provider,
      model,
      promptChars: metrics.promptCharCount,
      responseChars: metrics.responseCharCount,
      maxOutputTokens: metrics.maxOutputTokens,
      providerWaitMs: metrics.providerWaitMs,
      parseMs: metrics.parseMs,
      totalMs: metrics.totalMs,
      providerTimeoutMs: metrics.providerConfiguredTimeoutMs,
      singleRequest: metrics.singleRequestAllFiles,
    }),
  );
}
