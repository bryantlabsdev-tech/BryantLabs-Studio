import type { ProjectScan } from "@/types";
import type { Plan } from "@/core/planner/types";
import type { PlanContext, PlanAgreement, AIPlan } from "@/core/planner/aiTypes";
import { buildCodeGraphSummary } from "@/core/repository/codeGraph";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { rankSmartFiles } from "@/core/fileSelection";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";

const MAX_CONTEXT_FILES = 250;
const MAX_CONTEXT_SYMBOLS = 200;
const MAX_RELEVANT_FILES = 12;
const MAX_RELEVANT_SYMBOLS = 40;
const MAX_GRAPH_EDGES = 20;

/**
 * Build a compact, read-only project context from a scan. This is the only
 * project information sent to a provider — no file contents, just structure.
 */
/** Minimal project context for Apply Plan batch prompts (avoids huge file lists). */
export function buildApplyPlanPatchContext(scan: ProjectScan): PlanContext {
  return {
    framework: scan.summary.framework,
    language: scan.summary.language,
    bundler: scan.summary.bundler ?? "unknown",
    packageManager: scan.summary.packageManager,
    repositorySummary: scan.repositorySummary,
    dependencies: (scan.dependencies ?? []).slice(0, 24),
    totalFiles: scan.summary.totalFiles,
    totalFolders: scan.summary.totalFolders,
    entryPoints: scan.summary.entryPoints,
    files: [],
    symbols: [],
  };
}

export function buildPlanContext(
  scan: ProjectScan,
  prompt?: string,
  opts?: {
    projectMemory?: ProjectMemory | null;
    sessionMemory?: SessionMemorySnapshot | null;
    projectPath?: string | null;
  },
): PlanContext {
  const base = {
    framework: scan.summary.framework,
    language: scan.summary.language,
    bundler: scan.summary.bundler ?? "unknown",
    packageManager: scan.summary.packageManager,
    repositorySummary: scan.repositorySummary,
    dependencies: (scan.dependencies ?? []).slice(0, 40),
    totalFiles: scan.summary.totalFiles,
    totalFolders: scan.summary.totalFolders,
    entryPoints: scan.summary.entryPoints,
    files: scan.files.slice(0, MAX_CONTEXT_FILES).map((f) => f.path),
    symbols: scan.symbols
      .slice(0, MAX_CONTEXT_SYMBOLS)
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        path: s.path,
        ...(s.line != null ? { line: s.line } : {}),
      })),
  };

  const trimmed = prompt?.trim();
  if (!trimmed) return base;

  const selection = rankSmartFiles(trimmed, scan, {
    projectPath: opts?.projectPath ?? null,
    projectMemory: opts?.projectMemory ?? null,
    sessionMemory: opts?.sessionMemory ?? null,
    maxFiles: MAX_RELEVANT_FILES,
  });
  const codeGraph = buildCodeGraphSummary(buildRepositoryIndex(scan));
  return {
    ...base,
    symbolIntelligenceSummary: codeGraph.narrative,
    repositoryPrompt: trimmed,
    fileSelection: {
      reasoning: selection.reasoning,
      intent: {
        features: [...selection.intent.features],
        components: [...selection.intent.components],
        screens: [...selection.intent.screens],
        functions: [...selection.intent.functions],
        keywords: [...selection.intent.keywords],
        uiElements: [...selection.intent.uiElements],
        businessConcepts: [...selection.intent.businessConcepts],
      },
      selectedFiles: selection.files.slice(0, MAX_RELEVANT_FILES).map((f) => ({
        path: f.path,
        score: f.score,
        primaryReason: f.primaryReason,
        reasons: [...f.reasons],
      })),
    },
    relevantFiles: selection.files.slice(0, MAX_RELEVANT_FILES).map((f) => ({
      path: f.path,
      score: f.score,
      reasons: [...f.reasons],
    })),
    relevantSymbols: selection.symbols
      .slice(0, MAX_RELEVANT_SYMBOLS)
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        path: s.path,
        reason: s.reason,
        ...(s.line != null ? { line: s.line } : {}),
      })),
    referenceGraph: selection.graphEdges
      .slice(0, MAX_GRAPH_EDGES)
      .map((e) => ({
        symbol: e.symbol,
        definedIn: e.definedIn,
        referencedBy: [...e.referencedBy],
      })),
  };
}

function basename(p: string): string {
  const normalized = p.replace(/^\.\//, "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

/**
 * Compare the deterministic and AI plans by likely-affected files. Matching is
 * lenient (by basename) because models often return paths that differ slightly
 * from the indexed form.
 */
export function computeAgreement(
  deterministic: Plan,
  ai: AIPlan,
): PlanAgreement {
  const detNames = deterministic.files.map((f) => basename(f.path));
  const aiNames = ai.files.map((f) => basename(f.path));
  const detSet = new Set(detNames);
  const aiSet = new Set(aiNames);

  const union = new Set([...detSet, ...aiSet]);
  const shared = [...detSet].filter((n) => aiSet.has(n));
  const score =
    union.size === 0 ? 0 : Math.round((shared.length / union.size) * 100);

  return {
    score,
    shared,
    onlyDeterministic: [...detSet].filter((n) => !aiSet.has(n)),
    onlyAI: [...aiSet].filter((n) => !detSet.has(n)),
    confidenceMatch: deterministic.confidence === ai.confidence,
  };
}
