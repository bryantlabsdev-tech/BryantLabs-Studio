import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlanOrchestration } from "@/app/orchestration/planning";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createLatestAction } from "@/core/greenfield/runLog";
import { mockProjectScan } from "@/core/repository/testScan";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { normalizeProjectMemory } from "@/core/projectMemory/store";
import { EMPTY_PROJECT_INTELLIGENCE } from "@/core/projectIntelligence/types";
import type { Plan } from "@/core/planner";
import type { PlanningOrchestrationHost } from "@/app/orchestration/planningTypes";

const FILES = [
  "package.json",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
] as const;

function mockPlanningHost(input: {
  scan: ReturnType<typeof mockProjectScan> | null;
  greenfieldRun?: ReturnType<typeof emptyGreenfieldRun>;
}): PlanningOrchestrationHost {
  const planRef = { current: null as import("@/core/planner").Plan | null };
  const createPlanErrorRef = { current: null as string | null };
  let sessionMemory = emptySessionMemory();
  return {
    api: undefined,
    project: { path: "/tmp/app", name: "app" },
    scan: input.scan,
    plan: null,
    lastPlanPrompt: null,
    sessionMemory,
    projectMemory: normalizeProjectMemory(null),
    projectIntelligence: EMPTY_PROJECT_INTELLIGENCE,
    greenfieldRun: input.greenfieldRun ?? emptyGreenfieldRun(),
    planRef,
    aiPlanRef: { current: null },
    createPlanErrorRef,
    editExplorationContentsRef: { current: [] },
    setPlan: (value: Plan | null | ((prev: Plan | null) => Plan | null)) => {
      planRef.current = typeof value === "function" ? value(planRef.current) : value;
    },
    setSessionMemory: (
      value:
        | typeof sessionMemory
        | ((prev: typeof sessionMemory) => typeof sessionMemory),
    ) => {
      sessionMemory = typeof value === "function" ? value(sessionMemory) : value;
    },
    setSessionMemoryDiagnostics: () => {},
    setAiPlan: () => {},
    setAiPlanStatus: () => {},
    setLastPlanPrompt: () => {},
    refreshSmartFileSelection: () => {},
    resolveMemoriesForPrompt: () => ({
      records: [],
      query: "",
      totalMatches: 0,
      injectedCount: 0,
      truncated: false,
    }),
  } as unknown as PlanningOrchestrationHost;
}

describe("createPlanOrchestration", () => {
  it("builds plan from scaffold fallback when scan is null", () => {
    const host = mockPlanningHost({
      scan: null,
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        filesWritten: [...FILES],
      },
    });
    const plan = createPlanOrchestration(host, "Add dark mode toggle to the app");
    assert.ok(plan);
    assert.ok(plan!.files.length > 0);
  });

  it("blocks planning on incomplete greenfield", () => {
    const host = mockPlanningHost({
      scan: mockProjectScan([...FILES]),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "greenfield",
        runResult: "failed",
        setupStatus: "error",
        filesWritten: [...FILES],
        targetFolder: "/tmp/app",
        projectPath: "/tmp/app",
        latestAction: createLatestAction("failed", "npm install failed", {
          stage: "npm_install",
        }),
      },
    });
    const plan = createPlanOrchestration(host, "Add dark mode");
    assert.equal(plan, null);
    assert.match(host.createPlanErrorRef.current ?? "", /setup recovery/i);
  });
});
