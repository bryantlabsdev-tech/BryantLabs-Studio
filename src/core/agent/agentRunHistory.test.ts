import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendAgentRunArtifact,
  clearAgentRunHistory,
  loadAgentRunHistory,
  mergeSessionRunHistoryIntoProject,
  nextRunNumber,
  SESSION_RUN_HISTORY_SCOPE,
  type AgentRunArtifact,
} from "@/core/agent/agentRunHistory";
import { deriveAgentRunThoughtStream } from "@/core/agent/agentRunThoughtStream";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createRunLogEntry } from "@/core/greenfield/runLog";

describe("agentRunHistory", () => {
  it("persists artifacts per project without duplicates", () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    try {
      const path = `/tmp/test-project-${Date.now()}`;
    const artifact = {
      runId: "run-1",
      runNumber: 1,
      prompt: "Add dark mode",
      userMessageId: "chat-1",
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
      outcome: "success" as const,
      provider: "Anthropic",
      model: "claude",
      filesModified: ["src/App.tsx"],
      fileDiffs: [
        {
          path: "src/App.tsx",
          linesAdded: 12,
          linesRemoved: 2,
          preview: [{ type: "add" as const, text: "dark mode styles" }],
        },
      ],
      logEntries: [],
      card: {
        isVisible: true,
        title: "Agent run",
        overallStatus: "complete" as const,
        currentStep: null,
        steps: [],
        progressPercent: 100,
        streamRevision: "1",
        providerLine: null,
        providerIdentityLine: null,
        provider: "Anthropic",
        model: "claude",
        aiCallsUsed: 1,
        durationMs: 1000,
        durationLabel: "1s",
        providerEvents: [],
        latestProviderEvent: null,
        fileActivity: [{ path: "src/App.tsx", status: "written" as const }],
        filesPlanned: [],
        filesModified: ["src/App.tsx"],
        filesWritten: ["src/App.tsx"],
        verification: {
          typescript: "passed" as const,
          build: "passed" as const,
          uiAudit: "skipped" as const,
          preview: "ready" as const,
        },
        summary: "Done",
        stuckMessage: null,
        showRecoveryActions: false,
        reasoning: {
          headline: "",
          plannerReasoning: [],
          detected: [],
          planSteps: [],
          risks: [],
          isVisible: false,
        },
        confidence: { percent: 80, level: "high" as const, factors: [], showBeforeApply: false },
        patchImpact: {
          isVisible: false,
          files: [],
          complexity: "Low" as const,
          risk: "Low" as const,
          estimatedTime: "1m",
        },
        failureDiagnosis: null,
        diagnostics: { items: [], isVisible: false },
        successSummary: null,
        thoughtStream: [],
        failureDetails: null,
      },
      dashboard: {
        isVisible: true,
        promptTitle: "Add dark mode",
        providerModel: "Anthropic · claude",
        elapsedLabel: "1s",
        progressPercent: 100,
        progressLabel: "Complete",
        overallStatus: "complete" as const,
        thoughts: [],
        currentTask: null,
        currentStage: null,
        currentStepLabel: null,
        currentFile: null,
        files: [],
        verification: [],
        uiAuditFailure: null,
        uiAuditAdvisory: null,
        completion: {
          isVisible: true,
          filesModified: ["src/App.tsx"],
          buildResult: "Build passed",
          verificationResult: "TypeScript passed · Build passed",
          durationLabel: "1s",
          summaryLine: "Done",
        },
        streamRevision: "1",
      },
      timeline: null,
    } satisfies AgentRunArtifact;

    appendAgentRunArtifact(path, artifact);
    appendAgentRunArtifact(path, artifact);
    const loaded = loadAgentRunHistory(path);
    assert.equal(loaded.length, 1);
    assert.equal(nextRunNumber(loaded), 2);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });

  it("merges pre-project session history when a project opens", () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    try {
      const projectPath = `/tmp/merge-project-${Date.now()}`;
      const sessionArtifact = {
        runId: "run-session",
        runNumber: 1,
        prompt: "Build Sudoku",
        userMessageId: "chat-session",
        startedAt: 1000,
        endedAt: 2000,
        durationMs: 1000,
        outcome: "success" as const,
        provider: null,
        model: null,
        filesModified: [],
        fileDiffs: [],
        card: { isVisible: true, title: "Creating app", overallStatus: "complete" as const } as AgentRunArtifact["card"],
        dashboard: { isVisible: false, promptTitle: "Build Sudoku" } as AgentRunArtifact["dashboard"],
        timeline: null,
      } satisfies AgentRunArtifact;

      appendAgentRunArtifact(SESSION_RUN_HISTORY_SCOPE, sessionArtifact);
      const merged = mergeSessionRunHistoryIntoProject(projectPath);

      assert.equal(merged.length, 1);
      assert.equal(merged[0]?.runId, "run-session");
      assert.equal(loadAgentRunHistory(SESSION_RUN_HISTORY_SCOPE).length, 0);
      assert.equal(loadAgentRunHistory(projectPath).length, 1);
      clearAgentRunHistory(projectPath);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});

describe("deriveAgentRunThoughtStream", () => {
  it("emits real stage events from logs and timeline", () => {
    const run = emptyGreenfieldRun();
    const events = deriveAgentRunThoughtStream({
      entries: [
        createRunLogEntry("write", "running", "Writing src/App.tsx"),
      ],
      timeline: run.runTimeline,
      scan: null,
      currentStep: { id: "editing", label: "Editing files", status: "running" },
      fileActivity: [{ path: "src/App.tsx", status: "written" }],
    });

    assert.ok(events.some((event) => event.text.includes("Analyzing request")));
    assert.ok(events.some((event) => event.text.includes("src/App.tsx")));
  });
});
