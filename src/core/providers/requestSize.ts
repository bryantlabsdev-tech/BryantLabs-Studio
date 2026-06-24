import {
  getProviderInputTokenLimit,
} from "@/core/contextEngine/tokenBudget";
import type { AgentStage } from "@/core/providers/orchestration";
import type { ProviderId } from "@/core/providers/types";

/** Rough token estimate (4 chars ≈ 1 token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const STAGE_TOKEN_BUDGET: Record<AgentStage, number> = {
  planner: 80_000,
  coder: 120_000,
  repair: 80_000,
  verifier: 0,
  greenfield: 140_000,
};

export interface RequestSizeCheck {
  readonly ok: boolean;
  readonly estimatedTokens: number;
  readonly budget: number;
  readonly trimmed: boolean;
  readonly actions: readonly string[];
}

const LOG_LINE_RE = /^\[[\w:]+\]/;

/** Drop verbose run-log lines from prompts when over budget. */
export function trimNonessentialLogs(text: string): string {
  const lines = text.split("\n");
  const kept = lines.filter((line) => !LOG_LINE_RE.test(line.trim()));
  return kept.length < lines.length ? kept.join("\n") : text;
}

/** Summarize a large file body for inclusion in prompts. */
export function summarizeLargeFile(content: string, maxChars = 4000): string {
  if (content.length <= maxChars) return content;
  const head = content.slice(0, Math.floor(maxChars * 0.6));
  const tail = content.slice(-Math.floor(maxChars * 0.25));
  return `${head}\n\n/* … ${content.length - head.length - tail.length} chars omitted … */\n\n${tail}`;
}

export function checkRequestSize(
  stage: AgentStage,
  payload: string,
  provider?: ProviderId,
): RequestSizeCheck {
  const budget = provider
    ? getProviderInputTokenLimit(provider, stage)
    : STAGE_TOKEN_BUDGET[stage];
  let text = payload;
  const actions: string[] = [];
  let estimated = estimateTokens(text);

  if (estimated > budget) {
    const trimmed = trimNonessentialLogs(text);
    if (trimmed !== text) {
      text = trimmed;
      actions.push("trim_logs");
      estimated = estimateTokens(text);
    }
  }

  return {
    ok: estimated <= budget,
    estimatedTokens: estimated,
    budget,
    trimmed: actions.length > 0,
    actions,
  };
}

/** Split multi-file patch targets into single-file batches. */
export function splitPatchTargets<T extends { readonly path: string }>(
  files: readonly T[],
  maxPerBatch = 1,
): T[][] {
  if (files.length <= maxPerBatch) return [files.slice() as T[]];
  const batches: T[][] = [];
  for (let i = 0; i < files.length; i += maxPerBatch) {
    batches.push(files.slice(i, i + maxPerBatch) as T[]);
  }
  return batches;
}
