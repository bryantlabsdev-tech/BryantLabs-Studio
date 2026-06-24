import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner/types";
import type { ProjectScan } from "@/types";
import { rankSmartFiles } from "@/core/fileSelection";
import {
  mergeCandidatesWithSmartSelection,
  SMART_SELECTION_MAX,
} from "@/core/planApply/smartTargets";
import {
  type PlanApplyTargetAction,
  inferCreatePathsFromPrompt,
  resolvePlanApplyTarget,
} from "@/core/planApply/createFileTargets";
import { resolvePlanFilePath } from "@/core/planApply/resolve";
import { isGameplayApplyPrompt } from "@/core/planApply/applyIntent";
import { isFunctionalFeaturePrompt } from "@/core/planner/fallback";
import {
  buildGameplayAllowlist,
  buildUiOnlyAllowlist,
  CONFIG_UI_BLOCK_MESSAGE,
  filterPlanApplyTargets,
  isBlockedNonUiTarget,
  isConfigPackageTarget,
  isUiCorePatchTarget,
  isUiOnlyApplyPrompt,
  SELECTION_REASON,
  type PlanApplyTargetCandidate,
} from "@/core/planApply/targetPolicy";

export const MAX_PLAN_APPLY_FILES = 8;

export interface PlanApplyTarget {
  relPath: string;
  absPath: string;
  /** Defaults to modify when omitted. */
  action?: PlanApplyTargetAction;
  /** Combined plan + selection rationale (shown before proposing patches). */
  reason: string;
  selectionReason: string;
  planReason: string;
  relevanceScore?: number;
  symbolMatches?: readonly string[];
}

const NARROWED_RETRY_MAX = 3;

function symbolMatchesForPath(
  scan: ProjectScan,
  absPath: string,
): string[] {
  return scan.symbols
    .filter((s) => s.absPath === absPath)
    .map((s) => `${s.name} (${s.kind})`)
    .slice(0, 8);
}

function targetFromCandidate(
  c: PlanApplyTargetCandidate,
  scan: ProjectScan,
  relevanceScore?: number,
): PlanApplyTarget {
  const symbolMatches = symbolMatchesForPath(scan, c.absPath);
  return {
    relPath: c.relPath,
    absPath: c.absPath,
    action: c.action ?? "modify",
    selectionReason: c.selectionReason,
    planReason: c.planReason,
    reason: formatApplyTargetReason(c.selectionReason, c.planReason),
    ...(relevanceScore !== undefined ? { relevanceScore } : {}),
    ...(symbolMatches.length > 0 ? { symbolMatches } : {}),
  };
}

function recordBlockedPlanFiles(
  files: readonly { path: string }[],
  scan: ProjectScan,
  skipped: string[],
): void {
  for (const f of files) {
    const resolved = resolvePlanFilePath(f.path, scan);
    if (!resolved) continue;
    if (isBlockedNonUiTarget(resolved.relPath)) {
      skipped.push(`${resolved.relPath}: ${CONFIG_UI_BLOCK_MESSAGE}`);
    }
  }
}

