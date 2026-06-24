import {
  parseComposerMentions,
  resolveMentionToProjectPath,
  resolveSymbolMentionPaths,
} from "@/core/agent/composerMentions";
import { hasCodebaseMention, promptForCodebaseSearch } from "@/core/agent/codebaseMention";
import { computeRepositoryRelevance } from "@/core/repository/relevance";
import { fetchSemanticBoostPaths } from "@/core/semanticIndex/plannerBoost";
import type { PlanContext } from "@/core/planner/aiTypes";
import type { BryantLabsApi, ProjectScan } from "@/types";

const MAX_PINNED_FILES = 5;
const MAX_CHARS_PER_FILE = 12_000;

export interface ReferencedFileContent {
  readonly path: string;
  readonly content: string;
}

export function resolveContextContentPaths(
  prompt: string,
  scan: ProjectScan,
  relevantFiles?: readonly { readonly path: string }[],
): readonly string[] {
  const fromMentions = parseComposerMentions(prompt)
    .map((m) => resolveMentionToProjectPath(m, scan))
    .filter((p): p is string => Boolean(p));
  const fromSymbols = resolveSymbolMentionPaths(prompt, scan);
  const fromRelevant = (relevantFiles ?? [])
    .slice(0, 3)
    .map((f) => f.path);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of [...fromMentions, ...fromSymbols, ...fromRelevant]) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
    if (out.length >= MAX_PINNED_FILES) break;
  }
  return out;
}

function mergeUniquePaths(paths: readonly string[], limit = MAX_PINNED_FILES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
    if (out.length >= limit) break;
  }
  return out;
}

/** Async resolver — adds semantic @codebase hits when API is available. */
export async function resolveContextContentPathsAsync(
  prompt: string,
  scan: ProjectScan,
  api: BryantLabsApi | undefined,
  relevantFiles?: readonly { readonly path: string }[],
): Promise<readonly string[]> {
  const base = [...resolveContextContentPaths(prompt, scan, relevantFiles)];
  if (!hasCodebaseMention(prompt)) return base;

  const searchPrompt = promptForCodebaseSearch(prompt);
  const lexical = computeRepositoryRelevance(searchPrompt, scan).files
    .slice(0, 5)
    .map((file) => file.path);
  const semantic = await fetchSemanticBoostPaths(api, searchPrompt, 5);
  return mergeUniquePaths([...base, ...lexical, ...semantic]);
}

export async function readReferencedFileContents(
  api: BryantLabsApi,
  projectRoot: string,
  paths: readonly string[],
): Promise<readonly ReferencedFileContent[]> {
  const root = projectRoot.replace(/\/$/, "");
  const out: ReferencedFileContent[] = [];
  for (const relPath of paths) {
    const abs = `${root}/${relPath}`;
    try {
      const res = await api.readFile(abs);
      if (!res.readable || res.content === undefined) continue;
      out.push({
        path: relPath,
        content: res.content.slice(0, MAX_CHARS_PER_FILE),
      });
    } catch {
      // skip unreadable paths
    }
  }
  return out;
}

export function attachReferencedFileContents(
  context: PlanContext,
  contents: readonly ReferencedFileContent[],
): PlanContext {
  if (contents.length === 0) return context;
  const block = contents
    .map(
      (f) =>
        `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``,
    )
    .join("\n\n");
  const note = `Full contents for pinned / high-priority files (${contents.length}):`;
  return {
    ...context,
    repositoryPrompt: [context.repositoryPrompt, `${note}\n\n${block}`]
      .filter(Boolean)
      .join("\n\n"),
  };
}
