import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUiAuditFailureDiagnostics } from "@/core/greenfield/uiAudit/diagnostics";
import { evaluateUiAudit } from "@/core/greenfield/uiAudit/evaluate";
import type { UiDomSnapshot, UiLayoutClassification } from "@/core/greenfield/uiAudit/types";

const classification: UiLayoutClassification = {
  type: "grid_layout",
  confidence: 88,
  signals: ["grid_layout"],
};

function gridSnapshot(cellCount: number, boardFound = true): UiDomSnapshot {
  const cells = Array.from({ length: cellCount }, () => ({ width: 32, height: 32 }));
  return {
    viewport: { width: 900, height: 900 },
    controls: [
      { width: 40, height: 40, visible: true, top: 0, left: 0, tag: "button" },
      { width: 40, height: 40, visible: true, top: 0, left: 48, tag: "button" },
      { width: 40, height: 40, visible: true, top: 0, left: 96, tag: "button" },
    ],
    grid: boardFound
      ? {
          width: 360,
          height: 360,
          cellCount,
          cells,
          hasRowWrappers: false,
        }
      : null,
    form: null,
    table: null,
    chat: null,
    calculator: null,
    dashboardPanels: [],
    horizontalOverflow: false,
    rootHasContent: true,
  };
}

describe("buildUiAuditFailureDiagnostics", () => {
  it("maps insufficient_cells to expected vs detected counts for puzzle grids", () => {
    const audit = evaluateUiAudit(
      "grid_layout",
      gridSnapshot(72),
      classification,
      "generated_app",
      true,
    );
    const diagnostics = buildUiAuditFailureDiagnostics(audit);
    assert.ok(diagnostics);
    assert.equal(diagnostics!.title, "Generated App UI Audit: Grid Layout Failure");
    assert.match(diagnostics!.reason, /Expected 81 visible cells but detected 72/);
    assert.match(
      diagnostics!.suggestedFix,
      /Ensure enough visible cells or rows render/i,
    );
    assert.equal(diagnostics!.rawIssueCodes.includes("insufficient_cells"), true);
    assert.match(diagnostics!.rawDetails, /insufficient_cells/);
  });

  it("uses Board Not Found title when grid board is missing", () => {
    const audit = evaluateUiAudit("grid_layout", gridSnapshot(0, false), classification);
    const diagnostics = buildUiAuditFailureDiagnostics(audit);
    assert.ok(diagnostics);
    assert.equal(diagnostics!.title, "Generated App UI Audit: Board Not Found");
    assert.match(diagnostics!.reason, /No recognizable grid layout detected/i);
    assert.match(diagnostics!.suggestedFix, /layout container renders before the preview snapshot/i);
  });
});
