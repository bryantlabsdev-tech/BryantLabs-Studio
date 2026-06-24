import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLY_PLAN_ZERO_PROPOSALS_MESSAGE,
  buildPlanApplyProposalDiagnostics,
  classifyPlanApplyProposalReason,
} from "@/core/planApply/proposalDiagnostics";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

describe("classifyPlanApplyProposalReason", () => {
  it("classifies no changes", () => {
    const file: PlanApplyFileEntry = {
      relPath: "src/App.tsx",
      absPath: "/p/src/App.tsx",
      selectionReason: "entry",
      planReason: "ui",
      status: "ready",
      decision: "rejected",
      diffStats: { added: 0, removed: 0, changed: false },
    };
    assert.equal(
      classifyPlanApplyProposalReason(file),
      "No changes produced",
    );
  });
});

describe("buildPlanApplyZeroProposalsReport", () => {
  it("uses required root cause message", async () => {
    const { buildApplyPlanZeroProposalsReport } = await import(
      "@/core/diagnostics/failureReport"
    );
    const report = buildApplyPlanZeroProposalsReport({
      diagnostics: [{ path: "src/App.tsx", reason: "Model failed" }],
    });
    assert.equal(report.rootCauseLine, APPLY_PLAN_ZERO_PROPOSALS_MESSAGE);
  });

  it("includes selectedFiles and patchTargets in stage detail", async () => {
    const { buildApplyPlanZeroProposalsReport } = await import(
      "@/core/diagnostics/failureReport"
    );
    const report = buildApplyPlanZeroProposalsReport({
      diagnostics: [{ path: "src/App.tsx", reason: "No changes produced" }],
      selectedFiles: ["src/App.tsx"],
      patchTargets: ["src/App.tsx"],
      plannerOutput: "Plan summary text",
    });
    const detail = report.stages[0]?.detail ?? "";
    assert.match(detail, /Selected files:/);
    assert.match(detail, /Patch targets:/);
    assert.match(detail, /Plan summary text/);
  });
});

describe("buildPlanApplyProposalDiagnostics", () => {
  it("includes skipped collection entries", () => {
    const diagnostics = buildPlanApplyProposalDiagnostics(
      [],
      ["package.json: blocked"],
    );
    assert.ok(diagnostics.some((d) => d.path === "package.json"));
  });
});
