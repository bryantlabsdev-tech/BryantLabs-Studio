import { normalizeRelPath } from "@/core/planner/fallback";
import { resolvePlanFilePath } from "@/core/planApply/resolve";
import {
  isBlockedNonUiTarget,
  isConfigOrBuildChangePrompt,
  isConfigPackageTarget,
} from "@/core/planApply/targetPolicy";
import type { ProjectScan } from "@/types";

export type PlanApplyTargetAction = "create" | "modify";

export const CREATE_TARGET_ACCEPTED_LABEL = "Create target accepted";
export const CREATE_TARGET_REJECTED_LABEL = "Create target rejected";
export const SCAFFOLD_TARGET_SKIPPED_LABEL = "Skipped scaffold/config target";

const FOLLOW_UP_CREATE_SOURCE =
  /^src\/(components|hooks|utils|pages|features|lib|stores|services)\/[^/]+\.(tsx|ts|jsx|js)$/i;

const SCAFFOLD_FOLLOW_UP_PATHS = new Set([
  "src/main.tsx",
  "src/main.jsx",
]);

export function normalizePlanPath(planPath: string): string {
  return normalizeRelPath(planPath.replace(/^\.\//, ""));
}

export function isFollowUpCreatableSourcePath(relPath: string): boolean {
  const norm = normalizePlanPath(relPath);
  if (!FOLLOW_UP_CREATE_SOURCE.test(norm)) return false;
  if (SCAFFOLD_FOLLOW_UP_PATHS.has(norm.toLowerCase())) return false;
  return true;
}

export function isScaffoldConfigFollowUpPath(
  relPath: string,
  userPrompt: string,
): boolean {
  const norm = normalizePlanPath(relPath);
  const promptLower = userPrompt.toLowerCase();
  if (isConfigOrBuildChangePrompt(promptLower)) return false;
  if (isBlockedNonUiTarget(norm)) return true;
  if (isConfigPackageTarget(norm)) return true;
  if (norm === "index.html") return true;
  if (SCAFFOLD_FOLLOW_UP_PATHS.has(norm.toLowerCase())) return true;
  return false;
}

export function joinProjectRelPath(
  projectPath: string | null | undefined,
  relPath: string,
): string {
  const root = (projectPath ?? "").replace(/\/$/, "");
  const rel = normalizePlanPath(relPath);
  return root ? `${root}/${rel}` : rel;
}

export type ResolvedPlanApplyTarget =
  | {
      readonly kind: "modify";
      readonly relPath: string;
      readonly absPath: string;
    }
  | {
      readonly kind: "create";
      readonly relPath: string;
      readonly absPath: string;
    }
  | {
      readonly kind: "rejected";
      readonly relPath: string;
      readonly reason: string;
      readonly rejectKind: "scaffold" | "unsafe";
    };

export function resolvePlanApplyTarget(
  planPath: string,
  scan: ProjectScan,
  userPrompt: string,
  projectPath?: string | null,
): ResolvedPlanApplyTarget | null {
  const normalized = normalizePlanPath(planPath);
  const indexed = resolvePlanFilePath(planPath, scan);
  if (indexed) {
    return {
      kind: "modify",
      relPath: indexed.relPath,
      absPath: indexed.absPath,
    };
  }

  if (isScaffoldConfigFollowUpPath(normalized, userPrompt)) {
    return {
      kind: "rejected",
      relPath: normalized,
      reason: `${SCAFFOLD_TARGET_SKIPPED_LABEL}: ${normalized}`,
      rejectKind: "scaffold",
    };
  }

  if (!isFollowUpCreatableSourcePath(normalized)) {
    return {
      kind: "rejected",
      relPath: normalized,
      reason: `${CREATE_TARGET_REJECTED_LABEL}: ${normalized} is not an allowed follow-up create path`,
      rejectKind: "unsafe",
    };
  }

  return {
    kind: "create",
    relPath: normalized,
    absPath: joinProjectRelPath(projectPath, normalized),
  };
}

/** Infer new source files from feature-addition phrasing when the plan omits them. */
export function inferCreatePathsFromPrompt(prompt: string): readonly string[] {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return [];
  const lower = trimmed.toLowerCase();
  const paths = new Set<string>();

  if (
    (/\bhistory\b/.test(lower) && /\bcomponent\b/.test(lower)) ||
    /\bcreate\s+(a\s+)?separate\s+history\b/i.test(trimmed) ||
    /\badd\s+calculation\s+history\b/i.test(trimmed)
  ) {
    paths.add("src/components/History.tsx");
  }

  return [...paths];
}
