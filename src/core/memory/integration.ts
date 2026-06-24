import type { PlanContext } from "@/core/planner/aiTypes";
import type { MemoryRetrievalResult } from "@/core/memory/types";
import { planContextMemoriesFromRetrieval } from "@/core/memory/retrieval";

/** Attach ranked memories to PlanContext without changing generation logic. */
export function attachRetrievedMemoriesToContext(
  context: PlanContext,
  retrieval: MemoryRetrievalResult | null | undefined,
): PlanContext {
  if (!retrieval || retrieval.memories.length === 0) return context;
  return {
    ...context,
    retrievedMemories: planContextMemoriesFromRetrieval(retrieval),
    memoryRetrievalStats: {
      totalEstimatedTokens: retrieval.totalEstimatedTokens,
      hitCount: retrieval.hitCount,
      missCount: retrieval.missCount,
      queriedCount: retrieval.queriedCount,
    },
  };
}
