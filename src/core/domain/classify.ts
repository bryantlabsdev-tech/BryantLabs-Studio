import type { AppDomain, AppDomainProfile, ClassifyAppDomainInput } from "./types";

interface DomainRule {
  readonly domain: AppDomain;
  readonly weight: number;
  readonly test: (text: string) => boolean;
}

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    domain: "comparison",
    weight: 14,
    test: (t) =>
      /\bcompare|comparison|versus|vs\.?\b|side.?by.?side\b/.test(t) ||
      /\b(price|quality|rating|review).{0,40}(price|quality|rating|review)\b/.test(t) ||
      /\bcosmetic|product comparison|user friendliness\b/.test(t),
  },
  {
    domain: "crm",
    weight: 13,
    test: (t) => /\bcrm\b|customer relationship|sales pipeline|lead management\b/.test(t),
  },
  {
    domain: "marketplace",
    weight: 12,
    test: (t) =>
      /\bmarketplace|e-?commerce|shopping cart|checkout|product catalog|storefront\b/.test(t),
  },
  {
    domain: "dashboard",
    weight: 11,
    test: (t) =>
      /\bdashboard\b|analytics panel|kpi\b|metrics overview|admin panel\b/.test(t),
  },
  {
    domain: "saas",
    weight: 11,
    test: (t) =>
      /\bsaas\b|subscription|billing portal|onboarding flow|workspace app\b/.test(t),
  },
  {
    domain: "social",
    weight: 11,
    test: (t) =>
      /\bsocial\b|feed\b|messaging app|chat app|followers|timeline\b/.test(t),
  },
  {
    domain: "productivity",
    weight: 10,
    test: (t) =>
      /\btask manager|todo\b|habit tracker|notes app|calendar app|project management\b/.test(t),
  },
  {
    domain: "game_puzzle",
    weight: 13,
    test: (t) =>
      /\bsudoku\b|crossword|wordle|puzzle game|logic puzzle|minesweeper\b/.test(t),
  },
  {
    domain: "game_arcade",
    weight: 10,
    test: (t) =>
      /\b(arcade|platformer|shooter|runner)\s+game\b/.test(t) ||
      (/\bgame\b/.test(t) && /\bscore|level|lives|high score\b/.test(t)),
  },
  {
    domain: "utility",
    weight: 9,
    test: (t) => /\bcalculator\b|converter\b|unit converter|timer app|stopwatch\b/.test(t),
  },
];

const DISPLAY_NAMES: Record<AppDomain, string> = {
  saas: "SaaS app",
  dashboard: "Dashboard",
  crm: "CRM",
  marketplace: "Marketplace",
  comparison: "Comparison app",
  social: "Social app",
  productivity: "Productivity app",
  utility: "Utility app",
  game_puzzle: "Puzzle game",
  game_arcade: "Game",
  unknown: "App",
};

function corpus(input: ClassifyAppDomainInput): string {
  return [
    input.prompt ?? "",
    input.appSource ?? "",
    input.cssSource ?? "",
    input.projectName ?? "",
  ]
    .join("\n")
    .toLowerCase();
}

function inferDisplayName(domain: AppDomain, prompt: string): string {
  if (domain === "comparison") {
    if (/\bcosmetic/i.test(prompt)) return "Cosmetics comparison";
    if (/\bproduct/i.test(prompt)) return "Product comparison";
    return DISPLAY_NAMES.comparison;
  }
  if (domain === "game_puzzle" && /\bsudoku\b/i.test(prompt)) return "Sudoku";
  if (domain === "utility" && /\bcalculator\b/i.test(prompt)) return "Calculator";
  if (domain === "productivity" && /\btask manager\b/i.test(prompt)) return "Task manager";
  if (domain === "productivity" && /\bhabit tracker\b/i.test(prompt)) return "Habit tracker";
  return DISPLAY_NAMES[domain];
}

/** Classify app domain from prompt and optional generated sources. */
export function classifyAppDomain(input: ClassifyAppDomainInput): AppDomainProfile {
  const text = corpus(input);
  const prompt = (input.prompt ?? "").trim();

  let best: AppDomain = "unknown";
  let bestScore = 0;
  const signals: string[] = [];

  for (const rule of DOMAIN_RULES) {
    if (!rule.test(text)) continue;
    if (rule.weight > bestScore) {
      best = rule.domain;
      bestScore = rule.weight;
      signals.length = 0;
      signals.push(rule.domain);
    } else if (rule.weight === bestScore && rule.domain !== best) {
      signals.push(rule.domain);
    }
  }

  if (best === "unknown" && prompt.length >= 8) {
    if (/\bwebsite\b|\bweb app\b|\blanding page\b/i.test(prompt)) {
      best = "saas";
      bestScore = 5;
      signals.push("website");
    } else if (/\bapp\b/i.test(prompt)) {
      best = "unknown";
      bestScore = 3;
      signals.push("generic_app");
    }
  }

  return {
    domain: best,
    confidence: Math.min(100, bestScore * 7),
    signals,
    displayName: inferDisplayName(best, prompt),
  };
}

/** True when UI audit should apply Sudoku-style 81-cell puzzle grid rules. */
export function isPuzzleGridDomain(profile: AppDomainProfile): boolean {
  return profile.domain === "game_puzzle";
}

export function isPuzzleGridSource(appSource: string | null, cssSource: string | null): boolean {
  const blob = `${appSource ?? ""}\n${cssSource ?? ""}`.toLowerCase();
  if (/\bcompare|comparison|product|price|cosmetic|table-layout|data-table\b/.test(blob)) {
    return false;
  }
  return /\bsudoku\b|sudoku-board|puzzle-grid|game-board/.test(blob);
}
