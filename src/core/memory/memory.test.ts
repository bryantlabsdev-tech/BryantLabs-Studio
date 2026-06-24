import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMemoryCandidatesFromRun } from "@/core/memory/autoLearn";
import { computeMemoryAnalytics } from "@/core/memory/analytics";
import {
  addMemoryRecord,
  emptyAgentMemoryStore,
  normalizeAgentMemoryStore,
  recordMemoryUsage,
} from "@/core/memory/store";
import { retrieveRelevantMemories } from "@/core/memory/retrieval";
import { redactMemoryText } from "@/core/memory/redact";
import { attachRetrievedMemoriesToContext } from "@/core/memory/integration";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { PlanContext } from "@/core/planner/aiTypes";

describe("agent memory engine", () => {
  it("persists normalized store shape", () => {
    const store = normalizeAgentMemoryStore(
      {
        version: 1,
        projectPath: "/tmp/app",
        memories: [
          {
            id: "m1",
            category: "project",
            title: "Stack",
            content: "Uses React + Vite",
            createdAt: 1,
            updatedAt: 1,
            usageCount: 0,
            successCount: 0,
            pinned: false,
            archived: false,
            tags: [],
          },
        ],
        stats: { retrievalCount: 0, hitCount: 0, missCount: 0 },
        settings: { autoSaveSuccessfulMemories: false },
      },
      "/tmp/app",
    );
    assert.equal(store.memories.length, 1);
    assert.equal(store.memories[0]?.content, "Uses React + Vite");
  });

  it("retrieves relevant memories for prompt", () => {
    let store = emptyAgentMemoryStore("/tmp/app");
    store = addMemoryRecord(store, {
      category: "user_preference",
      title: "UI style",
      content: "Prefers premium desktop UI with glassmorphism",
    });
    const retrieval = retrieveRelevantMemories(store, {
      prompt: "Make the dashboard premium with glassmorphism",
      operation: "ai_plan",
    });
    assert.ok(retrieval.memories.length > 0);
    assert.match(retrieval.memories[0]?.content ?? "", /glassmorphism/i);
  });

  it("tracks memory usage stats", () => {
    let store = emptyAgentMemoryStore("/tmp/app");
    store = addMemoryRecord(store, {
      category: "repair",
      title: "Missing import",
      content: "Fixed by adding React import",
    });
    const id = store.memories[0]!.id;
    store = recordMemoryUsage(store, [id], { success: true });
    assert.equal(store.stats.retrievalCount, 1);
    assert.equal(store.stats.hitCount, 1);
    assert.equal(store.memories[0]?.usageCount, 1);
  });

  it("redacts secrets from memory text", () => {
    const redacted = redactMemoryText("key=supersecret sk-ant-api03-abcdef");
    assert.doesNotMatch(redacted, /supersecret/);
    assert.doesNotMatch(redacted, /sk-ant-api03/);
  });

  it("injects retrieved memories into plan context", () => {
    const context: PlanContext = {
      framework: "react",
      language: "typescript",
      packageManager: "npm",
      totalFiles: 1,
      totalFolders: 0,
      entryPoints: [],
      files: [],
      symbols: [],
    };
    const enriched = attachRetrievedMemoriesToContext(context, {
      memories: [
        {
          id: "m1",
          category: "project",
          title: "Stack",
          content: "Uses React + Vite",
          relevanceScore: 12,
          selectionReason: "prompt:react",
          estimatedTokens: 10,
          pinned: false,
        },
      ],
      totalEstimatedTokens: 10,
      queriedCount: 1,
      hitCount: 1,
      missCount: 0,
    });
    assert.equal(enriched.retrievedMemories?.length, 1);
  });

  it("generates success memory candidates from runs", () => {
    const snapshot = {
      ...emptyGreenfieldRun(),
      actionType: "ai_plan" as const,
      workflow: { prompt: "Build a calculator", filesWritten: ["src/App.tsx"] },
    };
    const candidates = generateMemoryCandidatesFromRun({
      snapshot,
      ok: true,
      scan: null,
      prompt: "Build a calculator",
    });
    assert.ok(candidates.length > 0);
  });

  it("computes memory analytics", () => {
    let store = emptyAgentMemoryStore("/tmp/app");
    store = addMemoryRecord(store, {
      category: "file",
      title: "App.tsx",
      content: "Main UI file",
    });
    store = { ...store, stats: { retrievalCount: 4, hitCount: 3, missCount: 1 } };
    const analytics = computeMemoryAnalytics(store);
    assert.equal(analytics.totalMemories, 1);
    assert.equal(analytics.hitRatePercent, 75);
  });
});