export function collectPlanApplyTargets(
  plan: Plan,
  aiPlan: AIPlanResult | null,
  scan: ProjectScan,
  userPrompt: string,
  opts?: {
    projectPath?: string | null;
    projectMemory?: import("@/core/projectMemory/types").ProjectMemory | null;
    sessionMemory?: import("@/core/sessionMemory/types").SessionMemorySnapshot | null;
  },
): {
  prompt: string;
  summary: string;
  source: "ai" | "deterministic";
  targets: PlanApplyTarget[];
  skipped: string[];
} {
  const prompt = userPrompt.trim();
  const promptLower = prompt.toLowerCase();
  const functional = isFunctionalFeaturePrompt(promptLower);
  const uiOnly = isUiOnlyApplyPrompt(prompt) && !functional;
  const skipped: string[] = [];

  if (uiOnly) {
    const planFilesForDiagnostics =
      aiPlan?.ok && aiPlan.plan?.files.length ? aiPlan.plan.files : plan.files;
    recordBlockedPlanFiles(planFilesForDiagnostics, scan, skipped);

    const allowlist = buildUiOnlyAllowlist(scan, promptLower);
    const allowPaths = new Set(allowlist.map((t) => t.relPath));
    const allowByPath = new Map(allowlist.map((t) => [t.relPath, t]));

    const plannedPaths = new Set<string>();
    const addPlannedPath = (path: string) => {
      const resolved = resolvePlanFilePath(path, scan);
      if (resolved) plannedPaths.add(resolved.relPath);
    };
    if (aiPlan?.ok && aiPlan.plan) {
      for (const f of aiPlan.plan.files) addPlannedPath(f.path);
    }
    for (const f of plan.files) addPlannedPath(f.path);

    const plannedAllowlisted =
      plannedPaths.size > 0
        ? [...plannedPaths].filter((relPath) => allowPaths.has(relPath))
        : [];
    const targetPaths =
      plannedAllowlisted.length > 0
        ? plannedAllowlisted
        : [...allowPaths].filter((relPath) => isUiCorePatchTarget(relPath));

    const targets: PlanApplyTarget[] = targetPaths
      .map((relPath) => allowByPath.get(relPath))
      .filter((candidate): candidate is PlanApplyTargetCandidate => Boolean(candidate))
      .map((candidate) => targetFromCandidate(candidate, scan));

    for (const f of planFilesForDiagnostics) {
      const resolved = resolvePlanFilePath(f.path, scan);
      if (!resolved || allowPaths.has(resolved.relPath)) continue;
      if (isBlockedNonUiTarget(resolved.relPath)) {
        skipped.push(`${resolved.relPath}: ${CONFIG_UI_BLOCK_MESSAGE}`);
      } else {
        skipped.push(
          `${resolved.relPath}: Not in UI allowlist (src/App.tsx, src/index.css, src/App.css only)`,
        );
      }
    }

    return {
      prompt,
      summary: aiPlan?.ok && aiPlan.plan ? aiPlan.plan.summary : plan.summary,
      source: aiPlan?.ok && aiPlan.plan?.files.length ? ("ai" as const) : ("deterministic" as const),
      targets,
      skipped,
    };
  }

  if (aiPlan?.ok && aiPlan.plan) {
    for (const f of aiPlan.plan.files) {
      const resolved = resolvePlanFilePath(f.path, scan);
      if (resolved && isConfigPackageTarget(resolved.relPath)) {
        skipped.push(`${resolved.relPath}: ${CONFIG_UI_BLOCK_MESSAGE}`);
      }
    }
  }

  const useAi = Boolean(aiPlan?.ok && aiPlan.plan && aiPlan.plan.files.length > 0);
  const summary = useAi ? aiPlan!.plan!.summary : plan.summary;
  const source = useAi ? ("ai" as const) : ("deterministic" as const);

  const rawFiles = useAi
    ? aiPlan!.plan!.files.map((f) => ({
        path: f.path,
        planReason: f.reason,
        selectionReason: SELECTION_REASON.aiPlan,
      }))
    : plan.files.map((f) => ({
        path: f.path,
        planReason: f.reasons.join("; ") || "Listed in deterministic plan",
        selectionReason: SELECTION_REASON.deterministicPlan,
        relevanceScore: f.score,
      }));

  const inferredCreate = inferCreatePathsFromPrompt(prompt).filter(
    (path) => !rawFiles.some((entry) => resolvePlanFilePath(entry.path, scan)?.relPath === path),
  );
  const mergedEntries = [
    ...rawFiles,
    ...inferredCreate.map((path) => ({
      path,
      planReason: "Inferred new source file from follow-up prompt",
      selectionReason: SELECTION_REASON.inferredCreate,
    })),
  ];

  const scoreByRelPath = new Map<string, number>();
  for (const entry of mergedEntries) {
    const resolved = resolvePlanFilePath(entry.path, scan);
    if (!resolved) continue;
    const score = "relevanceScore" in entry ? entry.relevanceScore : undefined;
    if (score !== undefined) scoreByRelPath.set(resolved.relPath, score);
  }

  const candidates: PlanApplyTargetCandidate[] = [];
  const seen = new Set<string>();

  for (const entry of mergedEntries.slice(0, MAX_PLAN_APPLY_FILES)) {
    const resolved = resolvePlanApplyTarget(
      entry.path,
      scan,
      prompt,
      opts?.projectPath,
    );
    if (!resolved) {
      skipped.push(`${entry.path} (not found in project index)`);
      continue;
    }
    if (resolved.kind === "rejected") {
      skipped.push(`${resolved.relPath}: ${resolved.reason}`);
      continue;
    }
    if (seen.has(resolved.relPath)) continue;
    seen.add(resolved.relPath);
    candidates.push({
      relPath: resolved.relPath,
      absPath: resolved.absPath,
      planReason: entry.planReason,
      selectionReason:
        resolved.kind === "create"
          ? entry.selectionReason === SELECTION_REASON.inferredCreate
            ? SELECTION_REASON.inferredCreate
            : SELECTION_REASON.createTarget
          : entry.selectionReason,
      action: resolved.kind,
    });
  }

  if (opts?.projectMemory && opts.sessionMemory && prompt) {
    const selection = rankSmartFiles(prompt, scan, {
      projectPath: opts.projectPath ?? null,
      projectMemory: opts.projectMemory,
      sessionMemory: opts.sessionMemory,
      maxFiles: SMART_SELECTION_MAX,
    });
    for (const f of selection.files) {
      scoreByRelPath.set(f.path, f.score);
    }
  }

  const withSmart =
    opts?.projectMemory && opts.sessionMemory
      ? mergeCandidatesWithSmartSelection(candidates, seen, scan, prompt, {
          projectPath: opts.projectPath ?? null,
          projectMemory: opts.projectMemory,
          sessionMemory: opts.sessionMemory,
        })
      : candidates;

  const filtered = filterPlanApplyTargets(withSmart, scan, prompt, skipped);

  const targets: PlanApplyTarget[] = filtered
    .map((c) => targetFromCandidate(c, scan, scoreByRelPath.get(c.relPath)))
    .sort(
      (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
    )
    .slice(0, MAX_PLAN_APPLY_FILES);

  if (isGameplayApplyPrompt(prompt)) {
    const seenPaths = new Set(targets.map((t) => t.relPath));
    for (const allowed of buildGameplayAllowlist(scan, promptLower)) {
      if (seenPaths.has(allowed.relPath)) continue;
      seenPaths.add(allowed.relPath);
      targets.push(targetFromCandidate(allowed, scan));
    }
  }

  return { prompt, summary, source, targets, skipped };
}

export function formatApplyTargetReason(
  selectionReason: string,
  planReason: string,
): string {
  if (!planReason || planReason === selectionReason) return selectionReason;
  return `${selectionReason} — ${planReason}`;
}

export interface PlanApplyTargetReport {
  readonly plannedFiles: readonly string[];
  readonly allowlistedFiles: readonly string[];
  readonly patchTargets: readonly string[];
  readonly rejectedFiles: readonly string[];
}

export function buildPlanApplyTargetReport(input: {
  readonly plan: Plan;
  readonly aiPlan: AIPlanResult | null;
  readonly targets: readonly PlanApplyTarget[];
  readonly skipped: readonly string[];
}): PlanApplyTargetReport {
  const planned = new Set<string>();
  if (input.aiPlan?.ok && input.aiPlan.plan?.files.length) {
    for (const file of input.aiPlan.plan.files) planned.add(file.path);
  } else {
    for (const file of input.plan.files) planned.add(file.path);
  }
  const rejected = input.skipped.map((msg) => msg.split(":")[0]?.trim() ?? msg);
  return {
    plannedFiles: [...planned],
    allowlistedFiles: input.targets.map((target) => target.relPath),
    patchTargets: input.targets.map((target) => target.relPath),
    rejectedFiles: rejected,
  };
}

export function formatPlanApplyTargetReport(report: PlanApplyTargetReport): string {
  return [
    `plannedFiles: ${report.plannedFiles.join(", ") || "—"}`,
    `allowlistedFiles: ${report.allowlistedFiles.join(", ") || "—"}`,
    `patchTargets: ${report.patchTargets.join(", ") || "—"}`,
    `rejectedFiles: ${report.rejectedFiles.join(", ") || "—"}`,
  ].join("\n");
}

export function parsePlanApplyTargetReport(details: string): PlanApplyTargetReport | null {
  const values = new Map<string, string>();
  for (const line of details.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx < 0) continue;
    values.set(line.slice(0, idx).trim(), line.slice(idx + 2).trim());
  }
  if (!values.has("patchTargets") && !values.has("plannedFiles")) return null;
  const split = (key: string): string[] => {
    const raw = values.get(key);
    if (!raw || raw === "—") return [];
    return raw.split(",").map((part) => part.trim()).filter(Boolean);
  };
  return {
    plannedFiles: split("plannedFiles"),
    allowlistedFiles: split("allowlistedFiles"),
    patchTargets: split("patchTargets"),
    rejectedFiles: split("rejectedFiles"),
  };
}

