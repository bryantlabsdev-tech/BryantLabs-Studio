import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  buildApplyPlanContextPackage,
  compressContextPackage,
  enforceContextTokenBudget,
  extractClassNamesFromSource,
} from "@/core/contextEngine";
import { buildApplyPlanBatchPatchPrompt } from "@/core/planApply/applyPlanPrompt";
import {
  isProviderDegraded,
  recordProviderCircuitFailure,
  resetProviderCircuit,
} from "@/core/providers/circuitBreaker";
import {
  classifyReliabilityFromError,
  isRetryableReliabilityStatus,
  shouldCountTowardCircuitBreaker,
} from "@/core/providers/reliability";
import { partitionSummaryErrors } from "@/core/studioRun/summaryErrors";
import type { ProjectScan } from "@/types";

function mockScan(): ProjectScan {
  return {
    root: "/proj",
    files: [
      { path: "src/App.tsx", absPath: "/proj/src/App.tsx" },
      { path: "src/index.css", absPath: "/proj/src/index.css" },
    ],
    folders: [],
    symbols: [],
    dependencies: [],
    index: {},
    symbolGraph: { nodes: [], edges: [] },
    repositoryStats: {},
    repositorySummary: "demo react app",
    scannedAt: new Date().toISOString(),
    summary: {
      name: "demo",
      framework: "react",
      language: "typescript",
      packageManager: "npm",
      totalFiles: 2,
      totalFolders: 0,
      entryPoints: ["src/main.tsx"],
    },
  } as unknown as ProjectScan;
}

const APP_TSX = `export default function App() {
  return <div className="sudoku-board premium-grid"><button className="cell">1</button></div>;
}`;

const INDEX_CSS = "body { margin: 0; }\n.sudoku-board { display: grid; }";

describe("context engine", () => {
  beforeEach(() => {
    resetProviderCircuit();
  });

  it("UI edit includes only CSS file content plus App class names in notes", () => {
    const pkg = buildApplyPlanContextPackage({
      userPrompt: "Make the Sudoku app more premium",
      planSummary: "Polish Sudoku UI styling",
      taskType: "ui_edit",
      scan: mockScan(),
      patchFiles: [
        { path: "src/App.tsx", content: APP_TSX },
        { path: "src/index.css", content: INDEX_CSS },
      ],
      uiAuditSummary: "type=grid_layout score=72 issues=2",
    });

    assert.equal(pkg.taskType, "ui_edit");
    assert.deepEqual(pkg.includedFiles, ["src/index.css"]);
    assert.ok(pkg.contextNotes.includes("sudoku-board"));
    assert.ok(pkg.contextNotes.includes("cell"));
    assert.ok(pkg.promptPreview.includes(INDEX_CSS));
    assert.ok(!pkg.promptPreview.includes("export default function App"));
    assert.equal(pkg.intelligenceBlock, "");
  });

  it("oversized prompt compresses before request", () => {
    const pkg = buildApplyPlanContextPackage({
      userPrompt: "Make premium",
      taskType: "ui_edit",
      scan: mockScan(),
      patchFiles: [
        { path: "src/App.tsx", content: APP_TSX },
        { path: "src/index.css", content: INDEX_CSS },
      ],
    });
    const inflated = {
      ...pkg,
      estimatedTokens: 12_000,
      promptPreview: "x".repeat(48_000),
    };
    const compressed = compressContextPackage(inflated, 2000);
    assert.ok(compressed.estimatedTokens <= 2000);
    assert.equal(compressed.compressed, true);
  });

  it("prompt too large does not mark provider degraded", () => {
    const status = classifyReliabilityFromError(
      "Prompt tokens limit exceeded: 11726 > 8499",
    );
    assert.equal(status, "request_too_large");
    assert.equal(shouldCountTowardCircuitBreaker(status), false);
    if (shouldCountTowardCircuitBreaker(status)) {
      recordProviderCircuitFailure("groq");
    }
    assert.equal(isProviderDegraded("groq"), false);
  });

  it("retry after token limit uses compressed context", () => {
    const budget = enforceContextTokenBudget({
      input: {
        userPrompt: "Make premium",
        taskType: "ui_edit",
        scan: mockScan(),
        patchFiles: [
          { path: "src/index.css", content: "x".repeat(40_000) },
        ],
        compressed: true,
      },
      provider: "groq",
      stage: "coder",
      userPrompt: "Make premium",
    });
    assert.equal(budget.package.compressed, true);
    assert.ok(budget.withinLimit);
  });

  it("simple premium UI edit stays under 8k tokens", () => {
    const pkg = buildApplyPlanContextPackage({
      userPrompt: "Make the Sudoku app more premium",
      taskType: "ui_edit",
      scan: mockScan(),
      patchFiles: [
        { path: "src/App.tsx", content: APP_TSX },
        { path: "src/index.css", content: INDEX_CSS },
      ],
      uiAuditSummary: "type=grid_layout score=72 issues=2",
    });
    const budget = enforceContextTokenBudget({
      input: {
        userPrompt: pkg.userPrompt,
        taskType: "ui_edit",
        scan: mockScan(),
        patchFiles: [
          { path: "src/App.tsx", content: APP_TSX },
          { path: "src/index.css", content: INDEX_CSS },
        ],
        uiAuditSummary: "type=grid_layout score=72 issues=2",
      },
      provider: "groq",
      stage: "coder",
      userPrompt: pkg.userPrompt,
    });
    assert.ok(budget.withinLimit);
    assert.ok(budget.package.estimatedTokens < 8000);
  });

  it("run summary does not mix unrelated previous failures", () => {
    const partitioned = partitionSummaryErrors({
      latestAction: { status: "success", summary: "ok", at: new Date().toISOString() },
      runResult: "success",
      rawErrors: ["Prompt tokens limit exceeded", "Old build failed"],
    });
    assert.deepEqual(partitioned.errors, []);
    assert.equal(partitioned.previousAttemptErrors.length, 2);
  });

  it("extracts class names from App.tsx", () => {
    const names = extractClassNamesFromSource(APP_TSX);
    assert.ok(names.includes("sudoku-board"));
    assert.ok(names.includes("cell"));
    assert.ok(names.includes("premium-grid"));
  });

  it("request_too_large is not smart-retryable", () => {
    assert.equal(isRetryableReliabilityStatus("request_too_large"), false);
  });

  it("UI edit prompt excludes intelligence block", () => {
    const prompt = buildApplyPlanBatchPatchPrompt({
      userPrompt: "Make premium",
      planSummary: "Polish",
      files: [{ path: "src/index.css", content: INDEX_CSS }],
      mode: "standard",
      contextNotes: "App.tsx classes: sudoku-board, cell",
      uiEditMode: true,
      appClassNames: ["sudoku-board", "cell"],
    });
    assert.ok(prompt.includes("src/index.css"));
    assert.ok(prompt.includes("sudoku-board"));
    assert.ok(!prompt.includes("semantic index"));
    assert.ok(!prompt.includes("package-lock"));
  });
});
