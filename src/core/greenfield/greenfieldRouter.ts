import type { GreenfieldGenerationMode } from "@/core/greenfield/types";

export interface GreenfieldRouteDecision {
  readonly mode: GreenfieldGenerationMode;
  readonly score: number;
  readonly reasons: readonly string[];
}

const PAGE_SIGNALS = [
  /dashboard/i,
  /\bleads?\b/i,
  /\bjobs?\b/i,
  /estimates?/i,
  /invoices?/i,
  /customers?/i,
  /settings/i,
  /pages?\s*:/i,
  /multi-?page/i,
  /routing/i,
  /react router/i,
];

const COMPLEXITY_SIGNALS = [
  /localstorage/i,
  /\bcrud\b/i,
  /add\/edit\/delete/i,
  /saas/i,
  /sidebar/i,
  /kpi/i,
  /status badges?/i,
  /tables? with/i,
  /reusable components/i,
];

const SIMPLE_SIGNALS = [
  /calculator/i,
  /counter/i,
  /hello world/i,
  /single page/i,
  /one screen/i,
  /minimal/i,
  /todo(?!.*dashboard)/i,
];

const MULTI_PHASE_THRESHOLD = 4;

export function scoreGreenfieldPrompt(prompt: string): GreenfieldRouteDecision {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (text.length > 800) {
    score += 2;
    reasons.push("long_prompt");
  } else if (text.length > 400) {
    score += 1;
    reasons.push("medium_prompt");
  }

  let pageHits = 0;
  for (const re of PAGE_SIGNALS) {
    if (re.test(text)) pageHits += 1;
  }
  if (pageHits >= 3) {
    score += 3;
    reasons.push(`multi_page(${pageHits})`);
  } else if (pageHits >= 1) {
    score += 1;
    reasons.push(`pages(${pageHits})`);
  }

  for (const re of COMPLEXITY_SIGNALS) {
    if (re.test(text)) {
      score += 1;
      reasons.push(`complex:${re.source.slice(0, 24)}`);
    }
  }

  for (const re of SIMPLE_SIGNALS) {
    if (re.test(lower)) {
      score -= 2;
      reasons.push(`simple:${re.source}`);
    }
  }

  if (/fieldflow/i.test(text)) {
    score += 2;
    reasons.push("fieldflow_benchmark");
  }

  const mode: GreenfieldGenerationMode =
    score >= MULTI_PHASE_THRESHOLD ? "multi-phase" : "lite";

  return { mode, score, reasons };
}

export function classifyGreenfieldGenerationRoute(
  prompt: string,
): GreenfieldRouteDecision {
  return scoreGreenfieldPrompt(prompt);
}
