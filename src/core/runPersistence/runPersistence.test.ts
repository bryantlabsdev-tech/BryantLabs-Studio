import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { buildRunCheckpoint } from "@/core/runPersistence/buildCheckpoint";
import {
  clearRunCheckpoint,
  loadRunCheckpoint,
  saveRunCheckpoint,
  setRunCheckpointStorePort,
  type RunCheckpointStorePort,
} from "@/core/runPersistence/store";
import type { BuilderSession } from "@/core/builder";
import type { RunCheckpointInput } from "@/core/runPersistence/types";

const PROJECT = "/tmp/demo-project";

function emptyInput(
  patch: Partial<RunCheckpointInput> = {},
): RunCheckpointInput {
  return {
    projectPath: PROJECT,
    builderSession: null,
    agentLoopSession: null,
    executionSession: null,
    pipelineSession: null,
    planApplySession: null,
    aiPlan: null,
    plan: null,
    agentSession: null,
    lastPlanPrompt: null,
    buildMode: "single",
    buildRunning: false,
    pipelineRunning: false,
    ...patch,
  };
}

function mockBuilder(status: BuilderSession["status"]): BuilderSession {
  return {
    goal: { rawPrompt: "Build CRM", title: "CRM", createdAt: 1 },
    mode: "hybrid",
    phases: [],
    status,
    currentPhaseId: null,
    startedAt: 1,
    completedAt: null,
    allFilesModified: [],
    allFilesCreated: [],
    report: null,
    error: null,
  };
}

describe("buildRunCheckpoint", () => {
  it("returns null when nothing is active", () => {
    assert.equal(buildRunCheckpoint(emptyInput()), null);
  });

  it("normalizes running builder to paused", () => {
    const cp = buildRunCheckpoint(
      emptyInput({ builderSession: mockBuilder("running") }),
    );
    assert.ok(cp);
    assert.equal(cp?.kind, "builder");
    assert.equal(cp?.builderSession?.status, "paused");
    assert.equal(cp?.interruptedWhileRunning, true);
  });

  it("prefers builder over execution", () => {
    const cp = buildRunCheckpoint(
      emptyInput({
        builderSession: mockBuilder("paused"),
        executionSession: {
          prompt: "go",
          planSummary: "s",
          planSource: "ai",
          steps: [{ id: "s1", index: 0, title: "t", description: "", filePaths: [], dependsOn: [], status: "pending" }],
          files: [],
          phase: "ready",
          currentStepId: "s1",
          pausedAtStepId: null,
          applyError: null,
          verification: null,
          diagnostics: {
            executionPlanLines: [],
            completedSteps: 0,
            totalSteps: 1,
            filesModified: [],
            validationSummary: null,
          },
        },
      }),
    );
    assert.equal(cp?.kind, "builder");
  });
});

describe("run checkpoint store", () => {
  const original = globalThis.localStorage;

  beforeEach(() => {
    const map = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    globalThis.localStorage = original;
  });

  it("round-trips per project", () => {
    const cp = buildRunCheckpoint(
      emptyInput({ builderSession: mockBuilder("awaiting_approval") }),
    );
    assert.ok(cp);
    saveRunCheckpoint(cp);
    const loaded = loadRunCheckpoint(PROJECT);
    assert.equal(loaded?.kind, "builder");
    clearRunCheckpoint(PROJECT);
    assert.equal(loadRunCheckpoint(PROJECT), null);
  });

  it("uses injected port when set", async () => {
    const saved: import("@/core/runPersistence/types").PersistedRunCheckpoint[] =
      [];
    const port: RunCheckpointStorePort = {
      async load(projectPath) {
        return saved.find((e) => e.projectPath === projectPath) ?? null;
      },
      async save(checkpoint) {
        const idx = saved.findIndex((e) => e.projectPath === checkpoint.projectPath);
        if (idx >= 0) saved[idx] = checkpoint;
        else saved.push(checkpoint);
      },
      async clear(projectPath) {
        const idx = saved.findIndex((e) => e.projectPath === projectPath);
        if (idx >= 0) saved.splice(idx, 1);
      },
    };
    setRunCheckpointStorePort(port);
    const cp = buildRunCheckpoint(
      emptyInput({ builderSession: mockBuilder("paused") }),
    );
    assert.ok(cp);
    saveRunCheckpoint(cp!);
    await new Promise((r) => setTimeout(r, 0));
    const { loadRunCheckpointAsync } = await import("@/core/runPersistence/store");
    const loaded = await loadRunCheckpointAsync(PROJECT);
    assert.equal(loaded?.kind, "builder");
    setRunCheckpointStorePort(null);
  });
});
