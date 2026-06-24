import { isUiOnlyFollowUpPrompt } from "@/core/planner/promptClassification";
import type { PlanApplyTargetAction } from "@/core/planApply/createFileTargets";
import {
  findPrimaryStylesheets,
  findReactAppEntry,
  isFunctionalFeaturePrompt,
  normalizeRelPath,
} from "@/core/planner/fallback";
import type { ProjectScan } from "@/types";

export const CONFIG_UI_BLOCK_MESSAGE =
  "Config/package files are not allowed for this UI-only change.";

export const SELECTION_REASON = {
  reactEntry: "React entry component",
  primaryStylesheet: "Primary stylesheet",
  componentStylesheet: "Component stylesheet",
  calculatorUi: "Calculator UI component",
  deterministicPlan: "Listed in deterministic plan",
  aiPlan: "Listed in AI plan",
  uiAllowlist: "Allowed UI target for styling/layout requests",
  gameplayComponent: "Gameplay-related UI component",
  createTarget: "New source file (follow-up create)",
  inferredCreate: "Inferred new source file from prompt",
} as const;

const CONFIG_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "jsconfig.json",
]);

/** User explicitly asked to change dependencies, tooling, or build config. */
export function isConfigOrBuildChangePrompt(promptLower: string): boolean {
  return /\b(dependencies?|devdependencies?|package\.json|vite\.config|tsconfig|webpack|rollup|build config|npm install|pnpm add|yarn add|electron builder|tooling)\b/i.test(
    promptLower,
  );
}

export function isUiOnlyApplyPrompt(prompt: string): boolean {
  return isUiOnlyFollowUpPrompt(prompt);
}

/** Paths eligible for gameplay / feature_addition apply (logic + styling). */
export function isGameplayPatchTarget(relPath: string): boolean {
  const norm = normalizeRelPath(relPath);
  if (norm === "src/App.tsx" || norm === "src/index.css" || norm === "src/App.css") {
    return true;
  }
  if (!/\.tsx$/i.test(norm)) return false;
  return /sudoku|gameboard|game-board|board|cell|grid|pad|modal|stat/i.test(norm);
}

/** Gameplay apply allowlist: App entry, stylesheets, and related UI components. */
export function buildGameplayAllowlist(
  scan: ProjectScan,
  promptLower = "",
): PlanApplyTargetCandidate[] {
  const allowlist = buildUiOnlyAllowlist(scan, promptLower);
  const seen = new Set(allowlist.map((t) => t.relPath));

  for (const file of scan.files) {
    const norm = normalizeRelPath(file.path);
    if (!isGameplayPatchTarget(norm) || seen.has(norm)) continue;
    if (!norm.startsWith("src/")) continue;
    seen.add(norm);
    allowlist.push({
      relPath: norm,
      absPath: file.absPath,
      selectionReason: SELECTION_REASON.gameplayComponent,
      planReason: "Gameplay-related UI component",
    });
  }

  return allowlist;
}

/** UI-only patch IPC: only App entry + global stylesheet (no App.css in model prompt). */
export function isUiCorePatchTarget(relPath: string): boolean {
  const norm = normalizeRelPath(relPath);
  return norm === "src/App.tsx" || norm === "src/index.css";
}

function fileBasename(relPath: string): string {
  const norm = normalizeRelPath(relPath);
  const parts = norm.split("/");
  return parts[parts.length - 1] ?? norm;
}

/** package.json, vite.config.*, tsconfig.*, lockfiles. */
export function isConfigPackageTarget(relPath: string): boolean {
  const base = fileBasename(relPath).toLowerCase();
  if (CONFIG_BASENAMES.has(base)) return true;
  if (/^vite\.config\./i.test(base)) return true;
  if (/^tsconfig/i.test(base)) return true;
  if (/^electron-builder/i.test(base)) return true;
  return false;
}

/** Paths that must not be proposed for UI-only Apply Plan. */
export function isBlockedNonUiTarget(relPath: string): boolean {
  if (isConfigPackageTarget(relPath)) return true;
  const norm = normalizeRelPath(relPath).toLowerCase();
  if (norm === "index.html") return true;
  if (norm.startsWith("dist/") || norm.includes("/dist/")) return true;
  if (norm.includes("node_modules")) return true;
  return false;
}

