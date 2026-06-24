import type { ProjectScan } from "@/types";
import type { PlanFile } from "@/core/planner/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import { computeRepositoryRelevance } from "@/core/repository/relevance";
import { isConfigArtifactPath } from "@/core/repository/config";
import {
  detectPromptIntent,
  formatIntentSummary,
} from "@/core/fileSelection/intent";
import { historyBoostForPath } from "@/core/fileSelection/history";
import type {
  RankedFile,
  SmartFileSelectionResult,
} from "@/core/fileSelection/types";

const MEMORY_BOOST = 6;
const SESSION_MODIFIED_BOOST = 5;
const SEMANTIC_BOOST = 8;
const MAX_FILES = 24;

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return (parts[parts.length - 1] ?? path).replace(/\.[^.]+$/, "");
}

function memoryMentionsPath(memory: ProjectMemory, path: string): boolean {
  const blob = [
    memory.architecture,
    memory.notes,
    memory.userPreferences,
  ]
    .join(" ")
    .toLowerCase();
  const base = basename(path).toLowerCase();
  const norm = path.toLowerCase();
  return blob.includes(base) || blob.includes(norm);
}

function buildReasoning(
  intentSummary: string,
  topFiles: readonly RankedFile[],
): string {
  if (topFiles.length === 0) {
    return `No strong file matches for intent (${intentSummary}).`;
  }
  const names = topFiles
    .slice(0, 3)
    .map((f) => f.path.split("/").pop() ?? f.path)
    .join(", ");
  return `Matched ${intentSummary}. Top targets: ${names}.`;
}

function normalizeScores(
  files: { path: string; absPath: string; raw: number; reasons: string[] }[],
): RankedFile[] {
  if (files.length === 0) return [];
  const maxRaw = Math.max(...files.map((f) => f.raw), 1);
  return files
    .map((f) => {
      const score = Math.round((f.raw / maxRaw) * 100);
      const primaryReason = f.reasons[0] ?? "Ranked by relevance";
      return {
        path: f.path,
        absPath: f.absPath,
        score,
        reasons: f.reasons,
        primaryReason,
      };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/**
 * Smart file ranking: repository + symbol intelligence + memory + history.
 */
export function rankSmartFiles(
  prompt: string,
  scan: ProjectScan,
  opts?: {
    projectPath?: string | null;
    projectMemory?: ProjectMemory | null;
    sessionMemory?: SessionMemorySnapshot | null;
    maxFiles?: number;
    semanticBoostPaths?: readonly string[];
  },
): SmartFileSelectionResult {
  const trimmed = prompt.trim();
  const promptLower = trimmed.toLowerCase();
  const intent = detectPromptIntent(trimmed);
  const base = computeRepositoryRelevance(trimmed, scan);
  const maxFiles = opts?.maxFiles ?? MAX_FILES;

  const rawByPath = new Map<
    string,
    { absPath: string; raw: number; reasons: string[] }
  >();

  const upsert = (path: string, absPath: string, add: number, reason: string) => {
    if (isConfigArtifactPath(path)) return;
    const cur = rawByPath.get(path);
    if (cur) {
      cur.raw += add;
      if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    } else {
      rawByPath.set(path, { absPath, raw: add, reasons: [reason] });
    }
  };

  for (const file of base.files) {
    upsert(file.path, file.absPath, file.score, file.reasons[0] ?? "Repository relevance");
    for (const r of file.reasons.slice(1)) {
      upsert(file.path, file.absPath, 0.5, r);
    }
  }

  for (const path of opts?.semanticBoostPaths ?? []) {
    const hit = scan.files.find((f) => f.path === path);
    if (hit) {
      upsert(hit.path, hit.absPath, SEMANTIC_BOOST, "Semantic search match");
    }
  }

  const memory = opts?.projectMemory;
  if (memory) {
    for (const file of scan.files) {
      if (memoryMentionsPath(memory, file.path)) {
        upsert(
          file.path,
          file.absPath,
          MEMORY_BOOST,
          "Mentioned in project memory",
        );
      }
    }
  }

  const session = opts?.sessionMemory;
  if (session) {
    for (const mod of session.modifiedFiles) {
      const hit = scan.files.find(
        (f) => f.path === mod || f.path.endsWith(mod),
      );
      if (hit) {
        upsert(
          hit.path,
          hit.absPath,
          SESSION_MODIFIED_BOOST,
          "Recently modified in this session",
        );
      }
    }
  }

  const projectPath = opts?.projectPath ?? null;
  for (const [path, data] of rawByPath) {
    const hist = historyBoostForPath(path, projectPath, promptLower);
    if (hist.boost > 0 && hist.reason) {
      upsert(path, data.absPath, hist.boost, hist.reason);
    }
  }

  const ranked = normalizeScores(
    [...rawByPath.entries()].map(([path, v]) => ({
      path,
      absPath: v.absPath,
      raw: v.raw,
      reasons: v.reasons,
    })),
  ).slice(0, maxFiles);

  const intentSummary = formatIntentSummary(intent);
  const reasoning = buildReasoning(intentSummary, ranked);

  return {
    prompt: trimmed,
    intent,
    reasoning,
    files: ranked,
    symbols: base.symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      path: s.path,
      line: s.line,
      reason: s.reason,
    })),
    graphEdges: base.graphEdges.map((e) => ({
      symbol: e.symbol,
      definedIn: e.definedIn,
      referencedBy: [...e.referencedBy],
    })),
  };
}

export function rankFilesFromRepository(
  prompt: string,
  scan: ProjectScan,
  opts?: Parameters<typeof rankSmartFiles>[2],
): PlanFile[] {
  return rankSmartFiles(prompt, scan, opts).files.map((f) => ({
    path: f.path,
    absPath: f.absPath,
    score: f.score,
    reasons: [...f.reasons],
  }));
}

export function topRankedFiles(
  selection: SmartFileSelectionResult,
  limit: number,
): readonly RankedFile[] {
  return selection.files.slice(0, limit);
}
