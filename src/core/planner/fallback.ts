import { isUiAuditFixPrompt } from "@/core/agent/uiAuditAdvisoryUx";
import type { ProjectScan } from "@/types";
import type { Confidence, PlanFile } from "@/core/planner/types";

/** Minimum score for fallback-selected files (above strong-seed threshold). */
const FALLBACK_SCORE = 6;
const MAX_REASONS = 5;

/** Prompt signals for UI / layout / styling work (substring match on lowercased prompt). */
const UI_LAYOUT_PHRASES = [
  "dark mode",
  "calculator ui",
  "css grid",
  "aspect ratio",
  "game board",
] as const;

const UI_LAYOUT_KEYWORDS = [
  "ui",
  "layout",
  "styling",
  "theme",
  "redesign",
  "premium",
  "modern",
  "stylesheet",
  "css",
  "style",
  "design",
  "appearance",
  "look",
  "visual",
  "interface",
  "calculator",
  "refine",
  "polish",
  "audit",
  "repair",
  "grid",
  "board",
  "sudoku",
  "cell",
  "cells",
  "responsive",
  "controls",
] as const;

export function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** State, persistence, and feature-addition work — not CSS-only layout polish. */
const FUNCTIONAL_FEATURE_PHRASES = [
  "calculation history",
  "calculation logic",
  "add feature",
  "clear history",
  "show last 10",
  "last 10 calculations",
  "create component",
  "create a component",
  "separate component",
  "separate history",
  "new component",
  "add component",
  "local storage",
  "localstorage",
  "use state",
  "state management",
] as const;

const FUNCTIONAL_FEATURE_KEYWORDS = [
  "persist",
  "history",
  "localstorage",
  "component",
] as const;

export function isFunctionalFeaturePrompt(promptLower: string): boolean {
  for (const phrase of FUNCTIONAL_FEATURE_PHRASES) {
    if (promptLower.includes(phrase)) return true;
  }
  if (/\badd\s+.+\s+feature\b/.test(promptLower)) return true;
  if (/\bcreate\s+(a\s+)?(separate\s+)?\w+\s+component\b/.test(promptLower)) {
    return true;
  }
  if (/\bshow\s+last\s+\d+\b/.test(promptLower)) return true;
  if (/\blast\s+\d+\s+calculations?\b/.test(promptLower)) return true;
  if (
    /\b(history|state)\b/.test(promptLower) &&
    /\b(persist|localstorage|local storage|storage|save)\b/.test(promptLower)
  ) {
    return true;
  }
  for (const kw of FUNCTIONAL_FEATURE_KEYWORDS) {
    if (!promptLower.includes(kw)) continue;
    if (kw === "component" && /\b(ui|layout|style|theme|css)\s+component\b/.test(promptLower)) {
      continue;
    }
    if (kw === "history" && /\b(browser|routing|navigation)\s+history\b/.test(promptLower)) {
      continue;
    }
    return true;
  }
  return false;
}

export function isUiLayoutPrompt(promptLower: string): boolean {
  if (isFunctionalFeaturePrompt(promptLower)) return false;
  for (const phrase of UI_LAYOUT_PHRASES) {
    if (promptLower.includes(phrase)) return true;
  }
  for (const kw of UI_LAYOUT_KEYWORDS) {
    if (promptLower.includes(kw)) return true;
  }
  return false;
}

/** Gameplay, state, modals, and interaction logic — not CSS-only styling. */
const GAMEPLAY_SIGNALS = [
  "notes mode",
  "hint system",
  "hints",
  "mistake counter",
  "mistakes",
  "game over",
  "win modal",
  "pause",
  "resume",
  "timer",
  "difficulty",
  "keyboard controls",
  "statistics",
  "selected cell",
  "matching numbers",
  "original numbers",
  "user-entered numbers",
  "candidates",
  "gameplay",
  "easier to play",
  "enjoyable to play",
  "real sudoku game",
  "real sudoku",
  "gameplay ux",
  "gameplay flow",
  "number input",
  "selection behavior",
  "mistake feedback",
  "play again",
  "try again",
  "user-entered",
  "original puzzle",
  "game over modal",
  "win/game over",
  "win screen",
  "cannot be edited",
  "statistics panel",
  "difficulty selector",
  "hint button",
  "3 strikes",
  "3 mistakes",
  "flash red",
  "game logic",
] as const;

