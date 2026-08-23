import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import {
  buildPipelineInspectorViewModel,
  classifyPipelineError,
  filterEntriesForCurrentRun,
  pipelineStatusGlyph,
} from "@/core/diagnostics/pipelineInspector";

describe("classifyPipelineError", () => {
  it("maps truncated JSON bodies", () => {
    assert.equal(
      classifyPipelineError("Provider request failed", "JSON request truncated at column 6883"),
      "JSON request truncated",
    );
  });

  it("maps provider timeouts", () => {
    assert.equal(classifyPipelineError("Request timed out after 120s"), "Provider timeout");
  });

  it("replaces generic proposal incomplete with detail", () => {
    assert.equal(
      classifyPipelineError("Proposal did not complete", "HTTP request failed: connection reset"),
      "HTTP request failed",
    );
  });
});

describe("filterEntriesForCurrentRun", () => {
  it("keeps only entries from the current run window", () => {
    const runStartedAt = Date.now();
    const old = {
      ...createRunLogEntry("pipeline", "success", "old run"),
      timestamp: new Date(runStartedAt - 10_000).toISOString(),
    };
    const current = createRunLogEntry("pipeline", "running", "new run");
    const filtered = filterEntriesForCurrentRun([old, current], runStartedAt);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.message, "new run");
  });
});

describe("buildPipelineInspectorViewModel", () => {
  it("builds independent stage statuses for a successful planner + failed parser run", () => {
    const runStartedAt = Date.now() - 5000;
    const snapshot = {
      ...emptyGreenfieldRun(),
      runStartedAt,
      runResult: "failed" as const,
      provider: "anthropic",
      model: "claude-opus-4",
      entries: [
        createRunLogEntry("ai_plan", "success", "Planner complete", "files: src/App.tsx"),
        createRunLogEntry("pipeline", "success", "Explored 2 file(s) before planning", "src/App.tsx, src/index.css"),
        createRunLogEntry("provider_call", "running", "[coder] started"),
        createRunLogEntry("provider_call", "success", "[coder] success · 4200ms"),
        createRunLogEntry("parser", "failed", "Patch parser failed", "@@FILE marker missing"),
        createRunLogEntry("apply_plan", "failed", "Apply Plan produced zero valid patch proposals."),
      ],
    };

    const model = buildPipelineInspectorViewModel({ greenfieldRun: snapshot });
    const planner = model.stages.find((s) => s.id === "planner");
    const parser = model.stages.find((s) => s.id === "parser");
    const patch = model.stages.find((s) => s.id === "patch_generator");

    assert.equal(planner?.status, "success");
    assert.equal(parser?.status, "failed");
    assert.equal(parser?.error, "Patch parser failed");
    assert.equal(patch?.status, "failed");
    assert.equal(model.metrics.totalAiCalls >= 1, true);
  });

  it("shows warning glyph and counts explored files", () => {
    const runStartedAt = Date.now() - 1000;
    const snapshot = {
      ...emptyGreenfieldRun(),
      runStartedAt,
      entries: [
        createRunLogEntry(
          "pipeline",
          "success",
          "Explored 3 file(s) before planning",
          "src/a.ts, src/b.ts, src/c.ts",
        ),
        createRunLogEntry("verification", "success", "Requirements advisory", "incomplete UI items"),
      ],
    };
    const model = buildPipelineInspectorViewModel({ greenfieldRun: snapshot });
    const prompt = model.stages.find((s) => s.id === "prompt_builder");
    const verify = model.stages.find((s) => s.id === "verification");
    assert.equal(prompt?.status, "success");
    assert.equal(verify?.status, "warning");
    assert.equal(model.metrics.filesExplored, 3);
  });
});

describe("pipelineStatusGlyph", () => {
  it("renders visual markers", () => {
    assert.equal(pipelineStatusGlyph("success"), "✓");
    assert.equal(pipelineStatusGlyph("failed"), "✗");
    assert.equal(pipelineStatusGlyph("pending"), "○");
  });
});
