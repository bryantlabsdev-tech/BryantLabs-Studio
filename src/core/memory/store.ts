import { redactMemoryText } from "@/core/memory/redact";
import type {
  AgentMemoryRecord,
  AgentMemoryStore,
  MemoryEngineSettings,
  MemoryEngineStats,
  MemoryRecordInput,
} from "@/core/memory/types";
import {
  DEFAULT_MEMORY_SETTINGS,
  EMPTY_MEMORY_STATS,
  MAX_MEMORIES_PER_PROJECT,
  MEMORY_STORE_VERSION,
} from "@/core/memory/types";

function newMemoryId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function coerceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}

function coerceRecord(raw: unknown): AgentMemoryRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const category = o.category;
  if (
    category !== "project" &&
    category !== "user_preference" &&
    category !== "success" &&
    category !== "repair" &&
    category !== "file"
  ) {
    return null;
  }
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const content = typeof o.content === "string" ? o.content.trim() : "";
  if (!title && !content) return null;

  const metadata =
    o.metadata && typeof o.metadata === "object"
      ? (o.metadata as AgentMemoryRecord["metadata"])
      : undefined;

  return {
    id: typeof o.id === "string" && o.id ? o.id : newMemoryId(),
    category,
    title: title || content.slice(0, 80),
    content: redactMemoryText(content),
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
    usageCount: typeof o.usageCount === "number" ? Math.max(0, o.usageCount) : 0,
    successCount:
      typeof o.successCount === "number" ? Math.max(0, o.successCount) : 0,
    pinned: o.pinned === true,
    archived: o.archived === true,
    tags: coerceTags(o.tags),
    ...(metadata ? { metadata } : {}),
    ...(typeof o.lastUsedAt === "number" ? { lastUsedAt: o.lastUsedAt } : {}),
  };
}

export function emptyAgentMemoryStore(projectPath = ""): AgentMemoryStore {
  return {
    version: MEMORY_STORE_VERSION,
    projectPath,
    memories: [],
    stats: { ...EMPTY_MEMORY_STATS },
    settings: { ...DEFAULT_MEMORY_SETTINGS },
  };
}

export function normalizeAgentMemoryStore(
  raw: unknown,
  projectPath: string,
): AgentMemoryStore {
  if (!raw || typeof raw !== "object") {
    return emptyAgentMemoryStore(projectPath);
  }
  const o = raw as Record<string, unknown>;
  const memories = Array.isArray(o.memories)
    ? o.memories
        .map(coerceRecord)
        .filter((m): m is AgentMemoryRecord => m != null)
        .slice(0, MAX_MEMORIES_PER_PROJECT)
    : [];

  const statsRaw = o.stats as Partial<MemoryEngineStats> | undefined;
  const settingsRaw = o.settings as Partial<MemoryEngineSettings> | undefined;

  return {
    version: MEMORY_STORE_VERSION,
    projectPath:
      typeof o.projectPath === "string" && o.projectPath
        ? o.projectPath
        : projectPath,
    memories,
    stats: {
      retrievalCount: statsRaw?.retrievalCount ?? 0,
      hitCount: statsRaw?.hitCount ?? 0,
      missCount: statsRaw?.missCount ?? 0,
    },
    settings: {
      autoSaveSuccessfulMemories:
        settingsRaw?.autoSaveSuccessfulMemories === true,
    },
  };
}

export function addMemoryRecord(
  store: AgentMemoryStore,
  input: MemoryRecordInput,
): AgentMemoryStore {
  const now = Date.now();
  const record: AgentMemoryRecord = {
    id: newMemoryId(),
    category: input.category,
    title: redactMemoryText(input.title.trim()),
    content: redactMemoryText(input.content.trim()),
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    successCount: 0,
    pinned: input.pinned ?? false,
    archived: input.archived ?? false,
    tags: input.tags ?? [],
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  const memories = [record, ...store.memories].slice(0, MAX_MEMORIES_PER_PROJECT);
  return { ...store, memories };
}

export function updateMemoryRecord(
  store: AgentMemoryStore,
  id: string,
  patch: Partial<
    Pick<
      AgentMemoryRecord,
      "title" | "content" | "pinned" | "archived" | "tags" | "metadata"
    >
  >,
): AgentMemoryStore {
  const memories = store.memories.map((m) => {
    if (m.id !== id) return m;
    return {
      ...m,
      ...(patch.title != null ? { title: redactMemoryText(patch.title.trim()) } : {}),
      ...(patch.content != null
        ? { content: redactMemoryText(patch.content.trim()) }
        : {}),
      ...(patch.pinned != null ? { pinned: patch.pinned } : {}),
      ...(patch.archived != null ? { archived: patch.archived } : {}),
      ...(patch.tags != null ? { tags: patch.tags } : {}),
      ...(patch.metadata != null ? { metadata: patch.metadata } : {}),
      updatedAt: Date.now(),
    };
  });
  return { ...store, memories };
}

export function deleteMemoryRecord(
  store: AgentMemoryStore,
  id: string,
): AgentMemoryStore {
  return {
    ...store,
    memories: store.memories.filter((m) => m.id !== id),
  };
}

export function recordMemoryUsage(
  store: AgentMemoryStore,
  ids: readonly string[],
  opts?: { success?: boolean },
): AgentMemoryStore {
  const idSet = new Set(ids);
  const now = Date.now();
  const memories = store.memories.map((m) => {
    if (!idSet.has(m.id)) return m;
    return {
      ...m,
      usageCount: m.usageCount + 1,
      successCount: opts?.success ? m.successCount + 1 : m.successCount,
      lastUsedAt: now,
      updatedAt: now,
    };
  });
  return {
    ...store,
    memories,
    stats: {
      ...store.stats,
      retrievalCount: store.stats.retrievalCount + 1,
      hitCount: store.stats.hitCount + (ids.length > 0 ? 1 : 0),
      missCount: store.stats.missCount + (ids.length === 0 ? 1 : 0),
    },
  };
}

export function updateMemorySettings(
  store: AgentMemoryStore,
  settings: Partial<MemoryEngineSettings>,
): AgentMemoryStore {
  return {
    ...store,
    settings: {
      ...store.settings,
      ...settings,
    },
  };
}

export function exportMemoryStorePayload(store: AgentMemoryStore): AgentMemoryStore {
  return {
    ...store,
    memories: store.memories.map((m) => ({
      ...m,
      title: redactMemoryText(m.title),
      content: redactMemoryText(m.content),
    })),
  };
}
