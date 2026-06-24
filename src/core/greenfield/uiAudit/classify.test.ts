import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyUiLayout,
  evaluateUiAuditFromSources,
  validateGeneratedAppPreviewAuditUrl,
} from "@/core/greenfield/uiAudit";
import type { UiDomSnapshot } from "@/core/greenfield/uiAudit";

function baseSnapshot(overrides: Partial<UiDomSnapshot> = {}): UiDomSnapshot {
  return {
    viewport: { width: 1280, height: 800 },
    controls: [
      { width: 120, height: 36, visible: true, top: 10, left: 10, tag: "button" },
      { width: 200, height: 36, visible: true, top: 60, left: 10, tag: "input" },
      { width: 200, height: 80, visible: true, top: 110, left: 10, tag: "textarea" },
    ],
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

describe("classifyUiLayout generated app targeting", () => {
  it("classifies BuildBoard-style apps as dashboard, not chat, even when Studio prompt mentions messages", () => {
    const snapshot = baseSnapshot({
      dashboardPanels: [
        { width: 280, height: 420 },
        { width: 280, height: 420 },
        { width: 280, height: 420 },
      ],
    });
    const appSource = `
      export function BuildBoard() {
        return (
          <div className="kanban-board">
            <section className="kanban-column card">Todo</section>
            <section className="kanban-column card">Doing</section>
            <section className="kanban-column card">Done</section>
            <textarea placeholder="Add task" />
          </div>
        );
      }
    `;

    const classification = classifyUiLayout(
      "Build a task board and show status messages in the UI",
      appSource,
      ".kanban-board { display:flex; }",
      snapshot,
    );

    assert.equal(classification.type, "dashboard_layout");

    const audit = evaluateUiAuditFromSources(
      "Build a task board and show status messages in the UI",
      appSource,
      ".kanban-board { display:flex; }",
      snapshot,
    );

    assert.notEqual(audit.type, "chat_layout");
    assert.equal(audit.issues.includes("messages_hidden"), false);
    assert.equal(audit.issues.includes("input_hidden"), false);
  });

  it("requires explicit chat DOM before classifying chat layout", () => {
    const snapshot = baseSnapshot({
      chat: {
        messageCount: 2,
        inputVisible: true,
        threadHeight: 320,
      },
    });

    const classification = classifyUiLayout(
      "ignore studio prompt",
      "<div class='chat-messages'><div class='chat-message'/></div>",
      "",
      snapshot,
    );

    assert.equal(classification.type, "chat_layout");
  });
});

describe("validateGeneratedAppPreviewAuditUrl", () => {
  it("accepts local preview URLs and rejects missing values", () => {
    assert.equal(validateGeneratedAppPreviewAuditUrl(null).ok, false);
    assert.equal(validateGeneratedAppPreviewAuditUrl("").ok, false);
    assert.equal(validateGeneratedAppPreviewAuditUrl("file:///index.html").ok, false);

    const valid = validateGeneratedAppPreviewAuditUrl("http://localhost:4173/");
    assert.equal(valid.ok, true);
    assert.match(valid.normalizedUrl ?? "", /127\.0\.0\.1:4173/);
  });
});
