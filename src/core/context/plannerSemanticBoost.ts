import { hasCodebaseMention, promptForCodebaseSearch } from "@/core/agent/codebaseMention";
import { computeRepositoryRelevance } from "@/core/repository/relevance";
import { fetchSemanticBoostPaths } from "@/core/semanticIndex/plannerBoost";
import type { BryantLabsApi, ProjectScan } from "@/types";

function mergeUnique(paths: readonly string[], limit: number): string[] {
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

/** Semantic + @codebase lexical paths for planner / file-selection ranking. */
export async function resolvePlannerSemanticBoostPaths(
  api: BryantLabsApi | undefined,
  prompt: string,
  scan: ProjectScan | null,
  limit = 8,
): Promise<readonly string[]> {
  const trimmed = prompt.trim();
  if (!trimmed) return [];

  const searchPrompt = hasCodebaseMention(trimmed)
    ? promptForCodebaseSearch(trimmed)
    : trimmed;
  const semantic = await fetchSemanticBoostPaths(api, searchPrompt, limit);

  if (!scan || !hasCodebaseMention(trimmed)) return semantic;

  const lexical = computeRepositoryRelevance(searchPrompt, scan)
    .files.slice(0, 5)
    .map((file) => file.path);
  return mergeUnique([...lexical, ...semantic], limit);
}
