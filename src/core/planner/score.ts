import type { FileIndex, ProjectScan } from "@/types";
import type { PlanFile } from "@/core/planner/types";
import type { DetectedIntent } from "@/core/planner/intents";

const WEIGHT = {
  filenameBase: 5,
  filenamePath: 2,
  symbol: 4,
  intentFile: 4,
  intentSymbol: 3,
  neighbor: 2,
} as const;

/** Score at/above which a file is considered a strong "seed" for the graph. */
const STRONG_THRESHOLD = 5;
const MAX_REASONS = 5;

interface Mutable {
  path: string;
  absPath: string;
  score: number;
  reasons: string[];
}

function baseName(relPath: string): string {
  const last = relPath.split(/[/\\]/).pop() ?? relPath;
  return last.replace(/\.[^.]+$/, "");
}

function addReason(file: Mutable, reason: string): void {
  if (file.reasons.length >= MAX_REASONS) return;
  if (!file.reasons.includes(reason)) file.reasons.push(reason);
}

function symbolNames(index: FileIndex | undefined): string[] {
  if (!index) return [];
  return [
    ...index.components,
    ...index.functions,
    ...index.exports,
    ...(index.hooks ?? []),
    ...(index.classes ?? []),
    ...(index.interfaces ?? []),
    ...(index.types ?? []),
  ];
}

/** Build a basename → relative-paths map for lightweight import resolution. */
function buildBasenameMap(scan: ProjectScan): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of scan.files) {
    const key = baseName(file.path).toLowerCase();
    const list = map.get(key) ?? [];
    list.push(file.path);
    map.set(key, list);
  }
  return map;
}

/** Undirected adjacency between files connected via local imports. */
function buildImportGraph(scan: ProjectScan): Map<string, Set<string>> {
  const basenameMap = buildBasenameMap(scan);
  const graph = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    (graph.get(a) ?? graph.set(a, new Set()).get(a)!).add(b);
    (graph.get(b) ?? graph.set(b, new Set()).get(b)!).add(a);
  };

  for (const file of scan.index) {
    for (const spec of file.imports) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue; // local only
      const targetBase = baseName(spec).toLowerCase();
      const targets = basenameMap.get(targetBase);
      if (!targets) continue;
      for (const target of targets) link(file.path, target);
    }
  }
  return graph;
}

export function scoreFiles(
  tokens: string[],
  intent: DetectedIntent,
  scan: ProjectScan,
): PlanFile[] {
  const indexByPath = new Map(scan.index.map((f) => [f.path, f]));
  const files = new Map<string, Mutable>();

  for (const entry of scan.files) {
    const relLower = entry.path.toLowerCase();
    const baseLower = baseName(entry.path).toLowerCase();
    const file: Mutable = {
      path: entry.path,
      absPath: entry.absPath,
      score: 0,
      reasons: [],
    };

    const names = symbolNames(indexByPath.get(entry.path));
    const namesLower = names.map((n) => n.toLowerCase());

    // Token matches against filename / path.
    for (const token of tokens) {
      if (baseLower.includes(token)) {
        file.score += WEIGHT.filenameBase;
        addReason(file, `Filename matches "${token}"`);
      } else if (relLower.includes(token)) {
        file.score += WEIGHT.filenamePath;
        addReason(file, `Path matches "${token}"`);
      }
    }

    // Token matches against the file's symbols.
    for (const token of tokens) {
      const hitIndex = namesLower.findIndex((n) => n.includes(token));
      if (hitIndex >= 0) {
        file.score += WEIGHT.symbol;
        addReason(file, `Defines symbol "${names[hitIndex]}" matching "${token}"`);
      }
    }

    // Intent-driven file pattern.
    if (intent.rule.filePatterns.some((re) => re.test(entry.path))) {
      file.score += WEIGHT.intentFile;
      addReason(file, `Typical location for: ${intent.rule.label}`);
    }

    // Intent-driven symbol pattern.
    const intentSymbol = names.find((n) =>
      intent.rule.symbolPatterns.some((re) => re.test(n)),
    );
    if (intentSymbol) {
      file.score += WEIGHT.intentSymbol;
      addReason(file, `Defines ${intent.rule.label}-related symbol "${intentSymbol}"`);
    }

    files.set(entry.path, file);
  }

  // Import-graph propagation: strengthen candidates adjacent to strong seeds.
  const graph = buildImportGraph(scan);
  const seeds = [...files.values()].filter((f) => f.score >= STRONG_THRESHOLD);
  for (const seed of seeds) {
    const neighbors = graph.get(seed.path);
    if (!neighbors) continue;
    for (const neighborPath of neighbors) {
      const neighbor = files.get(neighborPath);
      if (!neighbor || neighbor.score <= 0 || neighbor.score >= STRONG_THRESHOLD) {
        continue;
      }
      neighbor.score += WEIGHT.neighbor;
      addReason(neighbor, `Linked via imports to ${baseName(seed.path)}`);
    }
  }

  return [...files.values()]
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      absPath: f.absPath,
      score: Math.round(f.score * 10) / 10,
      reasons: f.reasons,
    }));
}
