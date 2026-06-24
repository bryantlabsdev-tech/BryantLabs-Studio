import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProjectMemoryContext,
  readProjectMemoryInjectionMeta,
} from "@/core/projectIntelligence/buildProjectMemoryContext";
import { PROJECT_MEMORY_CONTEXT_MAX_CHARS } from "@/core/projectIntelligence/memoryRoutes";
import {
  bumpFixConfidence,
  computeFixConfidenceScore,
  topFixForIssue,
} from "@/core/projectIntelligence/confidence";
import {
  buildMemoryRecommendations,
  buildPreferredFixPrompt,
  isPreferredFixPrompt,
} from "@/core/projectIntelligence/recommendations";
import { shouldInjectProjectMemory } from "@/core/projectIntelligence/memoryRoutes";
import { EMPTY_PROJECT_INTELLIGENCE, type ProjectIntelligence } from "@/core/projectIntelligence/types";
import { buildRunInspectorViewModel } from "@/core/agent/runInspector";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { buildAgentPlanContext } from "@/core/context/buildAgentContext";
import { mockProjectScan } from "@/core/repository/testScan";
import { emptySessionMemory } from "@/core/sessionMemory/store";

function sampleIntelligence(): ProjectIntelligence {
  return {
    ...EMPTY_PROJECT_INTELLIGENCE,
    projectId: "/project",
    framework: "React (Vite)",
    language: "TypeScript",
    buildSystem: "Vite",
    stylingSystem: "Tailwind",
    recurringUiPatterns: ["Component driven", "responsive card/table layouts"],
    recurringAuditIssues: [
      { id: "rows_overflow", label: "rows_overflow", occurrences: 4 },
    ],
    successfulFixes: [
      { id: "overflow", label: "overflow-x-auto wrapper", occurrences: 3, succeeded: true },
    ],
    fixConfidence: [
      {
        issueId: "rows_overflow",
        fixLabel: "overflow-x-auto wrapper",
        successes: 7,
        failures: 1,
        lastUsedAt: Date.now(),
        confidenceScore: 88,
      },
    ],
    failedFixMemory: [
      {
        id: "gemini-json-patch-failed",
        label: "gemini JSON patch failed for rows_overflow",
        issueId: "rows_overflow",
        occurrences: 1,
        lastAt: Date.now(),
      },
    ],
    updatedAt: Date.now(),
  };
}

describe("project memory context generation", () => {
  it("builds compact memory block for edit routes", () => {
    const result = buildProjectMemoryContext(sampleIntelligence(), {
      route: "edit_follow_up",
      prompt: "Fix table overflow",
    });
    assert.equal(result.injected, true);
    assert.match(result.text, /Project Memory:/);
    assert.match(result.text, /rows_overflow/);
    assert.match(result.text, /overflow-x-auto wrapper/);
    assert.match(result.text, /Previously Failed Fixes/);
    assert.ok(result.text.length <= PROJECT_MEMORY_CONTEXT_MAX_CHARS);
  });

  it("skips injection for unrelated routes", () => {
    const result = buildProjectMemoryContext(sampleIntelligence(), {
      route: "greenfield",
      prompt: "Create a todo app",
    });
    assert.equal(result.injected, false);
  });

  it("redacts secrets from memory context", () => {
    const intel: ProjectIntelligence = {
      ...sampleIntelligence(),
      failedFixMemory: [
        {
          id: "secret",
          label: "api_key=sk-live-abcdefghijklmnopqrstuvwxyz",
          issueId: null,
          occurrences: 1,
          lastAt: Date.now(),
        },
      ],
    };
    const result = buildProjectMemoryContext(intel, {
      route: "edit_follow_up",
      prompt: "Fix layout",
    });
    assert.match(result.text, /\[redacted\]/);
    assert.doesNotMatch(result.text, /sk-live-/);
  });
});

describe("memory confidence", () => {
  it("calculates confidence as successes over attempts", () => {
    assert.equal(computeFixConfidenceScore(7, 1), 88);
    assert.equal(computeFixConfidenceScore(0, 0), 0);
  });

  it("tracks confidence bumps per issue/fix pair", () => {
    const rows = bumpFixConfidence([], "rows_overflow", "overflow-x-auto wrapper", true);
    const bumped = bumpFixConfidence(rows, "rows_overflow", "overflow-x-auto wrapper", true);
    const top = topFixForIssue(bumped, "rows_overflow");
    assert.equal(top?.successes, 2);
    assert.equal(top?.confidenceScore, 100);
  });
});

describe("memory recommendations", () => {
  it("selects highest confidence fix for recurring issues", () => {
    const recs = buildMemoryRecommendations(sampleIntelligence());
    assert.equal(recs.length, 1);
    assert.equal(recs[0]?.issueId, "rows_overflow");
    assert.equal(recs[0]?.recommendedFix, "overflow-x-auto wrapper");
    assert.equal(recs[0]?.confidenceScore, 88);
  });

  it("creates deterministic preferred fix follow-up prompt", () => {
    const recs = buildMemoryRecommendations(sampleIntelligence());
    const prompt = buildPreferredFixPrompt(recs[0]!);
    assert.ok(isPreferredFixPrompt(prompt));
    assert.match(prompt, /rows_overflow/);
    assert.match(prompt, /overflow-x-auto wrapper/);
    assert.match(prompt, /horizontal scrolling|responsive table/i);
  });
});

describe("planner memory context wiring", () => {
  it("attaches project memory context for edit follow-up planning", () => {
    const scan = mockProjectScan(["src/App.tsx", "src/index.css"]);
    const { context, projectMemoryInjection } = buildAgentPlanContext(
      scan,
      "Fix rows overflow in comparison table",
      emptySessionMemory(),
      null,
      "/project",
      null,
      null,
      sampleIntelligence(),
      "edit_follow_up",
    );
    assert.equal(projectMemoryInjection.injected, true);
    assert.ok(context.projectMemoryContext?.includes("rows_overflow"));
    assert.ok(shouldInjectProjectMemory("edit_follow_up", "Fix rows overflow"));
  });
});

describe("run inspector memory metadata", () => {
  it("shows memory injected metrics from run logs", () => {
    const model = buildRunInspectorViewModel({
      runId: "run-memory",
      prompt: "Fix overflow",
      outcome: "success",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        projectMemoryInjection: {
          injected: true,
          contextSize: 420,
          recommendationUsed: true,
        },
        entries: [
          createRunLogEntry(
            "ai_plan",
            "running",
            "Project memory context injected",
            "size=420; recommendation=true",
          ),
        ],
      },
    });
    assert.equal(model.metrics.memoryInjected, true);
    assert.equal(model.metrics.memoryContextSize, 420);
    assert.equal(model.metrics.memoryRecommendationUsed, true);
  });

  it("reads injection metadata from log entries when snapshot field is missing", () => {
    const meta = readProjectMemoryInjectionMeta({
      projectMemoryInjection: null,
      entries: [
        createRunLogEntry("ai_plan", "running", "Project memory context injected", "size=256"),
      ],
    });
    assert.equal(meta?.injected, true);
    assert.equal(meta?.contextSize, 256);
  });
});
