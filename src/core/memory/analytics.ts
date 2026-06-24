import type {
  AgentMemoryRecord,
  AgentMemoryStore,
  MemoryAnalytics,
  MemoryCategory,
} from "@/core/memory/types";
import { MEMORY_CATEGORIES } from "@/core/memory/types";

export function computeMemoryAnalytics(
  store: AgentMemoryStore,
): MemoryAnalytics {
  const active = store.memories.filter((m) => !m.archived);
  const byCategory = MEMORY_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = active.filter((m) => m.category === cat).length;
      return acc;
    },
    {} as Record<MemoryCategory, number>,
  );

  const mostUsed = [...active]
    .sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
    .slice(0, 5);

  const mostSuccessful = [...active]
    .filter((m) => m.usageCount > 0)
    .sort(
      (a, b) =>
        b.successCount / b.usageCount - a.successCount / a.usageCount ||
        b.successCount - a.successCount,
    )
    .slice(0, 5);

  const recent = [...active]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  const { retrievalCount, hitCount, missCount } = store.stats;
  const hitRatePercent =
    retrievalCount > 0 ? Math.round((hitCount / retrievalCount) * 1000) / 10 : null;

  return {
    totalMemories: store.memories.length,
    activeMemories: active.length,
    pinnedCount: active.filter((m) => m.pinned).length,
    archivedCount: store.memories.filter((m) => m.archived).length,
    retrievalCount,
    hitCount,
    missCount,
    hitRatePercent,
    byCategory,
    mostUsed,
    mostSuccessful,
    recent,
  };
}

export function mostReferencedMemory(
  store: AgentMemoryStore,
): AgentMemoryRecord | null {
  const active = store.memories.filter((m) => !m.archived);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => b.usageCount - a.usageCount)[0] ?? null;
}
