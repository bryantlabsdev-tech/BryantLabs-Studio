import type { ProviderId } from "./settings.cjs";
import type { GeminiTransportDiagnostics } from "./geminiDiagnostics.cjs";
import {
  analyzePlannerTokenBudget,
  parseGeminiUsageMetadata,
} from "./plannerTokenBudget.cjs";

export interface ProviderResponseMeta {
  readonly responseLength: number;
  readonly candidateCount: number;
  readonly finishReason: string | null;
  readonly safetyBlocked: boolean;
  readonly promptBlockReason: string | null;
  readonly providerMetadata: string | null;
  readonly requestMaxOutputTokens: number | null;
  readonly thoughtsTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly tokenStarvationLikely: boolean | null;
  readonly tokenBudgetHint: string | null;
  readonly gemini?: GeminiTransportDiagnostics;
}

function compactJson(value: unknown, max = 800): string | null {
  try {
    const text = JSON.stringify(value);
    if (!text || text === "{}") return null;
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  } catch {
    return null;
  }
}

export function extractGeminiResponseMeta(
  json: unknown,
  text: string,
  gemini?: GeminiTransportDiagnostics,
): ProviderResponseMeta {
  const data = json as {
    candidates?: Array<{ finishReason?: string; safetyRatings?: unknown }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: unknown;
  };
  const candidates = data?.candidates ?? [];
  const finishReason = candidates[0]?.finishReason ?? null;
  const promptBlockReason = data?.promptFeedback?.blockReason ?? null;
  const safetyBlocked =
    Boolean(promptBlockReason) ||
    finishReason === "SAFETY" ||
    finishReason === "RECITATION";
  const usage = parseGeminiUsageMetadata(json);
  const budget = analyzePlannerTokenBudget({
    maxOutputTokens: gemini?.maxOutputTokens ?? 0,
    usage,
    responseEmpty: text.trim().length === 0,
    finishReason,
    model: gemini?.providerModel ?? null,
  });

  return {
    responseLength: text.length,
    candidateCount: candidates.length,
    finishReason,
    safetyBlocked,
    promptBlockReason,
    providerMetadata: compactJson({
      candidateCount: candidates.length,
      finishReasons: candidates.map((c) => c.finishReason ?? null),
      promptFeedback: data?.promptFeedback ?? null,
      usageMetadata: data?.usageMetadata ?? null,
      generateMethod: gemini?.generateMethod ?? "generateContent",
      maxOutputTokens: gemini?.maxOutputTokens ?? null,
      thoughtsTokenCount: budget.thoughtsTokenCount,
      candidatesTokenCount: budget.candidatesTokenCount,
    }),
    requestMaxOutputTokens: gemini?.maxOutputTokens ?? null,
    thoughtsTokenCount: budget.thoughtsTokenCount,
    candidatesTokenCount: budget.candidatesTokenCount,
    tokenStarvationLikely: budget.tokenStarvationLikely,
    tokenBudgetHint: budget.tokenBudgetHint,
    ...(gemini ? { gemini } : {}),
  };
}

export function extractProviderResponseMeta(
  provider: ProviderId,
  json: unknown,
  text: string,
  gemini?: GeminiTransportDiagnostics,
): ProviderResponseMeta {
  if (provider === "gemini") {
    return extractGeminiResponseMeta(json, text, gemini);
  }
  return {
    responseLength: text.length,
    candidateCount: text.trim().length > 0 ? 1 : 0,
    finishReason: null,
    safetyBlocked: false,
    promptBlockReason: null,
    providerMetadata: null,
    requestMaxOutputTokens: null,
    thoughtsTokenCount: null,
    candidatesTokenCount: null,
    tokenStarvationLikely: null,
    tokenBudgetHint: null,
  };
}
