import type { ProjectScan } from "@/types";
import type { PlanFile } from "@/core/planner/types";
import { tokenize } from "@/core/planner/tokenize";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { isConfigArtifactPath } from "@/core/repository/config";
import {
  detectSymbolFeatures,
  type SymbolFeatureHint,
} from "@/core/repository/symbolFeatures";
import { symbolKey } from "@/core/repository/enrichScan";
import type { RepositoryIndex, RepositoryRelevanceResult } from "@/core/repository/types";

const REPO_WEIGHT = {
  symbolName: 12,
  symbolPartial: 8,
  pathToken: 4,
  referenceGraph: 6,
  importNeighbor: 3,
  stylesheet: 7,
  entryComponent: 6,
  featureSymbol: 14,
  featurePath: 10,
} as const;

const THEME_KEYWORDS = [
  "dark",
  "mode",
  "theme",
  "color",
  "palette",
  "stylesheet",
  "css",
  "style",
  "styling",
  "appearance",
] as const;

const UI_KEYWORDS = [
  "ui",
  "calculator",
  "premium",
  "layout",
  "design",
  "visual",
  "interface",
  "component",
] as const;

function baseName(relPath: string): string {
  const last = relPath.split(/[/\\]/).pop() ?? relPath;
  return last.replace(/\.[^.]+$/, "").toLowerCase();
}

function isStylesheet(path: string): boolean {
  return /\.(css|scss|sass|less)$/i.test(path);
}

function findAppEntry(repo: RepositoryIndex): string | null {
  const hit = repo.scan.files.find((f) => /\/App\.(tsx|jsx)$/i.test(f.path));
  return hit?.path ?? null;
}

function findPrimaryCss(repo: RepositoryIndex): string[] {
  const out: string[] = [];
  for (const f of repo.scan.files) {
    const norm = f.path.replace(/\\/g, "/");
    if (norm.endsWith("src/index.css") || norm.endsWith("src/App.css")) {
      out.push(f.path);
    }
  }
  return out;
}

function upsertFile(
  map: Map<string, PlanFile>,
  path: string,
  absPath: string,
  score: number,
  reason: string,
): void {
  const existing = map.get(path);
  if (existing) {
    existing.score = Math.max(existing.score, score);
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    return;
  }
  map.set(path, { path, absPath, score, reasons: [reason] });
}

/**
 * Repository search: prompt → relevant symbols → relevant files (with graph).
 */
export function computeRepositoryRelevance(
  prompt: string,
  scan: ProjectScan,
): RepositoryRelevanceResult {
  const repo = buildRepositoryIndex(scan);
  const trimmed = prompt.trim();
  const tokens = tokenize(trimmed);
  const promptLower = trimmed.toLowerCase();
  const fileScores = new Map<string, PlanFile>();
  const matchedSymbols: {
    name: string;
    kind: import("@/types").SymbolKind;
    path: string;
    line: number | null;
    reason: string;
  }[] = [];
  const graphEdges: {
    symbol: string;
    definedIn: string;
    referencedBy: string[];
  }[] = [];

  const wantsTheme = THEME_KEYWORDS.some((k) => promptLower.includes(k));
  const wantsUi = UI_KEYWORDS.some((k) => promptLower.includes(k));

  for (const token of tokens) {
    for (const sym of repo.scan.symbols) {
      const symLower = sym.name.toLowerCase();
      if (symLower !== token && !symLower.includes(token)) continue;

      const node = repo.graphBySymbolKey.get(symbolKey(sym.path, sym.name));
      const absPath = repo.absByPath.get(sym.path) ?? sym.absPath;
      const exact = symLower === token;
      const score = exact ? REPO_WEIGHT.symbolName : REPO_WEIGHT.symbolPartial;

      upsertFile(
        fileScores,
        sym.path,
        absPath,
        score,
        exact
          ? `Repository: defines symbol "${sym.name}"`
          : `Repository: symbol "${sym.name}" matches "${token}"`,
      );

      if (!matchedSymbols.some((m) => m.name === sym.name && m.path === sym.path)) {
        matchedSymbols.push({
          name: sym.name,
          kind: sym.kind,
          path: sym.path,
          line: sym.line ?? null,
          reason: exact
            ? `Exact symbol match for "${token}"`
            : `Partial symbol match for "${token}"`,
        });
      }

      if (node) {
        graphEdges.push({
          symbol: sym.name,
          definedIn: sym.path,
          referencedBy: [...node.referencedBy],
        });
        for (const refPath of node.referencedBy) {
          const refAbs = repo.absByPath.get(refPath) ?? refPath;
          upsertFile(
            fileScores,
            refPath,
            refAbs,
            REPO_WEIGHT.referenceGraph,
            `Repository: references "${sym.name}" from ${sym.path}`,
          );
        }
      }
    }

    for (const file of repo.scan.files) {
      if (isConfigArtifactPath(file.path)) continue;
      const relLower = file.path.toLowerCase();
      const baseLower = baseName(file.path);
      if (baseLower.includes(token) || relLower.includes(token)) {
        upsertFile(
          fileScores,
          file.path,
          file.absPath,
          REPO_WEIGHT.pathToken,
          `Repository: path matches "${token}"`,
        );
      }
    }
  }

  if (wantsUi || promptLower.includes("calculator")) {
    const app = findAppEntry(repo);
    if (app) {
      const abs = repo.absByPath.get(app) ?? app;
      upsertFile(
        fileScores,
        app,
        abs,
        REPO_WEIGHT.entryComponent,
        "Repository: React entry component (App)",
      );
    }
    for (const css of findPrimaryCss(repo)) {
      const abs = repo.absByPath.get(css) ?? css;
      upsertFile(
        fileScores,
        css,
        abs,
        REPO_WEIGHT.stylesheet,
        "Repository: primary stylesheet",
      );
    }
  }

  if (wantsTheme) {
    for (const f of repo.scan.files) {
      if (!isStylesheet(f.path)) continue;
      upsertFile(
        fileScores,
        f.path,
        f.absPath,
        REPO_WEIGHT.stylesheet,
        "Repository: stylesheet (theme/style prompt)",
      );
    }
  }

  applySymbolFeatureHints(
    repo,
    detectSymbolFeatures(promptLower),
    fileScores,
    matchedSymbols,
    graphEdges,
  );

  const seeds = [...fileScores.values()].filter((f) => f.score >= 6);
  for (const seed of seeds) {
    const neighbors = repo.importGraph.get(seed.path);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (isConfigArtifactPath(neighbor)) continue;
      const abs = repo.absByPath.get(neighbor) ?? neighbor;
      upsertFile(
        fileScores,
        neighbor,
        abs,
        REPO_WEIGHT.importNeighbor,
        `Repository: import-linked to ${seed.path}`,
      );
    }
  }

  const files = [...fileScores.values()]
    .filter((f) => !isConfigArtifactPath(f.path))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .map((f) => ({
      ...f,
      score: Math.round(f.score * 10) / 10,
    }));

  return {
    prompt: trimmed,
    symbols: matchedSymbols,
    files,
    graphEdges,
  };
}

