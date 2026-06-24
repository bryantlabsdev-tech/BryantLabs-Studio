import type { PlanContext } from "@/core/planner/aiTypes";
import { computeRepositoryRelevance } from "@/core/repository/relevance";
import {
  hasCodebaseMention,
  promptForCodebaseSearch,
} from "@/core/agent/codebaseMention";
import type { ProjectScan, SymbolEntry, SymbolKind } from "@/types";

/** Matches @src/App.tsx, @App.tsx, @Dashboard, @useTimer */
const COMPOSER_MENTION_TOKEN_RE = /@([A-Za-z0-9_./-]+)/g;

function isFileMentionToken(token: string): boolean {
  return token.includes("/") || /\.[A-Za-z0-9]+$/.test(token);
}

function parseMentionTokens(prompt: string): {
  readonly files: readonly string[];
  readonly symbols: readonly string[];
} {
  const files = new Set<string>();
  const symbols = new Set<string>();
  for (const match of prompt.matchAll(COMPOSER_MENTION_TOKEN_RE)) {
    const raw = match[1]!.trim().replace(/^\.\//, "");
    if (!raw) continue;
    if (isFileMentionToken(raw)) {
      files.add(raw);
    } else if (raw.toLowerCase() === "codebase") {
      // handled via hasCodebaseMention()
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
      symbols.add(raw);
    }
  }
  return { files: [...files], symbols: [...symbols] };
}

export function parseComposerMentions(prompt: string): readonly string[] {
  return parseMentionTokens(prompt).files;
}

export function parseComposerSymbolMentions(prompt: string): readonly string[] {
  return parseMentionTokens(prompt).symbols;
}

export function resolveMentionToProjectPath(
  mention: string,
  scan: ProjectScan,
): string | null {
  const normalized = mention.replace(/^\.\//, "");
  const exact = scan.files.find((f) => f.path === normalized);
  if (exact) return exact.path;
  const suffix = scan.files.find(
    (f) => f.path.endsWith(`/${normalized}`) || f.path === normalized,
  );
  return suffix?.path ?? null;
}

export function resolveSymbolMention(
  name: string,
  scan: ProjectScan,
): SymbolEntry | null {
  const matches = scan.symbols.filter((symbol) => symbol.name === name);
  if (matches.length === 0) return null;
  const inSrc = matches.find((symbol) => symbol.path.startsWith("src/"));
  return inSrc ?? matches[0]!;
}

export function resolveSymbolMentionPaths(
  prompt: string,
  scan: ProjectScan,
): readonly string[] {
  const paths = new Set<string>();
  for (const name of parseComposerSymbolMentions(prompt)) {
    const resolved = resolveSymbolMention(name, scan);
    if (resolved) paths.add(resolved.path);
  }
  return [...paths];
}

const MAX_MENTION_BOOST = 8;

function pinPath(
  relevantFiles: NonNullable<PlanContext["relevantFiles"]>,
  path: string,
  reason: string,
): NonNullable<PlanContext["relevantFiles"]> {
  const next = [...relevantFiles];
  const existing = next.find((entry) => entry.path === path);
  if (existing) {
    const idx = next.indexOf(existing);
    next.splice(idx, 1);
    next.unshift({
      ...existing,
      score: Math.max(existing.score, 100),
      reasons: [...new Set([...existing.reasons, reason])],
    });
  } else {
    next.unshift({
      path,
      score: 100,
      reasons: [reason],
    });
  }
  return next;
}

/** Pin @-mentioned files and symbols at the top of planner / apply-plan context. */
export function boostComposerMentionsInContext(
  context: PlanContext,
  prompt: string,
  scan: ProjectScan,
): PlanContext {
  const fileMentions = parseComposerMentions(prompt);
  const symbolMentions = parseComposerSymbolMentions(prompt);
  const codebase = hasCodebaseMention(prompt);
  if (fileMentions.length === 0 && symbolMentions.length === 0 && !codebase) {
    return context;
  }

  const resolvedFiles = fileMentions
    .map((mention) => resolveMentionToProjectPath(mention, scan))
    .filter((path): path is string => Boolean(path));

  const resolvedSymbols = symbolMentions
    .map((name) => resolveSymbolMention(name, scan))
    .filter((entry): entry is SymbolEntry => Boolean(entry));

  if (resolvedFiles.length === 0 && resolvedSymbols.length === 0 && !codebase) {
    return context;
  }

  let relevantFiles = [...(context.relevantFiles ?? [])];
  let codebasePaths: string[] = [];
  if (codebase) {
    const relevance = computeRepositoryRelevance(promptForCodebaseSearch(prompt), scan);
    codebasePaths = relevance.files.slice(0, 5).map((file) => file.path);
    for (const path of codebasePaths) {
      relevantFiles = pinPath(relevantFiles, path, "composer @codebase");
    }
  }
  for (const path of resolvedFiles) {
    relevantFiles = pinPath(relevantFiles, path, "composer @-mention");
  }
  for (const symbol of resolvedSymbols) {
    relevantFiles = pinPath(
      relevantFiles,
      symbol.path,
      `composer @${symbol.name}`,
    );
  }

  const files = [...context.files];
  for (const path of resolvedFiles) {
    if (!files.includes(path)) files.unshift(path);
  }
  for (const path of codebasePaths) {
    if (!files.includes(path)) files.unshift(path);
  }
  for (const symbol of resolvedSymbols) {
    if (!files.includes(symbol.path)) files.unshift(symbol.path);
  }

  const notes: string[] = [];
  if (resolvedFiles.length > 0) {
    notes.push(`User pinned files via @-mentions: ${resolvedFiles.join(", ")}`);
  }
  if (resolvedSymbols.length > 0) {
    notes.push(
      `User pinned symbols via @-mentions: ${resolvedSymbols
        .map((symbol) => `${symbol.name} (${symbol.path})`)
        .join(", ")}`,
    );
  }
  if (codebasePaths.length > 0) {
    notes.push(
      `User pinned @codebase — top relevant files: ${codebasePaths.join(", ")}`,
    );
  }

  return {
    ...context,
    relevantFiles: relevantFiles.slice(
      0,
      MAX_MENTION_BOOST + (context.relevantFiles?.length ?? 0),
    ),
    files: files.slice(0, 250),
    repositoryPrompt: [context.repositoryPrompt, ...notes].filter(Boolean).join("\n\n"),
  };
}

export function symbolKindLabel(kind: SymbolKind): string {
  switch (kind) {
    case "component":
      return "Component";
    case "function":
      return "Function";
    case "hook":
      return "Hook";
    case "class":
      return "Class";
    case "interface":
      return "Interface";
    case "type":
      return "Type";
    default:
      return "Symbol";
  }
}
