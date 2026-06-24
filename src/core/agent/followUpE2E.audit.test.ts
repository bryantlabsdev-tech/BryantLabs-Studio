import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasEstablishedAppContext, buildCurrentAppContext } from "@/core/agent/agentAppContext";
import { buildPlanPreviewLine } from "@/core/agent/planPreview";
import { assessPromptClarity } from "@/core/agent/promptConfidence";
import { auditProjectForEdit } from "@/core/agent/projectEditAudit";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { AGENT_UX_STAGE_LABELS } from "@/core/agent/agentUxLabels";
import {
  deriveFollowUpRunPhase,
  FOLLOWUP_RUN_PHASE_LABELS,
} from "@/core/build/followUpRun";
import { mockProjectScan } from "@/core/repository/testScan";
import { effectivePlanPrompt } from "@/core/sessionMemory/promptContext";
import { emptySessionMemory, recordPrompt } from "@/core/sessionMemory/store";

function viteSudokuScan() {
  return mockProjectScan(
    [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "src/main.tsx",
      "src/App.tsx",
      "src/index.css",
    ],
    { packageJson: true },
  );
}

describe("agent follow-up E2E audit", () => {
  it("greenfield create then bare follow-ups route and expand context", () => {
    const empty = mockProjectScan([], { packageJson: false });
    const created = viteSudokuScan();

    const createRoute = routeAgentPrompt({
      prompt: "Build a Sudoku app",
      projectOpen: true,
      scan: empty,
      scanStatus: "done",
    });
    assert.equal(createRoute.execution, "greenfield");
    assert.equal(createRoute.mode, "create_new_app");

    let memory = emptySessionMemory("/sudoku", "main");
    memory = recordPrompt(memory, "Build a Sudoku app");

    for (const followUp of ["Add a timer", "Make it blue", "Add hints"]) {
      const route = routeAgentPrompt({
        prompt: followUp,
        projectOpen: true,
        scan: created,
        scanStatus: "done",
      });
      assert.equal(route.mode, "edit_existing_project", `${followUp} should edit`);
      assert.equal(route.execution, "build_loop");

      const effective = effectivePlanPrompt(followUp, memory, {
        appNameHint: "Sudoku",
      });
      assert.match(effective, /Sudoku/i, `${followUp} should attach Sudoku context`);
      memory = recordPrompt(memory, followUp);
    }
  });

  it("pre-edit audit and memory panel reflect an existing app", () => {
    const scan = viteSudokuScan();
    let memory = emptySessionMemory("/sudoku", "main");
    memory = recordPrompt(memory, "Build a Sudoku app");

    const audit = auditProjectForEdit(scan);
    assert.ok(audit);
    assert.equal(audit!.appFile, "src/App.tsx");

    const ctx = buildCurrentAppContext({
      scan,
      audit,
      sessionMemory: memory,
      chat: [{ id: "1", role: "user", text: "Build a Sudoku app", at: Date.now() }],
      projectMemory: {
        projectName: "Sudoku",
        architecture: "React + TypeScript",
        userPreferences: "",
        notes: "Features:\n- Puzzle board",
        updatedAt: Date.now(),
      },
      projectFacts: [{ id: "sudoku", label: "Sudoku board exists", present: true }],
      projectName: "sudoku-app",
    });

    assert.ok(ctx);
    assert.equal(ctx!.appName, "Sudoku");
    assert.ok(hasEstablishedAppContext(ctx, memory));
  });

  it("UX stages stay human-readable through verify phases", () => {
    assert.equal(FOLLOWUP_RUN_PHASE_LABELS.auditing, "Understanding project");
    assert.equal(FOLLOWUP_RUN_PHASE_LABELS.typescript, "Testing changes");
    assert.equal(AGENT_UX_STAGE_LABELS.previewing, "Preview ready");

    const planning = deriveFollowUpRunPhase({
      buildPhase: "planning",
      planApplyPhase: null,
      autoFixPhase: null,
      buildRunning: true,
      pipelineRunning: false,
      recentLogs: [],
      hasError: false,
    });
    assert.equal(planning, "planning");

    const verifying = deriveFollowUpRunPhase({
      buildPhase: "verifying",
      planApplyPhase: "verifying",
      autoFixPhase: null,
      buildRunning: true,
      pipelineRunning: false,
      recentLogs: [],
      hasError: false,
    });
    assert.equal(verifying, "typescript");
  });

  it("clarity gate allows chained edits once app context exists", () => {
    const memory = recordPrompt(emptySessionMemory("/p", "main"), "Build Sudoku");
    const ctx = buildCurrentAppContext({
      scan: viteSudokuScan(),
      audit: null,
      sessionMemory: memory,
      chat: [],
      projectMemory: {
        projectName: "Sudoku",
        architecture: "",
        userPreferences: "",
        notes: "",
        updatedAt: 0,
      },
      projectFacts: [],
      projectName: "sudoku",
    });

    for (const prompt of ["Add a timer", "Make it blue", "Add hints"]) {
      const clarity = assessPromptClarity(prompt, {
        hasAppContext: hasEstablishedAppContext(ctx, memory),
        hasProject: true,
      });
      assert.equal(clarity.confidence, "high", prompt);
      assert.match(buildPlanPreviewLine(prompt), /validating build/i);
    }
  });

  it("project memory hint resolves first follow-up after greenfield", () => {
    const memory = emptySessionMemory("/p", "main");
    const effective = effectivePlanPrompt("Add a timer", memory, {
      appNameHint: "Sudoku",
    });
    assert.match(effective, /Current app: Sudoku/i);
    assert.match(effective, /Project path:|Add a timer/i);
    assert.match(effective, /timer/i);
  });
});