/** UI-only retry: App.tsx + index.css only. */
export function buildUiOnlyRetryTargets(
  scan: ProjectScan,
  prompt: string,
): PlanApplyTarget[] {
  const promptLower = prompt.toLowerCase();
  return buildUiOnlyAllowlist(scan, promptLower)
    .filter(
      (t) => t.relPath === "src/App.tsx" || t.relPath === "src/index.css",
    )
    .map((c) => targetFromCandidate(c, scan));
}

/**
 * One-shot narrowed retry: highest-relevance deterministic plan files,
 * top AI plan files, or UI-only App.tsx + index.css.
 */
export function buildNarrowedRetryTargets(
  plan: Plan,
  aiPlan: AIPlanResult | null,
  scan: ProjectScan,
  userPrompt: string,
  opts?: {
    projectPath?: string | null;
    projectMemory?: import("@/core/projectMemory/types").ProjectMemory | null;
    sessionMemory?: import("@/core/sessionMemory/types").SessionMemorySnapshot | null;
  },
): PlanApplyTarget[] {
  if (isUiOnlyApplyPrompt(userPrompt)) {
    const ui = buildUiOnlyRetryTargets(scan, userPrompt);
    if (ui.length > 0) return ui;
  }

  const useAi = Boolean(aiPlan?.ok && aiPlan.plan && aiPlan.plan.files.length > 0);

  if (useAi) {
    const out: PlanApplyTarget[] = [];
    for (const f of aiPlan!.plan!.files.slice(0, NARROWED_RETRY_MAX)) {
      const resolved = resolvePlanFilePath(f.path, scan);
      if (!resolved) continue;
      const selectionReason = "Retry: narrowed to top AI plan files";
      out.push({
        relPath: resolved.relPath,
        absPath: resolved.absPath,
        action: "modify",
        selectionReason,
        planReason: f.reason,
        reason: formatApplyTargetReason(selectionReason, f.reason),
        symbolMatches: symbolMatchesForPath(scan, resolved.absPath),
      });
    }
    return out;
  }

  if (opts?.projectMemory && opts.sessionMemory && userPrompt.trim()) {
    const smart = rankSmartFiles(userPrompt, scan, {
      projectPath: opts.projectPath ?? null,
      projectMemory: opts.projectMemory,
      sessionMemory: opts.sessionMemory,
      maxFiles: NARROWED_RETRY_MAX,
    });
    return smart.files.map((f) => {
      const selectionReason = `Retry: smart selection (score ${f.score})`;
      return {
        relPath: f.path,
        absPath: f.absPath,
        action: "modify" as const,
        selectionReason,
        planReason: f.primaryReason,
        reason: formatApplyTargetReason(selectionReason, f.primaryReason),
        relevanceScore: f.score,
        symbolMatches: symbolMatchesForPath(scan, f.absPath),
      };
    });
  }

  const ranked = [...plan.files]
    .map((f) => {
      const resolved = resolvePlanFilePath(f.path, scan);
      if (!resolved) return null;
      return { file: f, resolved };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.file.score - a.file.score)
    .slice(0, NARROWED_RETRY_MAX);

  return ranked.map(({ file, resolved }) => {
    const selectionReason = `Retry: narrowed to highest-relevance plan file (score ${file.score})`;
    const planReason = file.reasons.join("; ") || "Listed in deterministic plan";
    return {
      relPath: resolved.relPath,
      absPath: resolved.absPath,
      action: "modify" as const,
      selectionReason,
      planReason,
      reason: formatApplyTargetReason(selectionReason, planReason),
      relevanceScore: file.score,
      symbolMatches: symbolMatchesForPath(scan, resolved.absPath),
    };
  });
}
