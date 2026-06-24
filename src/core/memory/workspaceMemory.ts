import type { BryantLabsApi } from "@/types";
import {
  addMemoryRecord,
  emptyAgentMemoryStore,
  normalizeAgentMemoryStore,
  recordMemoryUsage,
} from "@/core/memory/store";
import {
  retrieveRelevantMemories,
  type MemoryRetrievalQuery,
} from "@/core/memory/retrieval";
import type {
  AgentMemoryStore,
  MemoryCandidate,
  MemoryRecordInput,
  MemoryRetrievalResult,
} from "@/core/memory/types";
import { seedCandidatesFromProjectMemory } from "@/core/memory/autoLearn";
import type { ProjectMemory } from "@/core/projectMemory/types";

export async function loadAgentMemoryFromDisk(
  api: BryantLabsApi | undefined,
  projectPath: string | null,
): Promise<AgentMemoryStore> {
  if (!api?.readAgentMemory || !projectPath) {
    return emptyAgentMemoryStore(projectPath ?? "");
  }
  try {
    const raw = await api.readAgentMemory();
    return normalizeAgentMemoryStore(raw, projectPath);
  } catch {
    return emptyAgentMemoryStore(projectPath);
  }
}

export async function saveAgentMemoryToDisk(
  api: BryantLabsApi | undefined,
  store: AgentMemoryStore,
): Promise<{ ok: boolean; reason?: string }> {
  if (!api?.writeAgentMemory) {
    return { ok: false, reason: "Agent memory is not available." };
  }
  try {
    return await api.writeAgentMemory(store);
  } catch {
    return { ok: false, reason: "Could not save agent memory." };
  }
}

export function retrieveMemoriesForContext(
  store: AgentMemoryStore,
  query: MemoryRetrievalQuery,
): { store: AgentMemoryStore; retrieval: MemoryRetrievalResult } {
  const retrieval = retrieveRelevantMemories(store, query);
  const ids = retrieval.memories.map((m) => m.id);
  const nextStore = recordMemoryUsage(store, ids);
  return { store: nextStore, retrieval };
}

export function applyMemoryCandidates(
  store: AgentMemoryStore,
  candidates: readonly MemoryCandidate[],
): AgentMemoryStore {
  let next = store;
  for (const c of candidates) {
    const input: MemoryRecordInput = {
      category: c.category,
      title: c.title,
      content: c.content,
      ...(c.metadata ? { metadata: c.metadata } : {}),
    };
    next = addMemoryRecord(next, input);
  }
  return next;
}

export function seedStoreFromLegacyProjectMemory(
  store: AgentMemoryStore,
  projectMemory: ProjectMemory,
): AgentMemoryStore {
  if (store.memories.length > 0) return store;
  const seeds = seedCandidatesFromProjectMemory(projectMemory);
  return applyMemoryCandidates(store, seeds);
}
