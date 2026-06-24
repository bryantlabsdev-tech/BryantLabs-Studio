import { mergeRepositoryAndSemanticHits } from "@/core/semanticIndex/hybridSearch";
import { searchRepository } from "@/core/repository";
import {
  readReferencedFileContents,
  type ReferencedFileContent,
} from "@/core/context/referencedFileContext";
import type { BryantLabsApi } from "@/types";
import type { RepositoryIndex } from "@/core/repository/types";

/** Max files pre-read before edit planning (raised after incremental index). */
export const DEFAULT_MAX_EXPLORE_FILES = 10;

const MAX_EXPLORE_FILES = DEFAULT_MAX_EXPLORE_FILES;

/** Read top-ranked files before edit planning so the planner sees real code. */
export async function exploreRepositoryBeforeEdit(opts: {
  readonly api: BryantLabsApi;
  readonly projectRoot: string;
  readonly repository: RepositoryIndex;
  readonly prompt: string;
  readonly semanticBoostPaths?: readonly string[];
}): Promise<readonly ReferencedFileContent[]> {
  const { api, projectRoot, repository, prompt, semanticBoostPaths } = opts;
  const lexical = searchRepository(repository, prompt);
  let hits = lexical;
  if (api.semanticSearch) {
    try {
      const semantic = await api.semanticSearch(prompt, 10);
      hits = mergeRepositoryAndSemanticHits(lexical, semantic);
    } catch {
      hits = lexical;
    }
  }

  const paths: string[] = [];
  const seen = new Set<string>();
  for (const path of semanticBoostPaths ?? []) {
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  for (const hit of hits) {
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    paths.push(hit.path);
    if (paths.length >= MAX_EXPLORE_FILES) break;
  }

  if (paths.length === 0) return [];

  const root = projectRoot.replace(/\/$/, "");
  return readReferencedFileContents(api, root, paths);
}
