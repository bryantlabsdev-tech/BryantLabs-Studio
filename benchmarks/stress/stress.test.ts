import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyStressFailure } from "./failureClassification";
import { matchDeterministicRepairCandidate } from "./deterministicRepairCatalog";
import { buildImprovementSuggestions } from "./improvementSuggestions";
import { formatStressReportMarkdown } from "./reporter";
import { runDryStressChecks } from "./runStressCase";
import { STRESS_PROMPTS } from "./prompts";
import type { StressSuiteResult } from "./types";

describe("greenfield stress harness", () => {
  it("defines 10 hard stress prompts", () => {
    assert.equal(STRESS_PROMPTS.length, 10);
    const ids = new Set(STRESS_PROMPTS.map((p) => p.id));
    assert.equal(ids.size, 10);
  });

  it("dry-run passes manifest routing for all 10 prompts", () => {
    const results = STRESS_PROMPTS.map((p) => ({ id: p.id, ...runDryStressChecks(p) }));
    const failed = results.filter((r) => !r.ok);
    assert.equal(
      failed.length,
      0,
      `Failed dry-run: ${failed.map((f) => `${f.id} pages=${f.pageCount}`).join(", ")}`,
    );
  });

  it("classifies TS2739 as missing required type fields", () => {
    const cls = classifyStressFailure({
      generationOk: true,
      installOk: true,
      typecheckOk: false,
      buildOk: false,
      uiAuditOk: true,
      timedOut: false,
      repairExhausted: false,
      diagnostics: [
        {
          file: "src/pages/Dashboard.tsx",
          line: 4,
          column: 3,
          code: "TS2739",
          message:
            "Type '{ id: string; }' is missing the following properties from type 'Driver': email, phone",
          category: "error",
          raw: "",
        },
      ],
      buildOutput: "",
      generationError: null,
      missingFiles: [],
      uiAuditIssues: [],
    });
    assert.equal(cls, "missing_required_type_fields");
  });

  it("matches deterministic repair for TS2739", () => {
    const match = matchDeterministicRepairCandidate({
      file: "src/pages/Dashboard.tsx",
      line: 4,
      column: 3,
      code: "TS2739",
      message:
        "Type '{ id: string; }' is missing the following properties from type 'Driver': email, phone",
      category: "error",
      raw: "",
    });
    assert.equal(match?.id, "missing_object_properties");
    assert.equal(match?.available, true);
  });

  it("classifies TS1109 truncation vs marker artifacts", () => {
    const truncated = matchDeterministicRepairCandidate(
      {
        file: "src/pages/Inspections.tsx",
        line: 16,
        column: 8,
        code: "TS1109",
        message: "Expression expected.",
        category: "error",
        raw: "",
      },
      { lineContent: '  { id:...' },
    );
    assert.equal(truncated?.id, "truncated_literal_repair");
    assert.equal(truncated?.available, false);

    const marker = matchDeterministicRepairCandidate(
      {
        file: "src/pages/Foo.tsx",
        line: 1,
        column: 1,
        code: "TS1109",
        message: "Expression expected.",
        category: "error",
        raw: "",
      },
      { lineContent: "@@END:src/pages/Foo.tsx@@" },
    );
    assert.equal(marker?.id, "marker_artifact_strip");
    assert.equal(marker?.available, true);
  });

  it("builds improvement suggestions with deterministic candidate", () => {
    const suggestions = buildImprovementSuggestions({
      failureClass: "missing_required_type_fields",
      diagnostics: [
        {
          file: "src/pages/Dashboard.tsx",
          line: 4,
          column: 3,
          code: "TS2739",
          message:
            "Type '{ id: string; }' is missing the following properties from type 'Driver': email, phone",
          category: "error",
          raw: "",
        },
      ],
      repairExhausted: true,
      deterministicPasses: 2,
      primaryErrorLine: "TS2739",
      llmAttempts: 2,
    });
    assert.ok(suggestions[0]?.deterministicRepairCandidate);
    assert.match(suggestions[0]?.recommendedStudioFix ?? "", /missingPropertyRepair/i);
  });

  it("renders markdown stress report", () => {
    const sample: StressSuiteResult = {
      version: 1,
      mode: "dry-run",
      startedAt: "2026-06-22T00:00:00.000Z",
      finishedAt: "2026-06-22T00:01:00.000Z",
      durationMs: 60000,
      provider: "gemini",
      model: "gemini-2.5-pro",
      suiteId: "fast",
      suiteTarget: { promptCount: 5, passTarget: 4, successRateTarget: 0.8 },
      runs: [
        {
          promptId: "fleetops-pro",
          promptName: "FleetOps Pro",
          targetFolder: "/tmp/stress/fleetops-pro",
          provider: "gemini",
          model: "gemini-2.5-pro",
          durationMs: 1200,
          filesGenerated: 0,
          typescript: "not_run",
          build: "not_run",
          preview: "not_run",
          uiAudit: "not_run",
          runtimeSmoke: "not_run",
          runtimeSmokeDetails: null,
          repairAttempts: [],
          repairTokenUsage: {
            deterministicPasses: 0,
            llmAttempts: 0,
            estimatedInputTokens: 0,
            estimatedOutputTokens: 0,
          },
          repairFailureReason: null,
          failureClass: null,
          finalStatus: "success",
          primaryErrorLine: null,
          suggestions: [],
          fixNeeded: null,
        },
      ],
      successRate: 1,
      averageDurationMs: 1200,
      averageRepairAttempts: 0,
      topFailureClasses: [],
      topDeterministicOpportunities: [],
      estimatedScoreChange: 5,
    };
    const md = formatStressReportMarkdown(sample);
    assert.match(md, /FleetOps Pro/);
    assert.match(md, /Score:/);
    assert.match(md, /Fast validation \(5 prompts\)/);
    assert.match(md, /\| Prompt \| Status \|/);
  });
});
