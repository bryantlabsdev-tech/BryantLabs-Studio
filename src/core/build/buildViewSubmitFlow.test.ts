import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateBuildViewSubmit } from "@/core/build/buildViewSubmitFlow";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { mockProjectScan } from "@/core/repository/testScan";

function flow(modeOverride: "auto" | "ask" | "edit") {
  const scan = mockProjectScan(["package.json", "src/App.tsx"]);
  const prompt = "Edit src/App.tsx and add a dark-mode toggle";
  return {
    input: {
      trimmed: prompt,
      hasProject: true,
      projectPath: "/tmp/app",
      scan,
      scanStatus: "done" as const,
      modeOverride,
      greenfieldRun: emptyGreenfieldRun(),
      lastArtifact: null,
      greenfieldFallbackCount: undefined,
      currentAppContext: null,
      sessionMemory: emptySessionMemory("/tmp/app", "main"),
      analyzeFeasibility: () => ({
        prompt,
        requiresConfirmation: false,
        requirements: [],
        missingLabels: [],
        headline: "ok",
        detail: "",
      }),
      activeAgentRunId: null,
      providerSettings: { provider: "mock" },
      providerStatus: { provider: "mock", model: "mock-deterministic" },
    },
    route: routeAgentPrompt({
      prompt,
      projectOpen: true,
      scan,
      scanStatus: "done",
      modeOverride,
    }),
  };
}

describe("evaluateBuildViewSubmit Ask mode", () => {
  it("never returns follow_up or greenfield while Ask is selected", () => {
    const { input, route } = flow("ask");
    const gate = evaluateBuildViewSubmit(input, route);
    assert.equal(gate.kind, "consultation");
    if (gate.kind !== "consultation") return;
    assert.equal(gate.mixedEdit, false);
    assert.equal(gate.route.execution, "consultation");
  });

  it("keeps Auto mutation prompts on the edit path", () => {
    const { input, route } = flow("auto");
    assert.equal(route.execution, "build_loop");
    const gate = evaluateBuildViewSubmit(input, route);
    assert.equal(gate.kind, "follow_up");
  });

  it("keeps Auto questions on consultation and Auto run prompts on run_command", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    const question = "What does App.tsx do?";
    const questionInput = {
      ...flow("auto").input,
      trimmed: question,
    };
    const questionRoute = routeAgentPrompt({
      prompt: question,
      projectOpen: true,
      scan,
      scanStatus: "done",
      modeOverride: "auto",
    });
    assert.equal(questionRoute.execution, "consultation");
    assert.equal(evaluateBuildViewSubmit(questionInput, questionRoute).kind, "consultation");

    const runPrompt = "Run the build";
    const runInput = { ...flow("auto").input, trimmed: runPrompt };
    const runRoute = routeAgentPrompt({
      prompt: runPrompt,
      projectOpen: true,
      scan,
      scanStatus: "done",
      modeOverride: "auto",
    });
    assert.equal(runRoute.execution, "run_command");
    assert.equal(evaluateBuildViewSubmit(runInput, runRoute).kind, "run_command");

    const askRun = routeAgentPrompt({
      prompt: runPrompt,
      projectOpen: true,
      scan,
      scanStatus: "done",
      modeOverride: "ask",
    });
    assert.equal(
      evaluateBuildViewSubmit({ ...runInput, modeOverride: "ask" }, askRun).kind,
      "consultation",
    );
  });
});
