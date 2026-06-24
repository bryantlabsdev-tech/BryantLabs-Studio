/** Phase 25 — persistent agent memory categories. */
export type MemoryCategory =
  | "project"
  | "user_preference"
  | "success"
  | "repair"
  | "file";

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "project",
  "user_preference",
  "success",
  "repair",
  "file",
] as const;

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  project: "Project Memory",
  user_preference: "User Preferences",
  success: "Success Memory",
  repair: "Repair Memory",
  file: "File Memory",
};

export interface MemoryMetadata {
  readonly files?: readonly string[];
  readonly provider?: string;
  readonly model?: string;
  readonly goal?: string;
  readonly outcome?: string;
  readonly failureType?: string;
  readonly symbols?: readonly string[];
}

export interface AgentMemoryRecord {
  readonly id: string;
  readonly category: MemoryCategory;
  readonly title: string;
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly usageCount: number;
  readonly successCount: number;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly tags: readonly string[];
  readonly metadata?: MemoryMetadata;
  readonly lastUsedAt?: number;
}

export interface MemoryEngineStats {
  readonly retrievalCount: number;
  readonly hitCount: number;
  readonly missCount: number;
}

export interface MemoryEngineSettings {
  readonly autoSaveSuccessfulMemories: boolean;
}

export interface AgentMemoryStore {
  readonly version: number;
  readonly projectPath: string;
  readonly memories: readonly AgentMemoryRecord[];
  readonly stats: MemoryEngineStats;
  readonly settings: MemoryEngineSettings;
}

export interface RetrievedMemory {
  readonly id: string;
  readonly category: MemoryCategory;
  readonly title: string;
  readonly content: string;
  readonly relevanceScore: number;
  readonly selectionReason: string;
  readonly estimatedTokens: number;
  readonly pinned: boolean;
}

export interface MemoryRetrievalResult {
  readonly memories: readonly RetrievedMemory[];
  readonly totalEstimatedTokens: number;
  readonly queriedCount: number;
  readonly hitCount: number;
  readonly missCount: number;
}

export interface MemoryAnalytics {
  readonly totalMemories: number;
  readonly activeMemories: number;
  readonly pinnedCount: number;
  readonly archivedCount: number;
  readonly retrievalCount: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly hitRatePercent: number | null;
  readonly byCategory: Readonly<Record<MemoryCategory, number>>;
  readonly mostUsed: readonly AgentMemoryRecord[];
  readonly mostSuccessful: readonly AgentMemoryRecord[];
  readonly recent: readonly AgentMemoryRecord[];
}

export interface MemoryCandidate {
  readonly category: MemoryCategory;
  readonly title: string;
  readonly content: string;
  readonly metadata?: MemoryMetadata;
  readonly reason: string;
}

export type MemoryRecordInput = Pick<
  AgentMemoryRecord,
  "category" | "title" | "content"
> &
  Partial<
    Pick<AgentMemoryRecord, "pinned" | "archived" | "tags" | "metadata">
  >;

export const MEMORY_STORE_VERSION = 1;
export const MAX_MEMORIES_PER_PROJECT = 500;
export const MAX_RETRIEVED_MEMORIES = 8;
export const MAX_RETRIEVAL_TOKENS = 1200;

export const DEFAULT_MEMORY_SETTINGS: MemoryEngineSettings = {
  autoSaveSuccessfulMemories: false,
};

export const EMPTY_MEMORY_STATS: MemoryEngineStats = {
  retrievalCount: 0,
  hitCount: 0,
  missCount: 0,
};
