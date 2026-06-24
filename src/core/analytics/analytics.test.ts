import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDashboardSummary,
  computeProviderAnalytics,
  computeRepairAnalytics,
  filterRecordsByPeriod,
} from "@/core/analytics/aggregate";
import { appendAnalyticsRecord, loadAnalyticsHistory } from "@/core/analytics/store";
import type { StudioAnalyticsRecord } from "@/core/analytics/types";

function sampleRecord(
  patch: Partial<StudioAnalyticsRecord> = {},
): StudioAnalyticsRecord {
  return {
    id: `r-${Math.random()}`,
    at: Date.now(),
    projectPath: "/project",
    actionType: "ai_plan",
    actionLabel: "AI Plan",
    ok: true,
    status: "success",
    durationMs: 1200,
    provider: "gemini",
    model: "gemini-2.5-flash",
    summary: "AI Plan completed",
    aiCalls: 1,
    estimatedPromptTokens: 700,
    estimatedOutputTokens: 300,
    estimatedTotalTokens: 1000,
    estimatedCostUsd: 0.0001,
    ...patch,
  };
}

describe("studio analytics store", () => {
  it("caps per-project history at 500", () => {
    const original = globalThis.localStorage;
    const mem = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
      removeItem: (k) => {
        mem.delete(k);
      },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    } as Storage;

    try {
      for (let i = 0; i < 510; i++) {
        appendAnalyticsRecord(
          sampleRecord({
            id: `run-${i}`,
            at: Date.now() - i,
            projectPath: "/demo",
          }),
        );
      }
      const loaded = loadAnalyticsHistory("/demo");
      assert.equal(loaded.length, 500);
    } finally {
      globalThis.localStorage = original;
    }
  });
});

describe("studio analytics aggregate", () => {
  it("computes dashboard summary cards", () => {
    const records = [
      sampleRecord({ ok: true, status: "success", aiCalls: 2, estimatedCostUsd: 0.01, durationMs: 1000 }),
      sampleRecord({ ok: false, status: "failed", aiCalls: 1, estimatedCostUsd: 0.02, durationMs: 3000 }),
    ];
    const summary = computeDashboardSummary(records);
    assert.equal(summary.totalRuns, 2);
    assert.equal(summary.successfulRuns, 1);
    assert.equal(summary.failedRuns, 1);
    assert.equal(summary.totalAiCalls, 3);
    assert.equal(summary.successRatePercent, 50);
    assert.equal(summary.averageRunDurationMs, 2000);
  });

  it("excludes cancelled runs from failure metrics", () => {
    const records = [
      sampleRecord({ ok: true, status: "success" }),
      sampleRecord({ ok: false, status: "cancelled" }),
      sampleRecord({ ok: false, status: "aborted" }),
      sampleRecord({ ok: false, status: "failed" }),
    ];
    const summary = computeDashboardSummary(records);
    assert.equal(summary.totalRuns, 4);
    assert.equal(summary.successfulRuns, 1);
    assert.equal(summary.failedRuns, 1);
    assert.equal(summary.successRatePercent, 50);
  });

  it("groups provider analytics", () => {
    const rows = computeProviderAnalytics([
      sampleRecord({ provider: "gemini", model: "gemini-2.5-flash", ok: true }),
      sampleRecord({ provider: "ollama", model: "qwen2.5-coder:7b", ok: false }),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.runs, 1);
  });

  it("aggregates repair stats", () => {
    const repair = computeRepairAnalytics([
      sampleRecord({
        repair: {
          attempted: 2,
          successful: 1,
          failed: 1,
          reasons: ["typescript", "build"],
        },
      }),
    ]);
    assert.equal(repair.attempted, 2);
    assert.equal(repair.byReason.typescript, 1);
  });

  it("filters records by period", () => {
    const now = Date.now();
    const records = [
      sampleRecord({ at: now }),
      sampleRecord({ at: now - 10 * 24 * 60 * 60 * 1000 }),
    ];
    const week = filterRecordsByPeriod(records, "7d", now);
    assert.equal(week.length, 1);
  });
});