type MatchedSymbol = {
  name: string;
  kind: import("@/types").SymbolKind;
  path: string;
  line: number | null;
  reason: string;
};

function pushMatchedSymbol(
  matchedSymbols: MatchedSymbol[],
  sym: import("@/types").SymbolEntry,
  reason: string,
): void {
  if (matchedSymbols.some((m) => m.name === sym.name && m.path === sym.path)) {
    return;
  }
  matchedSymbols.push({
    name: sym.name,
    kind: sym.kind,
    path: sym.path,
    line: sym.line ?? null,
    reason,
  });
}

function applySymbolFeatureHints(
  repo: RepositoryIndex,
  hints: readonly SymbolFeatureHint[],
  fileScores: Map<string, PlanFile>,
  matchedSymbols: MatchedSymbol[],
  graphEdges: {
    symbol: string;
    definedIn: string;
    referencedBy: string[];
  }[],
): void {
  if (hints.length === 0) return;

  for (const hint of hints) {
    for (const sym of repo.scan.symbols) {
      const nameMatch = hint.symbolNames.some(
        (n) => n.toLowerCase() === sym.name.toLowerCase(),
      );
      const pathMatch = hint.pathFragments.some((frag) =>
        sym.path.toLowerCase().includes(frag),
      );
      if (!nameMatch && !pathMatch) continue;

      const absPath = repo.absByPath.get(sym.path) ?? sym.absPath;
      upsertFile(
        fileScores,
        sym.path,
        absPath,
        REPO_WEIGHT.featureSymbol,
        `Symbol intelligence: ${hint.id} feature → "${sym.name}"`,
      );
      pushMatchedSymbol(
        matchedSymbols,
        sym,
        `Feature hint "${hint.id}" matched symbol "${sym.name}"`,
      );

      const node = repo.graphBySymbolKey.get(symbolKey(sym.path, sym.name));
      if (node && node.referencedBy.length > 0) {
        graphEdges.push({
          symbol: sym.name,
          definedIn: sym.path,
          referencedBy: [...node.referencedBy],
        });
        for (const refPath of node.referencedBy) {
          const refAbs = repo.absByPath.get(refPath) ?? refPath;
          upsertFile(
            fileScores,
            refPath,
            refAbs,
            REPO_WEIGHT.referenceGraph,
            `Symbol intelligence: references "${sym.name}"`,
          );
        }
      }
    }

    for (const file of repo.scan.files) {
      if (isConfigArtifactPath(file.path)) continue;
      const pathLower = file.path.toLowerCase();
      if (!hint.pathFragments.some((frag) => pathLower.includes(frag))) continue;
      upsertFile(
        fileScores,
        file.path,
        file.absPath,
        REPO_WEIGHT.featurePath,
        `Symbol intelligence: ${hint.id} feature path`,
      );
    }
  }
}

