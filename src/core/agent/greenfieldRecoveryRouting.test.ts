import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGreenfieldFallbackSourceFileCount } from "@/core/agent/agentGreenfieldDispatch";
import {
  buildGreenfieldRecoveryContext,
  shouldBlockEditForIncompleteGreenfield,
  shouldBlockApplyPlanForIncompleteGreenfield,
  shouldRouteGreenfieldRecovery,
} from "@/core/agent/greenfieldRecoveryRouting";
import { hashPrompt } from "@/core/agent/runContextReset";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { createLatestAction } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun, type GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";
import type { CommandResult } from "@/types";

const FIELD_FLOW_PROMPT =
  "Build FieldFlow — a field service management app with job scheduling, customer list, and map view.";

const GREENFIELD_WRITTEN_FILES = [
  "package.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
] as const;

function okCommand(command: string): CommandResult {
  return {
    command,
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 1,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
}

function failCommand(command: string, stderr: string): CommandResult {
  return {
    command,
    ok: false,
    exitCode: 1,
    stdout: "",
    stderr,
    durationMs: 1,
    errorCount: 1,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
}

function failedNpmInstallGreenfieldRun(projectPath: string): GreenfieldRunSnapshot {
  return {
    ...emptyGreenfieldRun(),
    actionType: "greenfield",
    runResult: "failed",
    genStatus: "done",
    writeStatus: "done",
    setupStatus: "error",
    filesWritten: [...GREENFIELD_WRITTEN_FILES],
    generatedFiles: GREENFIELD_WRITTEN_FILES.map((path) => ({
      path,
      content: `// ${path}`,
    })),
    targetFolder: projectPath,
    projectPath,
    workflow: { prompt: FIELD_FLOW_PROMPT },
    routeDecision: {
      selectedRoute: "greenfield",
      selectionReason: "empty_folder",
      candidates: ["greenfield", "build_loop"],
      greenfieldRejected: false,
      greenfieldRejectReason: null,
      fallbackSourceCount: 0,
      scannedSourceCount: 0,
      sourceCountUsed: 0,
    },
    latestAction: createLatestAction("failed", "npm install failed", {
      stage: "npm_install",
      detail: "npm error code ETARGET",
    }),
    setupResult: {
      ok: false,
      install: failCommand("npm install", "npm error code ETARGET"),
      error: "npm install failed",
    },
    finalMessage: "npm install failed",
  };
}

describe("greenfield recovery routing", () => {
  it("routes same prompt retry after failed npm install to greenfield_recovery", () => {
    const projectPath = "/tmp/fieldflow";
    const run = failedNpmInstallGreenfieldRun(projectPath);
    const ctx = buildGreenfieldRecoveryContext({
      prompt: FIELD_FLOW_PROMPT,
      projectPath,
      greenfieldRun: run,
    });
    assert.ok(ctx);
    assert.equal(ctx.previousPromptHash, hashPrompt(FIELD_FLOW_PROMPT));
    assert.equal(ctx.currentPromptHash, hashPrompt(FIELD_FLOW_PROMPT));
    assert.equal(shouldRouteGreenfieldRecovery(ctx, run), true);

    const fallback = buildGreenfieldFallbackSourceFileCount(run, projectPath);
    assert.equal(fallback, undefined);

    const route = routeAgentPrompt({
      prompt: FIELD_FLOW_PROMPT,
      projectOpen: true,
      projectPath,
      scan: mockProjectScan([...GREENFIELD_WRITTEN_FILES], { packageJson: true }),
      scanStatus: "done",
      filesWritten: run.filesWritten,
      greenfieldRecovery: true,
      greenfieldRecoveryReason: "failed_greenfield_npm_install",
    });

    assert.equal(route.execution, "greenfield_recovery");
    assert.equal(route.decision.selectedRoute, "greenfield_recovery");
    assert.notEqual(route.execution, "build_loop");
  });

  it("blocks apply_plan for incomplete greenfield with same prompt", () => {
    const projectPath = "/tmp/fieldflow";
    const run = failedNpmInstallGreenfieldRun(projectPath);
    assert.equal(
      shouldBlockApplyPlanForIncompleteGreenfield({
        prompt: FIELD_FLOW_PROMPT,
        projectPath,
        greenfieldRun: run,
      }),
      true,
    );
  });

  it("blocks edit on incomplete greenfield even when prompt differs", () => {
    const projectPath = "/tmp/fieldflow";
    const run = failedNpmInstallGreenfieldRun(projectPath);
    assert.equal(
      shouldBlockEditForIncompleteGreenfield({
        projectPath,
        greenfieldRun: run,
      }),
      true,
    );
    assert.equal(
      shouldRouteGreenfieldRecovery(
        buildGreenfieldRecoveryContext({
          prompt: "Add dark mode toggle",
          projectPath,
          greenfieldRun: run,
        }),
        run,
      ),
      false,
    );
  });

  it("routes different follow-up after successful greenfield to edit, not recovery", () => {
    const projectPath = "/tmp/fieldflow-success";
    const run: GreenfieldRunSnapshot = {
      ...failedNpmInstallGreenfieldRun(projectPath),
      runResult: "success",
      setupStatus: "done",
      setupResult: {
        ok: true,
        install: okCommand("npm install"),
        typecheck: okCommand("npm run typecheck"),
        build: okCommand("npm run build"),
      },
    };
    const followUp = "Add dark mode toggle and persist preference in localStorage.";
    const ctx = buildGreenfieldRecoveryContext({
      prompt: followUp,
      projectPath,
      greenfieldRun: run,
    });
    assert.equal(shouldRouteGreenfieldRecovery(ctx, run), false);

    const fallback = buildGreenfieldFallbackSourceFileCount(run, projectPath);
    assert.ok(fallback && fallback > 0);

    const route = routeAgentPrompt({
      prompt: followUp,
      projectOpen: true,
      projectPath,
      scan: mockProjectScan([...GREENFIELD_WRITTEN_FILES], { packageJson: true }),
      scanStatus: "done",
      filesWritten: run.filesWritten,
      previousSuccessfulRun: true,
      fallbackSourceFileCount: fallback,
    });

    assert.equal(route.execution, "build_loop");
    assert.notEqual(route.execution, "greenfield_recovery");
  });

  it("does not recover when prompt hash differs", () => {
    const projectPath = "/tmp/fieldflow";
    const run = failedNpmInstallGreenfieldRun(projectPath);
    const ctx = buildGreenfieldRecoveryContext({
      prompt: "Build a different app entirely",
      projectPath,
      greenfieldRun: run,
    });
    assert.equal(shouldRouteGreenfieldRecovery(ctx, run), false);
  });

  it("recovers when rephrased prompt matches original intent", () => {
    const projectPath = "/tmp/fieldflow";
    const run = failedNpmInstallGreenfieldRun(projectPath);
    const ctx = buildGreenfieldRecoveryContext({
      prompt: "Build FieldFlow field service app with scheduling and customer list",
      projectPath,
      greenfieldRun: run,
    });
    assert.equal(shouldRouteGreenfieldRecovery(ctx, run), true);
  });
});

describe("buildApplyPlanZeroProposalsReport recovery diagnostics", () => {
  it("includes selectedFiles, patchTargets, planner output, and route hint", async () => {
    const { buildApplyPlanZeroProposalsReport } = await import(
      "@/core/diagnostics/failureReport"
    );
    const report = buildApplyPlanZeroProposalsReport({
      diagnostics: [{ path: "src/App.tsx", reason: "Model returned empty response" }],
      selectedFiles: ["src/App.tsx", "src/index.css"],
      patchTargets: ["src/App.tsx"],
      plannerOutput: "Update App.tsx styling for dark mode.",
      routeSelectionHint:
        "Route selection likely wrong: previous greenfield run failed before build completed.",
    });
    const detail = report.stages[0]?.detail ?? "";
    assert.match(detail, /Selected files:/);
    assert.match(detail, /src\/App\.tsx/);
    assert.match(detail, /Patch targets:/);
    assert.match(detail, /Planner output/);
    assert.match(detail, /Route selection:/);
    assert.match(detail, /previous greenfield run failed before build completed/);
  });
});
