import { isFunctionalFeaturePrompt, isGameplayOrLogicPrompt, hasVisualStylingRequest } from "@/core/planner/fallback";
import { normalizeApplyPlanPath } from "@/core/planApply/markedFileParse";
import { isEntryBootstrapPath } from "@/core/planApply/targetPolicy";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

const APP_TSX = "src/App.tsx";
const INDEX_CSS = "src/index.css";

/** Prompts that require App.tsx logic, not CSS-only styling. */
export function promptRequiresAppImplementation(prompt: string): boolean {
  const lower = prompt.trim().toLowerCase();
  if (!lower) return false;
  if (isGameplayOrLogicPrompt(lower) || isFunctionalFeaturePrompt(lower)) return true;
  if (
    /\b(priority|due date|due dates|overdue|complete[ds]?|clear completed|confirm(ation)?|filter(ing)?|persist|localstorage|local storage)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  if (/\b(add|edit|delete|create)\b/.test(lower) && /\b(task|todo|item|entry|field)\b/.test(lower)) {
    return true;
  }
  if (
    /\b(hint|footer|empty state|placeholder)\b/.test(lower) ||
    /\bthat says\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

/** Follow-up that needs coordinated TSX + CSS changes (state + appearance). */
export function promptRequiresCoordinatedTsxAndCss(prompt: string): boolean {
  if (!promptRequiresAppImplementation(prompt)) return false;
  return hasVisualStylingRequest(prompt.toLowerCase());
}

export interface IncompleteCoordinatedApply {
  readonly incomplete: boolean;
  readonly missing: readonly string[];
  readonly message: string | null;
}

function readyChangedPaths(files: readonly PlanApplyFileEntry[]): Set<string> {
  const ready = new Set<string>();
  for (const file of files) {
    const path = normalizeApplyPlanPath(file.relPath);
    if (file.status === "ready" && file.diffStats?.changed) ready.add(path);
  }
  return ready;
}

function isRequiredCoordinationTarget(relPath: string): boolean {
  const path = normalizeApplyPlanPath(relPath);
  if (isEntryBootstrapPath(path)) return false;
  if (path === ".gitkeep" || path.endsWith("/.gitkeep")) return false;
  if (!/\.(tsx?|jsx?|css)$/i.test(path)) return false;
  return true;
}

/**
 * A multi-file follow-up is incomplete when required implementation files were
 * targeted but never produced a valid patch — even if CSS (or another file) did.
 */
export function evaluateIncompleteCoordinatedApply(input: {
  readonly prompt: string;
  readonly targetPaths: readonly string[];
  readonly files: readonly PlanApplyFileEntry[];
}): IncompleteCoordinatedApply {
  const targets = new Set(
    input.targetPaths
      .map((p) => normalizeApplyPlanPath(p))
      .filter((p) => isRequiredCoordinationTarget(p)),
  );
  const ready = readyChangedPaths(input.files);
  const missing: string[] = [];

  const needsApp = promptRequiresAppImplementation(input.prompt);
  if (needsApp && targets.has(APP_TSX) && !ready.has(APP_TSX)) {
    missing.push(APP_TSX);
  }

  if (
    promptRequiresCoordinatedTsxAndCss(input.prompt) &&
    targets.has(INDEX_CSS) &&
    !ready.has(INDEX_CSS)
  ) {
    missing.push(INDEX_CSS);
  }

  // Large multi-file expansions (Kanban / multi-phase edits): planned targets that
  // stayed in error while others applied are incomplete. Never treat entry
  // bootstrap (main.tsx) or non-source noise as required.
  if (targets.size > 3 && ready.size > 0) {
    for (const file of input.files) {
      const path = normalizeApplyPlanPath(file.relPath);
      if (!targets.has(path) || ready.has(path)) continue;
      if (!isRequiredCoordinationTarget(path)) continue;
      if (
        file.status === "error" ||
        file.decision === "rejected" ||
        file.status === "pending" ||
        file.status === "proposing"
      ) {
        if (!missing.includes(path)) missing.push(path);
      }
    }
  }

  if (missing.length === 0) {
    return { incomplete: false, missing: [], message: null };
  }

  const readyList = [...ready].filter((p) => isRequiredCoordinationTarget(p));
  const readyNote =
    readyList.length > 0
      ? ` Applied ${readyList.join(", ")} only.`
      : "";
  return {
    incomplete: true,
    missing,
    message: `Incomplete patch batch: required ${missing.join(" and ")} ${
      missing.length === 1 ? "was" : "were"
    } not updated.${readyNote}`,
  };
}

export function formatIncompleteApplyDiagnostics(
  files: readonly PlanApplyFileEntry[],
  missing: readonly string[],
): string {
  const missingSet = new Set(missing.map((p) => normalizeApplyPlanPath(p)));
  const lines: string[] = [];
  for (const file of files) {
    const path = normalizeApplyPlanPath(file.relPath);
    if (!missingSet.has(path)) continue;
    const reason =
      file.rejectionReason?.trim() ||
      file.error?.trim() ||
      (file.status === "skipped" ? "skipped" : file.status);
    lines.push(`${path}: ${reason}`);
  }
  return lines.join("; ");
}
