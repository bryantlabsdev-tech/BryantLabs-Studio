/**
 * Greenfield generation metrics (renderer) — mirrors main-process instrumentation.
 */

export interface GreenfieldGenerationMetrics {
  promptCharCount: number;
  promptByteCount: number;
  userPromptCharCount: number;
  responseCharCount: number;
  responseByteCount: number;
  maxOutputTokens: number;
  singleRequestAllFiles: true;
  providerWaitMs: number;
  parseMs: number;
  totalMs: number;
  providerConfiguredTimeoutMs?: number;
  estimatedPromptTokens: number;
  estimatedResponseTokens: number;
}
