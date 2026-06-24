import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advisoryDetailsVisible,
  buildUiAuditAdvisoryDetailLines,
  buildUiAuditAdvisoryFixPrompt,
  formatAdvisoryVerificationCollapsedLabel,
  hasFixableUiAuditAdvisory,
  isUiAuditAdvisoryFixDisabled,
  isUiAuditFixPrompt,
  recommendationForUiAuditIssue,
  recommendationsForUiAuditIssues,
  toggleAdvisoryExpanded,
  uiAuditAdvisoryFixButtonLabel,
  UI_AUDIT_FIX_PROMPT_MARKER,
  UI_AUDIT_GENERIC_RECOMMENDATION,
} from "@/core/agent/uiAuditAdvisoryUx";

describe("uiAuditAdvisoryUx", () => {
  it("maps known issues to recommendations", () => {
    assert.equal(
      recommendationForUiAuditIssue("rows_overflow"),
      "Enable horizontal scrolling on comparison tables under 768px.",
    );
    assert.equal(
      recommendationForUiAuditIssue("insufficient_cells"),
      "Add enough visible layout sections/items for this layout type.",
    );
    assert.equal(
      recommendationForUiAuditIssue("no_board"),
      "Ensure the main layout container is rendered and visible.",
    );
    assert.equal(
      recommendationForUiAuditIssue("labels_missing"),
      UI_AUDIT_GENERIC_RECOMMENDATION,
    );
  });

  it("deduplicates recommendations for repeated issue types", () => {
    assert.deepEqual(
      recommendationsForUiAuditIssues(["rows_overflow", "rows_overflow"]),
      ["Enable horizontal scrolling on comparison tables under 768px."],
    );
  });

  it("uses generic recommendation when there are no issues", () => {
    assert.deepEqual(recommendationsForUiAuditIssues([]), [UI_AUDIT_GENERIC_RECOMMENDATION]);
  });

  it("formats compact collapsed advisory label", () => {
    assert.equal(
      formatAdvisoryVerificationCollapsedLabel("UI Audit", 86),
      "⚠️ UI Audit — Advisory (86)",
    );
  });

  it("toggles expanded state", () => {
    assert.equal(toggleAdvisoryExpanded(false), true);
    assert.equal(toggleAdvisoryExpanded(true), false);
    assert.equal(advisoryDetailsVisible(false), false);
    assert.equal(advisoryDetailsVisible(true), true);
  });

  it("builds detail lines for expanded panel", () => {
    const lines = buildUiAuditAdvisoryDetailLines({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: [
        "Enable horizontal scrolling on comparison tables under 768px.",
      ],
    });

    assert.equal(lines.layout, "table_layout");
    assert.equal(lines.score, 86);
    assert.deepEqual(lines.issues, ["rows_overflow"]);
    assert.match(lines.recommendations[0] ?? "", /horizontal scrolling/);
  });

  it("models click-to-expand as toggle from collapsed default", () => {
    assert.equal(advisoryDetailsVisible(false), false);
    assert.equal(advisoryDetailsVisible(toggleAdvisoryExpanded(false)), true);
    assert.equal(advisoryDetailsVisible(toggleAdvisoryExpanded(true)), false);
  });

  it("shows fix button for rows_overflow advisory with recommendations", () => {
    const advisory = {
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
    };
    assert.equal(hasFixableUiAuditAdvisory(advisory), true);
  });

  it("hides fix button when advisory has no issues", () => {
    assert.equal(
      hasFixableUiAuditAdvisory({
        issues: [],
        recommendations: [],
      }),
      false,
    );
  });

  it("builds follow-up prompt with layout, issue, recommendation, and verification steps", () => {
    const prompt = buildUiAuditAdvisoryFixPrompt({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
    });

    assert.match(prompt, new RegExp(`^${UI_AUDIT_FIX_PROMPT_MARKER}`));
    assert.equal(isUiAuditFixPrompt(prompt), true);
    assert.match(prompt, /Layout: table_layout/);
    assert.match(prompt, /Score: 86/);
    assert.match(prompt, /Issue: rows_overflow/);
    assert.match(prompt, /Enable horizontal scrolling on comparison tables under 768px\./);
    assert.match(prompt, /horizontal scrolling or convert rows into stacked cards/);
    assert.match(prompt, /Preserve desktop layout/);
    assert.match(prompt, /TypeScript, build, preview, and UI audit again/);
  });

  it("disables fix action while agent run is active", () => {
    assert.equal(isUiAuditAdvisoryFixDisabled({ runActive: true }), true);
    assert.equal(isUiAuditAdvisoryFixDisabled({ runActive: false, fixRunning: true }), true);
    assert.equal(isUiAuditAdvisoryFixDisabled({ runActive: false, fixRunning: false }), false);
    assert.equal(uiAuditAdvisoryFixButtonLabel(false), "Fix with AI");
    assert.equal(uiAuditAdvisoryFixButtonLabel(true), "Fixing...");
  });
});

describe("formatExecutionVerificationLabel non-advisory rows", () => {
  it("still renders passed, failed, and skipped labels", async () => {
    const { formatExecutionVerificationLabel } = await import(
      "@/core/agent/executionDashboard"
    );

    assert.match(formatExecutionVerificationLabel("TypeScript", "passed"), /Passed/);
    assert.match(formatExecutionVerificationLabel("Build", "failed"), /Failed/);
    assert.match(formatExecutionVerificationLabel("Preview", "skipped"), /Skipped/);
  });
});