export interface PlanApplyTargetCandidate {
  relPath: string;
  absPath: string;
  /** From plan / AI plan file list. */
  planReason: string;
  selectionReason: string;
  action?: PlanApplyTargetAction;
}

/** UI-only apply allowlist: App entry + primary stylesheets present in the project. */
export function buildUiOnlyAllowlist(
  scan: ProjectScan,
  promptLower = "",
): PlanApplyTargetCandidate[] {
  const allowlist: PlanApplyTargetCandidate[] = [];
  const seen = new Set<string>();

  const add = (
    entry: { path: string; absPath: string } | null,
    selectionReason: string,
    planReason: string,
  ) => {
    if (!entry || seen.has(entry.path)) return;
    seen.add(entry.path);
    allowlist.push({
      relPath: entry.path,
      absPath: entry.absPath,
      planReason,
      selectionReason,
    });
  };

  const app = findReactAppEntry(scan);
  add(
    app,
    SELECTION_REASON.reactEntry,
    "Primary React UI surface for layout and styling changes",
  );

  const { indexCss, appCss } = findPrimaryStylesheets(scan);
  add(
    indexCss,
    SELECTION_REASON.primaryStylesheet,
    "Global styles for theme, layout, and visual polish",
  );
  add(
    appCss,
    SELECTION_REASON.componentStylesheet,
    "Component-level styles paired with the app entry",
  );

  if (promptLower.includes("calculator")) {
    for (const file of scan.files) {
      if (!/calculator/i.test(normalizeRelPath(file.path))) continue;
      add(
        file,
        SELECTION_REASON.calculatorUi,
        "Calculator-specific UI component",
      );
    }
  }

  return allowlist;
}

export function filterPlanApplyTargets(
  candidates: readonly PlanApplyTargetCandidate[],
  scan: ProjectScan,
  prompt: string,
  skipped: string[],
): PlanApplyTargetCandidate[] {
  const promptLower = prompt.toLowerCase();
  const functional = isFunctionalFeaturePrompt(promptLower);
  const uiOnly = isUiOnlyApplyPrompt(prompt) && !functional;
  const configAllowed =
    isConfigOrBuildChangePrompt(promptLower) && !uiOnly;

  if (functional) {
    const kept: PlanApplyTargetCandidate[] = [];
    for (const c of candidates) {
      if (isBlockedNonUiTarget(c.relPath) && !configAllowed) {
        skipped.push(`${c.relPath}: ${CONFIG_UI_BLOCK_MESSAGE}`);
        continue;
      }
      kept.push(c);
    }
    return kept;
  }

  if (uiOnly) {
    const allowPaths = new Set(
      buildUiOnlyAllowlist(scan, promptLower).map((t) => t.relPath),
    );
    const kept: PlanApplyTargetCandidate[] = [];
    const seen = new Set<string>();

    for (const c of candidates) {
      if (isBlockedNonUiTarget(c.relPath)) {
        skipped.push(`${c.relPath}: ${CONFIG_UI_BLOCK_MESSAGE}`);
        continue;
      }
      if (!allowPaths.has(c.relPath)) {
        skipped.push(
          `${c.relPath}: Not in UI allowlist (src/App.tsx, src/index.css, src/App.css only)`,
        );
        continue;
      }
      if (seen.has(c.relPath)) continue;
      seen.add(c.relPath);
      kept.push(c);
    }

    for (const allowed of buildUiOnlyAllowlist(scan, promptLower)) {
      if (seen.has(allowed.relPath)) continue;
      seen.add(allowed.relPath);
      kept.push(allowed);
    }

    return kept;
  }

  if (configAllowed) return [...candidates];

  const kept: PlanApplyTargetCandidate[] = [];
  for (const c of candidates) {
    if (isBlockedNonUiTarget(c.relPath)) {
      skipped.push(`${c.relPath}: ${CONFIG_UI_BLOCK_MESSAGE}`);
      continue;
    }
    kept.push(c);
  }
  return kept;
}
