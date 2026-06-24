import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRunFailureSummaryLine,
  classifyRunFailureReason,
  deriveRunFailureDetails,
  suggestRunFailureNextSteps,
} from "@/core/agent/runFailureDiagnostics";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

describe("runFailureDiagnostics", () => {
  it("classifies provider timeout failures", () => {
    const reason = classifyRunFailureReason({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        entries: [
          {
            id: "e1",
            stage: "provider_response",
            status: "failed",
            message: "Provider request failed",
            details: "Request timed out after 120000ms",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      report: null,
      rawError: "Request timed out after 120000ms",
    });
    assert.equal(reason, "provider_timeout");
  });

  it("classifies parser zero files failures", () => {
    const reason = classifyRunFailureReason({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        generationMetrics: {
          promptCharCount: 100,
          promptByteCount: 100,
          userPromptCharCount: 100,
          responseCharCount: 0,
          responseByteCount: 0,
          maxOutputTokens: 8192,
          singleRequestAllFiles: true,
          providerWaitMs: 1000,
          parseMs: 1,
          totalMs: 1001,
          estimatedPromptTokens: 25,
          estimatedResponseTokens: 0,
        },
        entries: [
          {
            id: "e2",
            stage: "parser",
            status: "failed",
            message: "Parser failed",
            details: "Parser found 0 files",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      report: null,
      rawError: "Parser found 0 files",
    });
    assert.equal(reason, "parser_zero_files");
  });

  it("classifies budget exhaustion before parser zero files", () => {
    const reason = classifyRunFailureReason({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        entries: [
          {
            id: "e-budget",
            stage: "parser",
            status: "failed",
            message: "Parser failed",
            details:
              "Max AI calls reached (3 per run). Generation stopped to reserve 1 call(s) for setup repair.",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      report: null,
      rawError:
        "Max AI calls reached (3 per run). Generation stopped to reserve 1 call(s) for setup repair. · Parser failed",
    });
    assert.equal(reason, "ai_call_budget_exhausted");
  });

  it("builds specific summary lines instead of generic copy", () => {
    const line = buildRunFailureSummaryLine({
      reason: "build_failed",
      rawError: "Build failed — npm run build — exit 1 — TS2304",
      failedStage: "Build",
      filesModified: [],
    });
    assert.match(line, /Build failed/);
    assert.match(line, /No files were changed/);
    assert.doesNotMatch(line, /could not be completed/i);
  });

  it("derives failure details with missing files and next steps", () => {
    const details = deriveRunFailureDetails({
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        provider: "gemini",
        model: "gemini-2.5-pro",
        debug: {
          stage: "greenfield:generate / parse",
          requestStartedAt: new Date().toISOString(),
          elapsedMs: 1200,
          errorMessage: "Parser found 2 of 7 required files.",
          markerAudit: {
            requiredFiles: [
              "package.json",
              "index.html",
              "src/main.tsx",
              "tsconfig.json",
              "vite.config.ts",
              "src/index.css",
              "src/App.tsx",
            ],
            detectedFileStarts: ["package.json", "index.html"],
            detectedFileEnds: ["package.json", "index.html"],
            completeMarkerPairs: ["package.json", "index.html"],
            missingFiles: [
              "src/main.tsx",
              "tsconfig.json",
              "vite.config.ts",
              "src/index.css",
              "src/App.tsx",
            ],
            rawResponsePreview: "@@FILE:package.json@@\n{}\n@@END:package.json@@",
            promptCharCount: 50,
            promptSent: "",
            hasExampleOutputFormat: true,
            explicitlyRequiresAllSeven: true,
          },
        },
        entries: [
          {
            id: "e3",
            stage: "parser",
            status: "failed",
            message: "Parser failed",
            details: "Parser found 2 of 7 required files.",
            timestamp: new Date().toISOString(),
          },
        ],
      },
      overallFailed: true,
      durationMs: 4500,
    });

    assert.ok(details);
    assert.equal(details!.reason, "parser_missing_files");
    assert.equal(details!.filesParsed, 2);
    assert.ok(details!.missingFiles.length > 0);
    assert.ok(details!.whatToTryNext.length > 0);
    assert.match(details!.summaryLine, /Missing required files/i);
  });

  it("suggests parser recovery steps", () => {
    const tips = suggestRunFailureNextSteps("parser_zero_files", {
      missingFiles: [],
      failedStage: "Parser",
      provider: "gemini",
      rawErrorMessage: "Parser found 0 files",
    });
    assert.ok(tips.some((tip) => /@@FILE|FILE:/i.test(tip)));
  });
});
