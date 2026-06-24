import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveAgentRunConfidence,
  deriveAgentRunDiagnostics,
  deriveAgentRunFailureDiagnosis,
  deriveAgentRunPatchImpact,
  deriveAgentRunReasoning,
  deriveAgentRunSuccessSummary,
  suggestFixFromDiagnostic,
} from "@/core/agent/agentRunInsight";
import { buildVerificationFailureReport } from "@/core/diagnostics/failureReport";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { Plan } from "@/core/planner/types";
import type { ProjectScan } from "@/types";

function samplePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    prompt: "Add achievements",
    intent: "Gameplay feature",
    summary: "Add achievement tracking",
    files: [
      {
        path: "src/App.tsx",
        absPath: "/proj/src/App.tsx",
        score: 9,
        reasons: ["Contains game state"],
      },
      {
        path: "src/index.css",
        absPath: "/proj/src/index.css",
        score: 7,
        reasons: ["Contains board styling"],
      },
    ],
    proposedChanges: [
      "Add achievement state",
      "Add persistence",
      "Add achievement modal",
      "Update win screen",
    ],
    confidence: "High",
    impact: "Medium",
    createdAt: Date.now(),
    ...overrides,
  };
}

function sampleScan(): ProjectScan {
  return {
    root: "/proj",
    files: [
      { path: "src/App.tsx", mtimeMs: 0 },
      { path: "src/index.css", mtimeMs: 0 },
      { path: "src/main.tsx", mtimeMs: 0 },
    ],
    index: [],
    summary: {
      framework: "React",
      language: "TypeScript",
      bundler: "Vite",
      packageManager: "npm",
      entryPoints: ["src/main.tsx"],
      totalFiles: 3,
      totalFolders: 1,
      detections: {
        react: true,
        viteConfig: true,
        tsconfig: true,
        electron: false,
        nextjs: false,
        node: false,
        packageJson: true,
      },
    },
  } as unknown as ProjectScan;
}

describe("deriveAgentRunReasoning", () => {
  it("builds detected items and plan steps from planner data only", () => {
    const reasoning = deriveAgentRunReasoning({
      prompt: "Add achievements to the Sudoku app",
      plan: samplePlan(),
      aiPlan: null,
      scan: sampleScan(),
      planApplySession: null,
      greenfieldRun: emptyGreenfieldRun(),
      verification: {
        typescript: "pending",
        build: "pending",
        uiAudit: "pending",
        preview: "pending",
      },
      filesModified: [],
      runActive: true,
      currentStepId: "planning",
    });

    assert.equal(reasoning.isVisible, true);
    assert.match(reasoning.headline, /achievement/i);
    assert.ok(reasoning.detected.some((d) => /App\.tsx.*game state/i.test(d.text)));
    assert.ok(reasoning.detected.some((d) => /index\.css.*styling/i.test(d.text)));
    assert.deepEqual(reasoning.planSteps, [
      "Add achievement state",
      "Add persistence",
      "Add achievement modal",
      "Update win screen",
    ]);
  });

  it("uses AI plan reasoning when available", () => {
    const reasoning = deriveAgentRunReasoning({
      prompt: "Polish UI",
      plan: null,
      aiPlan: {
        ok: true,
        provider: "anthropic",
        model: "claude-opus-4-6",
        latencyMs: 1200,
        raw: {},
        plan: {
          summary: "Improve modal styling",
          files: [{ path: "src/App.tsx", reason: "Modal lives here" }],
          reasoning: "The modal component is defined in App.tsx",
          risks: [],
          confidence: "High",
        },
      },
      scan: null,
      planApplySession: null,
      greenfieldRun: emptyGreenfieldRun(),
      verification: {
        typescript: "pending",
        build: "pending",
        uiAudit: "pending",
        preview: "pending",
      },
      filesModified: [],
      runActive: true,
      currentStepId: "planning",
    });

    assert.ok(reasoning.plannerReasoning.some((s) => /modal component/i.test(s)));
    assert.ok(reasoning.planSteps.some((s) => /App\.tsx/.test(s)));
  });
});

