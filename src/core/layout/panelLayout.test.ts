import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  layoutForAgentFocus,
  PANEL_LAYOUT_DEFAULTS,
} from "@/core/layout/panelLayout";

describe("layoutForAgentFocus", () => {
  it("does not oscillate when the column width is still 0", () => {
    const next = layoutForAgentFocus(PANEL_LAYOUT_DEFAULTS, 0);
    assert.equal(next.agentFocusMode, true);
    assert.equal(next.leftWidth, PANEL_LAYOUT_DEFAULTS.leftWidth);
  });
});
