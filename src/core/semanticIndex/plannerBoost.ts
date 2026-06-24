import type { BryantLabsApi } from "@/types";

const DEFAULT_SEMANTIC_LIMIT = 12;

/** Fetch semantic search paths to boost planner and file-selection ranking. */
export async function fetchSemanticBoostPaths(
  api: BryantLabsApi | undefined,
  prompt: string,
  limit = DEFAULT_SEMANTIC_LIMIT,
): Promise<readonly string[]> {
  const trimmed = prompt.trim();
  if (!api?.semanticSearch || trimmed.length < 4) return [];
  try {
    const hits = await api.semanticSearch(trimmed, limit);
    return hits.map((hit) => hit.path);
  } catch {
    return [];
  }
}
