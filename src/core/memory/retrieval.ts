import type {
  AgentMemoryRecord,
  AgentMemoryStore,
  MemoryCategory,
  MemoryRetrievalResult,
  RetrievedMemory,
} from "@/core/memory/types";
import {
  MAX_RETRIEVED_MEMORIES,
  MAX_RETRIEVAL_TOKENS,
} from "@/core/memory/types";

export interface MemoryRetrievalQuery {
  readonly prompt: string;
  readonly files?: readonly string[];
  readonly symbols?: readonly string[];
  readonly operation?: "ai_plan" | "apply_plan" | "ai_patch" | "agent";
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .filter((w) => w.length > 2);
}

function categoryBoost(
  category: MemoryCategory,
  operation?: MemoryRetrievalQuery["operation"],
): number {
  switch (operation) {
    case "apply_plan":
    case "ai_patch":
      if (category === "file" || category === "success") return 12;
      if (category === "repair") return 8;
      break;
    case "agent":
      if (category === "project" || category === "success") return 10;
      break;
    case "ai_plan":
      if (category === "project" || category === "user_preference") return 12;
      break;
    default:
      break;
  }
  if (category === "project") return 6;
  if (category === "user_preference") return 5;
  return 0;
}

export function scoreMemoryRelevance(
  record: AgentMemoryRecord,
  query: MemoryRetrievalQuery,
): { score: number; reason: string } {
  if (record.archived) return { score: -1, reason: "archived" };

  const haystack = `${record.title} ${record.content} ${record.tags.join(" ")}`.toLowerCase();
  const promptTokens = tokenize(query.prompt);
  let score = 0;
  const reasons: string[] = [];

  for (const token of promptTokens) {
    if (haystack.includes(token)) {
      score += 8;
      reasons.push(`prompt:${token}`);
    }
  }

  if (record.pinned) {
    score += 40;
    reasons.push("pinned");
  }

  score += categoryBoost(record.category, query.operation);
  if (categoryBoost(record.category, query.operation) > 0) {
    reasons.push(`category:${record.category}`);
  }

  if (record.usageCount > 0) {
    score += Math.round((record.successCount / record.usageCount) * 18);
    reasons.push("success-rate");
  }

  const ageMs = Date.now() - record.updatedAt;
  if (ageMs < 7 * 24 * 60 * 60 * 1000) {
    score += 10;
    reasons.push("recent");
  }
  if (record.lastUsedAt && Date.now() - record.lastUsedAt < 24 * 60 * 60 * 1000) {
    score += 8;
    reasons.push("recently-used");
  }

  const files = query.files ?? [];
  const recordFiles = record.metadata?.files ?? [];
  if (files.length > 0 && recordFiles.length > 0) {
    const overlap = recordFiles.filter((f) =>
      files.some((q) => q === f || q.endsWith(f) || f.endsWith(q)),
    ).length;
    if (overlap > 0) {
      score += overlap * 22;
      reasons.push(`file-overlap:${overlap}`);
    }
  }

  const symbols = query.symbols ?? [];
  const recordSymbols = record.metadata?.symbols ?? [];
  if (symbols.length > 0 && recordSymbols.length > 0) {
    const overlap = recordSymbols.filter((s) => symbols.includes(s)).length;
    if (overlap > 0) {
      score += overlap * 15;
      reasons.push(`symbol-overlap:${overlap}`);
    }
  }

  if (score === 0 && record.category === "project") {
    score = 4;
    reasons.push("baseline-project");
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(", ") : "low-relevance",
  };
}

export function retrieveRelevantMemories(
  store: AgentMemoryStore,
  query: MemoryRetrievalQuery,
): MemoryRetrievalResult {
  const active = store.memories.filter((m) => !m.archived);
  const scored = active
    .map((record) => {
      const { score, reason } = scoreMemoryRelevance(record, query);
      return { record, score, reason };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.record.updatedAt - a.record.updatedAt;
    });

  const selected: RetrievedMemory[] = [];
  let totalTokens = 0;

  for (const item of scored) {
    if (selected.length >= MAX_RETRIEVED_MEMORIES) break;
    const content = item.record.content.trim();
    const blockTokens = estimateTokens(`${item.record.title}\n${content}`);
    if (totalTokens + blockTokens > MAX_RETRIEVAL_TOKENS && selected.length > 0) {
      continue;
    }
    selected.push({
      id: item.record.id,
      category: item.record.category,
      title: item.record.title,
      content,
      relevanceScore: Math.round(item.score * 10) / 10,
      selectionReason: item.reason,
      estimatedTokens: blockTokens,
      pinned: item.record.pinned,
    });
    totalTokens += blockTokens;
  }

  return {
    memories: selected,
    totalEstimatedTokens: totalTokens,
    queriedCount: active.length,
    hitCount: selected.length,
    missCount: selected.length === 0 ? 1 : 0,
  };
}

export function planContextMemoriesFromRetrieval(
  retrieval: MemoryRetrievalResult,
): NonNullable<
  import("@/core/planner/aiTypes").PlanContext["retrievedMemories"]
> {
  return retrieval.memories.map((m) => ({
    id: m.id,
    category: m.category,
    title: m.title,
    content: m.content,
    relevanceScore: m.relevanceScore,
    selectionReason: m.selectionReason,
  }));
}