describe("deriveAgentRunConfidence", () => {
  it("calculates high confidence from planner output", () => {
    const confidence = deriveAgentRunConfidence({
      prompt: "Add timer",
      plan: samplePlan({ confidence: "High", impact: "Low" }),
      aiPlan: null,
      scan: sampleScan(),
      planApplySession: null,
      greenfieldRun: emptyGreenfieldRun(),
      verification: {
        typescript: "pending",
        build: "pending",
        uiAudit: "pending",
        preview: "pending",
      },
      filesModified: [],
      runActive: true,
      currentStepId: "planning",
    });

    assert.ok(confidence.percent >= 80);
    assert.equal(confidence.level, "high");
    assert.ok(confidence.factors.some((f) => f.positive && /Required files found/i.test(f.text)));
    assert.ok(confidence.showBeforeApply);
  });

  it("lowers confidence when risks are present", () => {
    const confidence = deriveAgentRunConfidence({
      prompt: "Rewrite architecture",
      plan: samplePlan({ confidence: "Low", impact: "High" }),
      aiPlan: {
        ok: true,
        provider: "gemini",
        model: "gemini-2.0-flash",
        latencyMs: 900,
        raw: {},
        plan: {
          summary: "Large refactor",
          files: [],
          reasoning: "",
          risks: ["Multiple possible implementations", "Large file complexity"],
          confidence: "Low",
        },
      },
      scan: sampleScan(),
      planApplySession: null,
      greenfieldRun: emptyGreenfieldRun(),
      verification: {
        typescript: "pending",
        build: "pending",
        uiAudit: "pending",
        preview: "pending",
      },
      filesModified: [],
      runActive: true,
      currentStepId: "editing",
    });

    assert.ok(confidence.percent < 70);
    assert.ok(confidence.factors.some((f) => !f.positive));
  });
});

describe("deriveAgentRunPatchImpact", () => {
  it("shows per-file diff stats before apply", () => {
    const impact = deriveAgentRunPatchImpact({
      prompt: "Add achievements",
      plan: samplePlan(),
      aiPlan: null,
      scan: sampleScan(),
      planApplySession: {
        applyRunId: "run-1",
        prompt: "Add achievements",
        planSummary: "Add achievements",
        planSource: "deterministic",
        applyTargetCount: 2,
        applySkippedCount: 0,
        files: [
          {
            relPath: "src/App.tsx",
            absPath: "/proj/src/App.tsx",
            selectionReason: "game state",
            planReason: "game state",
            status: "ready",
            decision: "approved",
            diffStats: { added: 142, removed: 18, changed: true },
          },
          {
            relPath: "src/index.css",
            absPath: "/proj/src/index.css",
            selectionReason: "styles",
            planReason: "styles",
            status: "ready",
            decision: "approved",
            diffStats: { added: 35, removed: 6, changed: true },
          },
        ],
        phase: "review",
        selectedRelPath: null,
        applyError: null,
        verification: null,
        totals: {
          filesChanged: 2,
          linesAdded: 177,
          linesRemoved: 24,
          filesApproved: 2,
          filesApplied: 0,
        },
      },
      greenfieldRun: emptyGreenfieldRun(),
      verification: {
        typescript: "pending",
        build: "pending",
        uiAudit: "pending",
        preview: "pending",
      },
      filesModified: [],
      runActive: true,
      currentStepId: "editing",
    });

    assert.equal(impact.isVisible, true);
    assert.equal(impact.files.length, 2);
    assert.equal(impact.files[0]?.added, 142);
    assert.equal(impact.files[1]?.removed, 6);
    assert.equal(impact.complexity, "Medium");
    assert.match(impact.estimatedTime, /minute/i);
  });
});

