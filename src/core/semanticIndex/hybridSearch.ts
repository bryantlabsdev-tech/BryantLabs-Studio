import type { RepositorySearchHit } from "@/core/repository/types";
import type { SemanticSearchHit } from "@/core/semanticIndex/types";

const MAX_MERGED = 24;

function hitKey(path: string, symbolName?: string | null): string {
  return `${path}::${symbolName ?? ""}`;
}

/**
 * Merge lexical repository hits with semantic index hits (semantic boosts score).
 */
export function mergeRepositoryAndSemanticHits(
  lexical: readonly RepositorySearchHit[],
  semantic: readonly SemanticSearchHit[],
): RepositorySearchHit[] {
  const merged = new Map<string, RepositorySearchHit>();

  for (const hit of lexical) {
    merged.set(hitKey(hit.path, hit.symbolName), { ...hit });
  }

  for (const hit of semantic) {
    const key = hitKey(hit.path, hit.symbolName);
    const semanticBoost = Math.round(hit.score * 100);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        score: existing.score + semanticBoost,
        reason: `${existing.reason} + semantic (${hit.reason})`,
      });
      continue;
    }
    const semanticHit: RepositorySearchHit = {
      path: hit.path,
      absPath: hit.path,
      reason: `Semantic: ${hit.reason}`,
      score: semanticBoost,
    };
    if (hit.symbolName) {
      merged.set(key, { ...semanticHit, symbolName: hit.symbolName });
    } else {
      merged.set(key, semanticHit);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MERGED);
}
