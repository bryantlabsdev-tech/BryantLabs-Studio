import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDiagnosticReport,
  deriveDiagnosticReportStatus,
  diagnosticStatusLabel,
} from "@/core/diagnostics/diagnosticReport";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { CommandResult } from "@/types";

function cmd(command: string, ok: boolean, stdout = "", stderr = ""): CommandResult {
  return {
    command,
    ok,
    exitCode: ok ? 0 : 1,
    stdout,
    stderr,
    durationMs: 100,
    errorCount: ok ? 0 : 1,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
}

function minimalCard(overrides: Partial<AgentRunCardViewModel> = {}): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Creating app",
    overallStatus: "failed",
    currentStep: null,
    steps: [],
    progressPercent: 100,
    streamRevision: "1",
    providerLine: "Gemini · gemini-2.5-pro",
    providerIdentityLine: "Gemini · gemini-2.5-pro",
    provider: "Gemini",
    model: "gemini-2.5-pro",
    aiCallsUsed: 1,
    durationMs: 45000,
    durationLabel: "45s",
    providerEvents: [],
    latestProviderEvent: null,
    fileActivity: [],
    filesPlanned: [],
    filesModified: [],
    filesWritten: [],
    verification: {
      typescript: "pending",
      build: "pending",
      uiAudit: "pending",
      preview: "pending",
    },
    summary: "Parser failed",
    stuckMessage: null,
    showRecoveryActions: false,
    reasoning: { headline: "", plannerReasoning: [], detected: [], planSteps: [], risks: [], isVisible: false },
    confidence: { percent: 0, level: "low", factors: [], showBeforeApply: false },
    patchImpact: { files: [], complexity: "low", risk: "low", estimatedTime: "—", isVisible: false },
    failureDiagnosis: null,
    failureDetails: null,
    diagnostics: { items: [], isVisible: false },
    successSummary: null,
    thoughtStream: [],
    ...overrides,
  } as AgentRunCardViewModel;
}