describe("deriveAgentRunFailureDiagnosis", () => {
  it("formats root cause with suggested fix from TypeScript diagnostics", () => {
    const report = buildVerificationFailureReport(
      {
        typecheck: {
          ok: false,
          command: "npm run typecheck",
          exitCode: 2,
          stdout: "",
          stderr:
            'src/App.tsx(412,9): error TS2339: Property "achievementCount" does not exist on type "PlayerStats".',
          durationMs: 1000,
          timedOut: false,
          truncated: false,
          errorCount: 1,
          warningCount: 0,
        },
        build: {
          ok: true,
          command: "npm run build",
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 1,
          timedOut: false,
          truncated: false,
          errorCount: 0,
          warningCount: 0,
        },
        ranAt: Date.now(),
      },
      null,
    );

    const diagnosis = deriveAgentRunFailureDiagnosis(
      report,
      emptyGreenfieldRun(),
      true,
    );
    assert.ok(diagnosis);
    assert.match(diagnosis!.errorLocation ?? "", /App\.tsx:412/);
    assert.match(diagnosis!.reason, /achievementCount/);
    assert.match(diagnosis!.suggestedFix ?? "", /PlayerStats/);
  });

  it("diagnoses UI audit failures with root cause and suggested fix", () => {
    const run = {
      ...emptyGreenfieldRun(),
      uiAuditResult: {
        ok: false,
        skipped: false,
        auditLabel: "Generated App UI Audit",
        type: "grid_layout" as const,
        score: 62,
        issues: ["insufficient_cells" as const],
        details: "grid_layout score=62 issues=insufficient_cells",
        classification: {
          type: "grid_layout" as const,
          confidence: 88,
          signals: ["grid_layout"],
        },
        metrics: {
          gridCellCount: 72,
          gridExpectedCells: 81,
          gridBoardFound: true,
          calculatorButtonCount: null,
          calculatorButtonsTooSmall: null,
          calculatorDisplayHeight: null,
          calculatorDisplayVisible: null,
          formFieldCount: null,
          tableRowCount: null,
          visibleControlCount: 3,
          dashboardPanelCount: 0,
          chatMessageCount: null,
          rootHasContent: true,
          horizontalOverflow: false,
        },
      },
    };

    const diagnostics = deriveAgentRunDiagnostics(null, run, true);
    assert.equal(diagnostics.isVisible, true);
    assert.equal(diagnostics.items[0]?.title, "Generated App UI Audit: Grid Layout Failure");
    assert.match(diagnostics.items[0]?.reason ?? "", /Expected 81 visible cells but detected 72/);
    assert.match(
      diagnostics.items[0]?.suggestedFix ?? "",
      /Ensure enough visible cells or rows render/i,
    );
    assert.ok(diagnostics.items[0]?.detailLines?.some((line) => line.includes("insufficient_cells")));

    const diagnosis = deriveAgentRunFailureDiagnosis(null, run, true);
    assert.ok(diagnosis);
    assert.equal(diagnosis!.title, "Generated App UI Audit: Grid Layout Failure");
    assert.match(diagnosis!.reason, /Expected 81 visible cells but detected 72/);
  });

  it("diagnoses missing board failures with board-not-found title", () => {
    const run = {
      ...emptyGreenfieldRun(),
      uiAuditResult: {
        ok: false,
        skipped: false,
        auditLabel: "Generated App UI Audit",
        type: "grid_layout" as const,
        score: 0,
        issues: ["no_board" as const],
        details: "Board not found",
        classification: {
          type: "grid_layout" as const,
          confidence: 0,
          signals: [],
        },
      },
    };

    const diagnostics = deriveAgentRunDiagnostics(null, run, true);
    assert.equal(diagnostics.items[0]?.title, "Generated App UI Audit: Board Not Found");
    assert.match(diagnostics.items[0]?.reason ?? "", /No recognizable grid layout detected/i);
  });
});

describe("suggestFixFromDiagnostic", () => {
  it("suggests interface updates for missing properties", () => {
    const fix = suggestFixFromDiagnostic({
      file: "src/App.tsx",
      line: 412,
      column: 9,
      code: "TS2339",
      message: 'Property "achievementCount" does not exist on type "PlayerStats".',
      category: "error",
      raw: "",
    });
    assert.match(fix ?? "", /Add achievementCount to PlayerStats/);
  });
});

describe("deriveAgentRunSuccessSummary", () => {
  it("generates structured success summary from plan and verification", () => {
    const summary = deriveAgentRunSuccessSummary({
      filesModified: ["src/App.tsx", "src/index.css"],
      verification: {
        typescript: "passed",
        build: "passed",
        uiAudit: "skipped",
        preview: "ready",
      },
      plan: samplePlan(),
      aiPlan: null,
      planApplySession: null,
      greenfieldRun: emptyGreenfieldRun(),
    });

    assert.deepEqual(summary.filesModified, ["src/App.tsx", "src/index.css"]);
    assert.ok(summary.changes.includes("Add achievement state"));
    assert.ok(summary.verification.some((v) => v.label === "TypeScript" && v.passed));
    assert.match(summary.summaryLine, /Updated 2 files/);
    assert.match(summary.summaryLine, /Preview passed|Preview ready|Preview/);
  });
});