const GAMEPLAY_SCORE_CONTEXT =
  /\b(game|player|points|level|timer|puzzle|leaderboard|high score|top score)\b/;

/** Bare "score" (e.g. UI audit `Score: 86`) is not gameplay without game context. */
function isGameplayScorePrompt(promptLower: string): boolean {
  if (!/\bscore\b/.test(promptLower)) return false;
  return GAMEPLAY_SCORE_CONTEXT.test(promptLower);
}

export function isGameplayOrLogicPrompt(promptLower: string): boolean {
  for (const signal of GAMEPLAY_SIGNALS) {
    if (promptLower.includes(signal)) return true;
  }
  if (/\bhint\b/.test(promptLower) && /\b(sudoku|game|cell|board|play)\b/.test(promptLower)) {
    return true;
  }
  if (isGameplayScorePrompt(promptLower)) return true;
  return false;
}

/** Styling/layout-only work suitable for CSS + light App.tsx class tweaks. */
export function isUiOnlyStylingPrompt(prompt: string): boolean {
  if (isUiAuditFixPrompt(prompt)) return true;
  const lower = prompt.toLowerCase();
  if (isGameplayOrLogicPrompt(lower)) return false;
  if (isFunctionalFeaturePrompt(lower)) return false;
  if (isUiLayoutPrompt(lower)) return true;
  if (
    /\b(blue|red|green|gold|color|colour|font|margin|padding|rounded|border-radius|shadow|gradient)\b/.test(
      lower,
    ) &&
    /\b(button|buttons|ui|style|css|theme|look|appearance)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

function pathEnds(norm: string, suffix: string): boolean {
  return norm.toLowerCase().endsWith(suffix.toLowerCase());
}

function findScanFile(
  scan: ProjectScan,
  matcher: (norm: string) => boolean,
): { path: string; absPath: string } | null {
  const matches = scan.files.filter((f) => matcher(normalizeRelPath(f.path)));
  if (matches.length === 0) return null;
  const preferred =
    matches.find((f) => normalizeRelPath(f.path).startsWith("src/")) ?? matches[0]!;
  return { path: preferred.path, absPath: preferred.absPath };
}

export function findReactAppEntry(
  scan: ProjectScan,
): { path: string; absPath: string } | null {
  return findScanFile(
    scan,
    (norm) => pathEnds(norm, "/App.tsx") || pathEnds(norm, "/App.jsx"),
  );
}

export function findPrimaryStylesheets(scan: ProjectScan): {
  indexCss: { path: string; absPath: string } | null;
  appCss: { path: string; absPath: string } | null;
} {
  return {
    indexCss: findScanFile(scan, (norm) => pathEnds(norm, "/index.css")),
    appCss: findScanFile(scan, (norm) => pathEnds(norm, "/App.css")),
  };
}

function findCalculatorComponentFiles(
  scan: ProjectScan,
): { path: string; absPath: string }[] {
  return scan.files
    .filter((f) => /calculator/i.test(normalizeRelPath(f.path)))
    .map((f) => ({ path: f.path, absPath: f.absPath }));
}

function addReason(file: PlanFile, reason: string): void {
  if (file.reasons.length >= MAX_REASONS) return;
  if (!file.reasons.includes(reason)) file.reasons.push(reason);
}

function upsertFile(
  map: Map<string, PlanFile>,
  entry: { path: string; absPath: string },
  reason: string,
  score = FALLBACK_SCORE,
): PlanFile {
  const existing = map.get(entry.path);
  if (existing) {
    existing.score = Math.max(existing.score, score);
    addReason(existing, reason);
    return existing;
  }
  const created: PlanFile = {
    path: entry.path,
    absPath: entry.absPath,
    score,
    reasons: [reason],
  };
  map.set(entry.path, created);
  return created;
}

function sortRanked(files: PlanFile[]): PlanFile[] {
  return [...files].sort(
    (a, b) => b.score - a.score || a.path.localeCompare(b.path),
  );
}

/** Boost or add App.tsx / index.css / App.css for UI-oriented prompts. */
export function boostUiLayoutCandidates(
  ranked: readonly PlanFile[],
  scan: ProjectScan,
  promptLower: string,
): PlanFile[] {
  if (!isUiLayoutPrompt(promptLower)) return [...ranked];

  const map = new Map(ranked.map((f) => [f.path, { ...f, reasons: [...f.reasons] }]));
  const app = findReactAppEntry(scan);
  const { indexCss, appCss } = findPrimaryStylesheets(scan);

  if (app) {
    const reason = promptLower.includes("calculator")
      ? "React entry component (calculator UI likely lives here)"
      : "React entry component";
    upsertFile(map, app, reason);
  }
  if (indexCss) {
    upsertFile(map, indexCss, "Primary stylesheet");
  }
  if (appCss) {
    upsertFile(map, appCss, "Component stylesheet");
  }

  if (promptLower.includes("calculator")) {
    for (const calc of findCalculatorComponentFiles(scan)) {
      upsertFile(map, calc, "Calculator UI component");
    }
  }

  return sortRanked([...map.values()]);
}

/** Minimal set when keyword scoring found nothing. */
export function buildZeroMatchFallback(
  scan: ProjectScan,
  promptLower: string,
): PlanFile[] {
  const map = new Map<string, PlanFile>();
  const app = findReactAppEntry(scan);
  const { indexCss, appCss } = findPrimaryStylesheets(scan);

  if (app) {
    const reason = promptLower.includes("calculator")
      ? "React entry component (calculator UI likely lives here)"
      : "React entry component";
    upsertFile(map, app, reason);
  }
  if (indexCss) {
    upsertFile(map, indexCss, "Primary stylesheet");
  }
  if (appCss) {
    upsertFile(map, appCss, "Component stylesheet");
  }

  for (const calc of findCalculatorComponentFiles(scan)) {
    upsertFile(map, calc, "Calculator UI component");
  }

  if (map.size === 0) {
    const entry = scan.files[0];
    if (entry) {
      upsertFile(map, entry, "Fallback: first indexed project file");
    }
  }

  return sortRanked([...map.values()]);
}

/** When confidence is low, ensure React root and primary CSS are in the list. */
export function ensureLowConfidenceCandidates(
  ranked: readonly PlanFile[],
  scan: ProjectScan,
  promptLower: string,
): PlanFile[] {
  const map = new Map(ranked.map((f) => [f.path, { ...f, reasons: [...f.reasons] }]));
  const app = findReactAppEntry(scan);
  const { indexCss, appCss } = findPrimaryStylesheets(scan);

  if (app && !map.has(app.path)) {
    const reason = promptLower.includes("calculator")
      ? "React entry component (calculator UI likely lives here)"
      : "React entry component";
    upsertFile(map, app, reason, 5);
  }
  if (indexCss && !map.has(indexCss.path)) {
    upsertFile(map, indexCss, "Primary stylesheet", 5);
  }
  if (appCss && !map.has(appCss.path)) {
    upsertFile(map, appCss, "Component stylesheet", 5);
  }

  return sortRanked([...map.values()]);
}

export interface PlannerFallbackResult {
  files: PlanFile[];
  usedFallback: boolean;
}

/**
 * Apply UI/React/CSS fallbacks after primary scoring.
 * Never returns an empty file list when the scan has any files.
 */
export function applyPlannerFallback(
  ranked: readonly PlanFile[],
  scan: ProjectScan,
  promptLower: string,
  confidence: Confidence,
): PlannerFallbackResult {
  let usedFallback = false;
  let files: PlanFile[];

  if (ranked.length === 0 && scan.files.length > 0) {
    files = buildZeroMatchFallback(scan, promptLower);
    usedFallback = true;
  } else {
    files = [...ranked];
  }

  if (isUiLayoutPrompt(promptLower)) {
    files = boostUiLayoutCandidates(files, scan, promptLower);
  }

  if (confidence === "Low") {
    files = ensureLowConfidenceCandidates(files, scan, promptLower);
  }

  if (files.length === 0 && scan.files.length > 0) {
    files = buildZeroMatchFallback(scan, promptLower);
    usedFallback = true;
  }

  return { files, usedFallback };
}