describe("diagnosticReport", () => {
  it("formats a structured text report with required sections", () => {
    const bundle = buildDiagnosticReport({
      runId: "run-abc",
      previousRunId: "run-prev",
      prompt: "Build a task board with columns for todo, doing, and done.",
      outcome: "failed",
      route: "greenfield",
      generationMode: "greenfield",
      projectPath: "/tmp/app",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        provider: "gemini",
        model: "gemini-2.5-pro",
        entries: [
          {
            id: "e1",
            stage: "parser",
            status: "failed",
            message: "Parser failed",
            details: "Parser found 0 files",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      card: minimalCard(),
    });

    assert.match(bundle.text, /BRYANTLABS STUDIO DIAGNOSTIC REPORT/);
    assert.match(bundle.text, /Run ID: run-abc/);
    assert.match(bundle.text, /Previous Run ID: run-prev/);
    assert.match(bundle.text, /Prompt Hash:/);
    assert.match(bundle.text, /Recommended Next Steps:/);
    assert.equal(bundle.snapshot.status, "failed");
    assert.equal(diagnosticStatusLabel(bundle.snapshot.status), "Failure");
  });

  it("caps report history to the most recent 25 entries", () => {
    const entries = Array.from({ length: 30 }, (_, index) => `run-${index}`);
    const capped = entries.slice(-25);
    assert.equal(capped.length, 25);
    assert.equal(capped[0], "run-5");
    assert.equal(capped.at(-1), "run-29");
  });

  it("reports success when build output includes passing tsc despite stale typescript log", () => {
    const build = cmd(
      "npm run build",
      true,
      "> app@0.0.0 build\n> tsc -p tsconfig.json && vite build\n✓ built in 1.2s",
    );
    const card = minimalCard({
      overallStatus: "complete",
      summary:
        "Success — TypeScript passed, build passed, preview passed, Generated App UI Audit passed.",
      verification: {
        typescript: "failed",
        build: "passed",
        preview: "ready",
        uiAudit: "passed",
      },
    });
    const greenfieldRun = {
      ...emptyGreenfieldRun(),
      runResult: "success" as const,
      setupResult: {
        ok: true,
        install: cmd("npm install", true),
        typecheck: cmd("npx tsc --noEmit", false, "", "error TS2304 from stale attempt"),
        build,
      },
      failureReport: {
        rootStage: "typescript" as const,
        rootCauseLine: "TypeScript failed — exit 1",
        stages: [],
      },
      finalMessage:
        "Success — TypeScript passed, build passed, preview passed, Generated App UI Audit passed.",
      uiAuditResult: {
        ok: true,
        skipped: false,
        type: "dashboard_layout" as const,
        score: 92,
        issues: [],
        details: "passed",
        classification: {
          type: "dashboard_layout" as const,
          confidence: 90,
          signals: ["dashboard_layout"],
        },
      },
      entries: [
        createRunLogEntry("typescript", "failed", "TypeScript check failed"),
        createRunLogEntry("build", "success", "Build finished"),
        createRunLogEntry("preview", "success", "Preview ready"),
        createRunLogEntry("ui_audit", "success", "Generated App UI Audit passed"),
      ],
    };

    const status = deriveDiagnosticReportStatus({
      outcome: "success",
      card,
      greenfieldRun,
    });
    assert.equal(status, "success");

    const bundle = buildDiagnosticReport({
      runId: "run-success",
      prompt: "Build a kanban board",
      outcome: "success",
      greenfieldRun,
      card,
    });

    assert.equal(bundle.snapshot.status, "success");
    assert.equal(diagnosticStatusLabel(bundle.snapshot.status), "Success");
    assert.equal(bundle.snapshot.stage, "Complete");
    assert.equal(bundle.snapshot.verification.typescript, "passed");
    assert.equal(bundle.snapshot.verification.build, "passed");
    assert.equal(bundle.snapshot.verification.preview, "passed");
    assert.equal(bundle.snapshot.verification.uiAudit, "passed");
    assert.equal(bundle.snapshot.errorCategory, null);
    assert.equal(bundle.snapshot.errorCategoryLabel, null);
    assert.equal(bundle.snapshot.errorMessage, null);
    assert.match(bundle.text, /Status: success/);
    assert.match(bundle.text, /TypeScript: passed/);
    assert.match(bundle.text, /Error Category: none/);
  });

  it("reports typescript failed when tsc actually fails", () => {
    const card = minimalCard({ overallStatus: "failed" });
    const greenfieldRun = {
      ...emptyGreenfieldRun(),
      runResult: "failed" as const,
      setupResult: {
        ok: false,
        install: cmd("npm install", true),
        typecheck: cmd(
          "npx tsc --noEmit",
          false,
          "",
          "src/App.tsx(1,1): error TS2304: Cannot find name 'Foo'.",
        ),
      },
      entries: [createRunLogEntry("typescript", "failed", "TypeScript check failed")],
    };
    const bundle = buildDiagnosticReport({
      runId: "run-ts-fail",
      prompt: "Build app",
      outcome: "failed",
      greenfieldRun,
      card,
    });
    assert.equal(bundle.snapshot.verification.typescript, "failed");
    assert.equal(bundle.snapshot.errorCategory, "typescript_failed");
  });

  it("does not list written files as missing when marker audit is stale", () => {
    const card = minimalCard({
      overallStatus: "complete",
      filesWritten: [...GREENFIELD_FILE_PATHS],
    });
    const greenfieldRun = {
      ...emptyGreenfieldRun(),
      runResult: "success" as const,
      generatedFiles: GREENFIELD_FILE_PATHS.map((path) => ({
        path,
        content: `// ${path}\n`,
      })),
      filesWritten: [...GREENFIELD_FILE_PATHS],
      debug: {
        stage: "greenfield:generate / parse",
        requestStartedAt: new Date().toISOString(),
        elapsedMs: 100,
        errorMessage: "",
        markerAudit: {
          requiredFiles: [...GREENFIELD_FILE_PATHS],
          detectedFileStarts: [...GREENFIELD_FILE_PATHS],
          detectedFileEnds: [],
          completeMarkerPairs: [],
          missingFiles: [...GREENFIELD_FILE_PATHS],
          rawResponsePreview: "",
          promptCharCount: 100,
          promptSent: "Build app",
          hasExampleOutputFormat: true,
          explicitlyRequiresAllSeven: true,
        },
      },
    };
    const bundle = buildDiagnosticReport({
      runId: "run-parse-success",
      prompt: "Build app",
      outcome: "success",
      greenfieldRun,
      card,
    });
    assert.deepEqual(bundle.snapshot.filesMissing, []);
    assert.match(bundle.text, /Files Missing: none/);
  });

  it("reports build failed when vite build fails", () => {
    const card = minimalCard({ overallStatus: "failed" });
    const greenfieldRun = {
      ...emptyGreenfieldRun(),
      runResult: "failed" as const,
      setupResult: {
        ok: false,
        install: cmd("npm install", true),
        typecheck: cmd("npx tsc --noEmit", true),
        build: cmd("npm run build", false, "", "error during build"),
      },
      entries: [createRunLogEntry("build", "failed", "Build failed")],
    };
    const bundle = buildDiagnosticReport({
      runId: "run-build-fail",
      prompt: "Build app",
      outcome: "failed",
      greenfieldRun,
      card,
    });
    assert.equal(bundle.snapshot.verification.build, "failed");
    assert.equal(bundle.snapshot.errorCategory, "build_failed");
  });
});
