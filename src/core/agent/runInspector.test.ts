import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRunInspectorExport,
  buildRunInspectorViewModel,
  formatRunInspectorText,
} from "@/core/agent/runInspector";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import { createRunLogEntry } from "@/core/greenfield/runLog";

describe("runInspector", () => {
  it("derives timeline milestones and event stream from log entries", () => {
    const base = Date.now();
    const entries = [
      createRunLogEntry("prompt", "success", "Prompt submitted"),
      createRunLogEntry("folder", "success", "Greenfield project"),
      createRunLogEntry("provider_call", "running", "Sending request"),
      createRunLogEntry("provider_response", "success", "Response received"),
      createRunLogEntry("parser", "success", "Parsed 7 files"),
      createRunLogEntry("write", "success", "Wrote files"),
      createRunLogEntry("npm_install", "success", "npm install complete"),
      createRunLogEntry("build", "success", "Build passed"),
      createRunLogEntry("preview", "success", "Preview ready"),
    ].map((entry, index) => ({
      ...entry,
      timestamp: new Date(base + index * 1000).toISOString(),
    }));

    const model = buildRunInspectorViewModel({
      runId: "run-test",
      runNumber: 3,
      prompt: "Build a kanban board",
      outcome: "success",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "greenfield",
        entries,
        runStartedAt: base,
        durationMs: 9000,
        provider: "openai",
        model: "gpt-4o",
      },
    });

    assert.equal(model.timeline.length, 9);
    assert.equal(model.timeline[0]?.label, "Prompt Submitted");
    assert.equal(model.timeline.at(-1)?.label, "Preview Ready");
    assert.equal(model.events.length, 9);
    assert.equal(model.events.find((e) => e.event === "provider.request")?.message, "Sending request");
    assert.equal(model.events.find((e) => e.event === "parser.success")?.message, "Parsed 7 files");
    assert.equal(model.metrics.provider, "openai");
    assert.equal(model.metrics.commandsRun.includes("npm install"), true);
  });

  it("surfaces AI response audit data and file diffs", () => {
    const model = buildRunInspectorViewModel({
      runId: "run-ai",
      prompt: "Create app",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "greenfield",
        debug: {
          stage: "greenfield:generate / parse",
          requestStartedAt: new Date().toISOString(),
          elapsedMs: 100,
          errorMessage: "",
          markerAudit: {
            requiredFiles: ["package.json"],
            detectedFileStarts: ["package.json"],
            detectedFileEnds: ["package.json"],
            completeMarkerPairs: ["package.json"],
            missingFiles: ["src/App.tsx"],
            rawResponsePreview: "@@FILE:package.json@@\n{}",
            promptCharCount: 100,
            promptSent: "Build app",
            hasExampleOutputFormat: true,
            explicitlyRequiresAllSeven: false,
          },
        },
        entries: [
          createRunLogEntry("parser", "failed", "Missing markers", "Incomplete @@END markers"),
        ],
      },
      artifact: {
        runId: "run-ai",
        runNumber: 1,
        prompt: "Create app",
        userMessageId: null,
        startedAt: Date.now(),
        endedAt: Date.now(),
        durationMs: 1000,
        outcome: "failed",
        provider: null,
        model: null,
        filesModified: ["package.json"],
        fileDiffs: [
          {
            path: "package.json",
            linesAdded: 10,
            linesRemoved: 0,
            preview: [],
            before: "",
            after: "{}",
          },
        ],
        card: {
          title: "Creating app",
          summary: "Failed",
          durationMs: 1000,
          provider: null,
          model: null,
          filesModified: ["package.json"],
          steps: [],
          thoughtStream: [],
          isVisible: true,
          patchImpact: { files: [], totalAdded: 0, totalRemoved: 0 },
          verification: {},
          showRecoveryActions: false,
        } as never,
        dashboard: {} as never,
        timeline: null,
      },
    });

    assert.equal(model.aiResponse.parsedFiles[0], "package.json");
    assert.equal(model.aiResponse.missingFiles[0], "src/App.tsx");
    assert.ok(model.aiResponse.warnings.some((w) => /Incomplete/i.test(w)));
    assert.equal(model.metrics.filesCreated, 1);
    assert.equal(model.metrics.filesModified, 0);
    assert.equal(model.fileDiffs.length, 1);
  });

  it("exports JSON and text bundles", () => {
    const model = buildRunInspectorViewModel({
      runId: "run-export",
      prompt: "Test",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        entries: [createRunLogEntry("prompt", "success", "Submitted")],
      },
    });
    const bundle = buildRunInspectorExport(model);
    assert.match(bundle.text, /Run Inspector/);
    assert.match(bundle.text, /Timeline/);
    assert.match(bundle.json, /"run-export"/);
    assert.equal(formatRunInspectorText(model), bundle.text);
  });

  it("derives apply diagnostics from target and budget logs", () => {
    const model = buildRunInspectorViewModel({
      runId: "run-apply",
      prompt: "Fix UI audit",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        entries: [
          createRunLogEntry(
            "apply_plan",
            "running",
            "Apply targets resolved",
            [
              "plannedFiles: src/App.tsx, src/index.css",
              "allowlistedFiles: src/App.tsx, src/index.css",
              "patchTargets: src/App.tsx, src/index.css",
              "rejectedFiles: —",
            ].join("\n"),
          ),
          createRunLogEntry(
            "apply_plan",
            "running",
            "Patch generation budget",
            [
              "budgetMax: 3",
              "budgetUsed: 1",
              "budgetRemaining: 2",
              "budgetRequired: 1",
              "budgetExceeded: false",
              "budgetExceededReason: —",
              "runCancellationReason: —",
            ].join("\n"),
          ),
          createRunLogEntry(
            "ai_call",
            "failed",
            "coder apply_plan blocked",
            "budget gate",
          ),
        ],
      },
      planApplySession: {
        applyRunId: "apply-1",
        prompt: "Fix UI audit",
        planSummary: "Fix overflow",
        planSource: "ai",
        applyTargetCount: 2,
        applySkippedCount: 0,
        files: [
          {
            relPath: "src/App.tsx",
            absPath: "/p/src/App.tsx",
            selectionReason: "AI plan",
            planReason: "Wrap table",
            status: "ready",
            decision: "pending",
            diffStats: { added: 2, removed: 0, changed: true },
          },
          {
            relPath: "src/index.css",
            absPath: "/p/src/index.css",
            selectionReason: "AI plan",
            planReason: "Scroll rules",
            status: "ready",
            decision: "pending",
            diffStats: { added: 5, removed: 0, changed: true },
          },
        ],
        phase: "review",
        selectedRelPath: "src/App.tsx",
        applyError: null,
        verification: null,
        totals: null,
        directRewriteAvailable: false,
        lastModelRawText: null,
      },
    });

    assert.ok(model.apply);
    assert.deepEqual(model.apply?.plannedFiles, ["src/App.tsx", "src/index.css"]);
    assert.deepEqual(model.apply?.allowedFiles, ["src/App.tsx", "src/index.css"]);
    assert.equal(model.apply?.rejectedFiles.length, 0);
    assert.equal(model.apply?.patchGenerationProviderCalls, 1);
    assert.equal(model.apply?.budgetMax, 3);
    assert.equal(model.apply?.budgetUsed, 1);
    assert.equal(model.apply?.budgetRemaining, 2);
    assert.equal(model.apply?.patchProposalCount, 2);
    assert.match(formatRunInspectorText(model), /Apply plan/);
    assert.match(formatRunInspectorText(model), /Patch proposal count: 2/);
  });

  it("reports deterministic fallback apply metrics after session clear", () => {
    const beforeCss = ".table { width: 100%; }\n";
    const afterCss = `${beforeCss}@media (max-width: 768px) { table { overflow-x: auto; } }\n`;
    const model = buildRunInspectorViewModel({
      runId: "run-fallback-apply",
      prompt: "Fix UI audit",
      outcome: "success",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        entries: [
          createRunLogEntry(
            "apply_plan",
            "failed",
            "Patch generation budget blocked",
            [
              "budgetMax: 3",
              "budgetUsed: 1",
              "budgetRemaining: 0",
              "budgetRequired: 1",
              "budgetExceeded: true",
              "budgetExceededReason: Max AI calls reached (3 per run). Stop or raise the limit in Providers.",
              "runCancellationReason: —",
            ].join("\n"),
          ),
          createRunLogEntry(
            "apply_plan",
            "success",
            "Using deterministic patch proposal (provider unavailable)",
            "Deterministic UI audit fix",
          ),
          createRunLogEntry("write", "success", "Updated src/index.css"),
        ],
        appliedFileDiffs: [
          {
            path: "src/index.css",
            linesAdded: 2,
            linesRemoved: 0,
            preview: [{ type: "add", text: "@media (max-width: 768px) { table { overflow-x: auto; } }" }],
            before: beforeCss,
            after: afterCss,
          },
        ],
      },
      artifact: {
        runId: "run-fallback-apply",
        runNumber: 7,
        prompt: "Fix UI audit",
        userMessageId: null,
        startedAt: Date.now(),
        endedAt: Date.now(),
        durationMs: 1000,
        outcome: "success",
        provider: "gemini",
        model: "gemini-2.5-flash",
        filesModified: ["src/index.css"],
        fileDiffs: [
          {
            path: "src/index.css",
            linesAdded: 2,
            linesRemoved: 0,
            preview: [],
            before: beforeCss,
            after: afterCss,
          },
        ],
        card: {
          filesModified: ["src/index.css"],
          patchImpact: { files: [], totalAdded: 0, totalRemoved: 0 },
        } as never,
        dashboard: {} as never,
        timeline: null,
      },
    });

    assert.ok(model.apply);
    assert.equal(model.apply?.patchProposalCount, 1);
    assert.equal(model.apply?.deterministicFallbackUsed, true);
    assert.match(model.apply?.applyFallbackNote ?? "", /Provider coder failed/i);
    assert.deepEqual(model.aiResponse.proposedFiles, ["src/index.css"]);
    assert.equal(model.metrics.filesModified, 1);
    assert.equal(model.metrics.filesCreated, 0);
    assert.equal(model.fileDiffs.length, 1);
    assert.match(model.fileDiffs[0]?.after ?? "", /overflow-x:\s*auto/);
    assert.ok(
      model.aiResponse.warnings.some((warning) => /deterministic fallback patch used/i.test(warning)),
    );
  });

  it("ignores stale marker-audit missing list when all files were written", () => {
    const model = buildRunInspectorViewModel({
      runId: "run-complete",
      prompt: "Create app",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
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
      },
    });
    assert.deepEqual(model.aiResponse.missingFiles, []);
  });
});
