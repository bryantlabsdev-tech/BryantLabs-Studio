import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendUiAuditHistory,
  classifyUiLayout,
  computeUiAuditScore,
  createUiAuditHistoryEntry,
  evaluateUiAudit,
  formatUiAuditHistorySection,
  summarizeUiAuditPatterns,
  validateUiLayout,
} from "@/core/greenfield/uiAudit";
import type { UiDomSnapshot } from "@/core/greenfield/uiAudit";

function baseSnapshot(overrides: Partial<UiDomSnapshot> = {}): UiDomSnapshot {
  return {
    viewport: { width: 390, height: 844 },
    controls: [],
    grid: null,
    form: null,
    table: null,
    chat: null,
    calculator: null,
    dashboardPanels: [],
    horizontalOverflow: false,
    rootHasContent: true,
    ...overrides,
  };
}

describe("uiAudit framework", () => {
  it("classifies form apps from prompt and DOM", () => {
    const snapshot = baseSnapshot({
      form: {
        fieldCount: 4,
        submitVisible: false,
        fields: [
          { width: 200, height: 36, visible: true, top: 10, left: 10, tag: "input" },
          { width: 200, height: 36, visible: true, top: 60, left: 10, tag: "input" },
        ],
      },
    });
    const result = classifyUiLayout(
      "Build a signup form with email and password",
      "<form><input/><button type='submit'>Sign up</button></form>",
      ".form { display:flex; }",
      snapshot,
    );
    assert.equal(result.type, "form_layout");
  });

  it("validates overlapping form controls and hidden submit", () => {
    const snapshot = baseSnapshot({
      form: {
        fieldCount: 2,
        submitVisible: false,
        fields: [
          { width: 200, height: 36, visible: true, top: 10, left: 10, tag: "input" },
          { width: 200, height: 36, visible: true, top: 20, left: 10, tag: "input" },
        ],
      },
      controls: [
        { width: 200, height: 36, visible: true, top: 10, left: 10, tag: "input" },
        { width: 200, height: 36, visible: true, top: 20, left: 10, tag: "input" },
        { width: 120, height: 0, visible: false, top: 0, left: 0, tag: "button" },
      ],
    });
    const issues = validateUiLayout("form_layout", snapshot);
    assert.ok(issues.includes("controls_overlapping"));
    assert.ok(issues.includes("submit_hidden"));
    assert.ok(computeUiAuditScore(issues) < 100);
  });

  it("validates calculator display and keypad sizing", () => {
    const snapshot = baseSnapshot({
      calculator: {
        displayVisible: false,
        displayHeight: 0,
        buttonCount: 12,
        buttonsTooSmall: 6,
      },
    });
    const issues = validateUiLayout("calculator_layout", snapshot);
    assert.ok(issues.includes("display_too_small"));
    assert.ok(issues.includes("buttons_too_small"));
  });

  it("records audit history and summarizes failure patterns", () => {
    const classification = { type: "grid_layout" as const, confidence: 80, signals: [] };
    const failed = evaluateUiAudit(
      "grid_layout",
      baseSnapshot({
        grid: {
          width: 80,
          height: 600,
          cellCount: 81,
          cells: Array.from({ length: 81 }, () => ({ width: 80, height: 6 })),
          hasRowWrappers: true,
        },
      }),
      classification,
    );
    let history = appendUiAuditHistory(
      [],
      createUiAuditHistoryEntry(failed, { repaired: true, strategy: "grid_layout_css" }),
    );
    history = appendUiAuditHistory(
      history,
      createUiAuditHistoryEntry({ ...failed, ok: true, issues: [], score: 100 }),
    );
    const patterns = summarizeUiAuditPatterns(history);
    assert.ok(patterns.length > 0);
    const section = formatUiAuditHistorySection(history, failed);
    assert.ok(section.some((line) => line.includes("UI audit history")));
    assert.ok(section.some((line) => line.includes("Common UI failure patterns")));
  });
});
